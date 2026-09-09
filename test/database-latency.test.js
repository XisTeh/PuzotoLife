import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdapter } from '../server/database/adapter.js';

function fixture(failSetup = false) {
  const calls = [];
  const client = {
    async query(sql, values) {
      calls.push({ sql, values });
      if (failSetup && sql.startsWith('BEGIN')) throw new Error('setup failed');
      return { rows: [{ id: 1 }], rowCount: 1 };
    },
    release() { calls.push({ sql: 'release' }); },
  };
  return { calls, db: createAdapter({ dialect: 'postgres', acquire: async () => client }) };
}

test('uma leitura PostgreSQL usa três viagens e preserva snapshot e timeouts', async () => {
  const { calls, db } = fixture();
  await db.snapshot(async () => {
    await assert.rejects(() => db.atomic(async () => {}), /leitura não pode iniciar gravações/);
    assert.equal((await db.prepare('SELECT ? AS id').get(1)).id, 1);
  });
  assert.equal(calls.length, 4); // setup, SELECT, COMMIT, release (local)
  assert.match(calls[0].sql, /^BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;/);
  assert.match(calls[0].sql, /SET LOCAL search_path = puzoto, pg_catalog/);
  assert.match(calls[0].sql, /statement_timeout = '15s'/);
  assert.match(calls[0].sql, /lock_timeout = '5s'/);
  assert.doesNotMatch(calls[0].sql, /pg_advisory/);
  assert.deepEqual(calls[1], { sql: 'SELECT $1 AS id', values: [1] });
  assert.equal(calls[2].sql, 'COMMIT');
});

test('gravação aguarda lock antes do SQL parametrizado e confirma em três viagens', async () => {
  const { calls, db } = fixture();
  const payload = "'; DROP TABLE synthetic; --";
  await db.atomic(() => db.prepare('INSERT INTO synthetic (value) VALUES (?)').run(payload));
  assert.equal(calls.length, 4);
  assert.match(calls[0].sql, /lock_timeout = '5s';\s+SELECT pg_advisory_xact_lock\(782364901\)/);
  assert.doesNotMatch(calls[0].sql, /DROP TABLE/);
  assert.deepEqual(calls[1].values, [payload]);
  assert.equal(calls[2].sql, 'COMMIT');
});

test('falha na configuração reverte a transação antes de devolver a conexão', async () => {
  const { calls, db } = fixture(true);
  await assert.rejects(() => db.atomic(() => assert.fail('não deve executar domínio')), /setup failed/);
  assert.deepEqual(calls.slice(1).map(call => call.sql), ['ROLLBACK', 'release']);
});
