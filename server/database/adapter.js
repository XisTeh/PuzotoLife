import { AsyncLocalStorage } from 'node:async_hooks';
import { postgresQuery } from './sql.js';

// One checked-out connection per transaction; no synchronous network bridge.
export function createAdapter({ dialect, acquire, close, serialize = dialect === 'sqlite' }) {
  const context = new AsyncLocalStorage();
  let queue = Promise.resolve();
  let savepoint = 0;
  async function lease(fn) {
    const active = context.getStore();
    if (active) return fn(active);
    const execute = async () => {
      const client = await acquire();
      try { return await context.run(client, () => fn(client)); }
      finally { await client.release?.(); }
    };
    // SQLite has a single connection. Do not interleave work inside its transactions.
    if (!serialize) return execute();
    const next = queue.then(execute, execute);
    queue = next.catch(() => {});
    return next;
  }
  async function command(client, sql) {
    // PGlite exposes simple-query batches through exec; pg uses query without parameters.
    return client.exec ? client.exec(sql) : client.query(sql);
  }
  async function transaction(fn, { nested = false, readOnly = false } = {}) {
    if (context.getStore()?.puzotoReadOnly && !readOnly) throw new Error('Uma consulta de leitura não pode iniciar gravações.');
    if (context.getStore()?.puzotoTransaction && !nested) return fn();
    return lease(async client => {
      const inside = client.puzotoTransaction;
      const wasReadOnly = client.puzotoReadOnly;
      const name = `sp_${++savepoint}`;
      const begin = inside ? `SAVEPOINT ${name}` : dialect === 'sqlite'
        ? (readOnly ? 'BEGIN' : 'BEGIN IMMEDIATE')
        : `${readOnly ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN'};
          SET LOCAL search_path = puzoto, pg_catalog;
          SET LOCAL statement_timeout = '15s';
          SET LOCAL lock_timeout = '5s';
          ${readOnly ? '' : 'SELECT pg_advisory_xact_lock(782364901);'}`;
      try {
        // One round trip, still ordered: acquire the owner lock BEFORE domain reads.
        // No user values enter this batch. Parameterized domain SQL stays separate.
        await command(client, begin);
        client.puzotoTransaction = true;
        client.puzotoReadOnly = readOnly;
        const result = await fn();
        await command(client, inside ? `RELEASE SAVEPOINT ${name}` : 'COMMIT');
        return result;
      } catch (error) {
        await command(client, inside ? `ROLLBACK TO SAVEPOINT ${name}` : 'ROLLBACK');
        if (inside) await command(client, `RELEASE SAVEPOINT ${name}`);
        throw error;
      } finally { client.puzotoTransaction = inside; client.puzotoReadOnly = wasReadOnly; }
    });
  }
  async function query(source, args, mode) {
    const execute = async () => lease(async client => {
      if (dialect === 'sqlite') {
        const result = client.prepare(source)[mode](...args);
        return mode === 'run' ? { changes: result.changes, lastInsertRowid: Number(result.lastInsertRowid) } : result;
      }
      const { text, values } = postgresQuery(source, args, mode);
      const result = await client.query(text, values);
      if (mode === 'get') return result.rows[0];
      if (mode === 'run') return { changes: result.rowCount ?? result.affectedRows ?? 0, lastInsertRowid: result.rows[0]?.id ?? 0 };
      return result.rows;
    });
    // Ensures search_path/timeouts for isolated statements too.
    return dialect === 'postgres' && !context.getStore()?.puzotoTransaction
      ? transaction(execute, { readOnly: mode !== 'run' }) : execute();
  }
  return {
    dialect,
    prepare(source) { return Object.fromEntries(['all', 'get', 'run'].map(mode => [mode, (...args) => query(source, args, mode)])); },
    transaction: fn => (...args) => transaction(() => fn(...args), { nested: true }),
    atomic: fn => transaction(fn),
    snapshot: fn => transaction(fn, { readOnly: true }),
    exclusive: fn => lease(fn),
    backup: destination => lease(client => {
      if (dialect !== 'sqlite') throw new Error('Backup PostgreSQL exige o procedimento de backup do Supabase.');
      return client.backup(destination);
    }),
    close,
  };
}
