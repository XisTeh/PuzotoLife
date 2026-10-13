import fs from 'node:fs';
import crypto from 'node:crypto';
import pg from 'pg';
import { PGlite } from '@electric-sql/pglite';

// One-off, owner-run migration. The complete pre-change copy stays under .git/.
if (fs.existsSync('.env')) process.loadEnvFile('.env');
if (process.argv[2] !== '--apply') throw new Error('Use --apply após revisão e CI aprovado.');
const url = new URL(process.env.SUPABASE_DB_URL || '');
if (!/\.(supabase\.co|supabase\.com)$/.test(url.hostname) || !url.username.startsWith('postgres')) throw new Error('Destino administrativo Supabase inválido.');
const ssl = {
  rejectUnauthorized: true,
  ...(process.env.SUPABASE_DB_CA_CERT ? { ca: process.env.SUPABASE_DB_CA_CERT.replaceAll('\\n', '\n') }
    : process.env.SUPABASE_DB_CA_FILE ? { ca: fs.readFileSync(process.env.SUPABASE_DB_CA_FILE, 'utf8') } : {}),
};
const tables = JSON.parse(fs.readFileSync('supabase/schema-manifest.json', 'utf8')).tables;
const quoted = name => {
  if (!/^[a-z_]+$/.test(name)) throw new Error('Identificador fora do manifesto.');
  return `"${name}"`;
};
const orderColumn = table => table.columns.some(column => column.name === 'id') ? 'id' : 'chave';
const fingerprint = (rows, columns) => crypto.createHash('sha256').update(JSON.stringify(rows.map(row => columns.map(column => {
  const value = row[column.name];
  return value == null ? null : ['INTEGER', 'REAL'].includes(column.type) ? Number(value) : String(value);
})))).digest('hex');
const client = new pg.Client({ connectionString: url.toString(), ssl, connectionTimeoutMillis: 10_000 });
let local;
try {
  await client.connect();
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const snapshot = [];
  for (const table of tables) {
    const { rows } = await client.query(`SELECT * FROM puzoto.${quoted(table.name)} ORDER BY ${quoted(orderColumn(table))}`);
    snapshot.push({ table: table.name, rows });
  }
  const invalidFk = await client.query("SELECT COUNT(*)::int AS n FROM pg_constraint WHERE connamespace = 'puzoto'::regnamespace AND contype = 'f' AND NOT convalidated");
  const rls = await client.query("SELECT COUNT(*)::int AS n FROM pg_class JOIN pg_namespace ON pg_namespace.oid = relnamespace WHERE nspname = 'puzoto' AND relkind = 'r' AND relrowsecurity AND relforcerowsecurity");
  await client.query('COMMIT');
  if (invalidFk.rows[0].n !== 0 || rls.rows[0].n !== tables.length) throw new Error('Integridade ou RLS incompatível.');

  const backupPath = `.git/private-loan-migration-${new Date().toISOString().replaceAll(/[:.]/g, '-')}.json`;
  fs.writeFileSync(backupPath, JSON.stringify(snapshot), { flag: 'wx', mode: 0o600 });
  const backupHash = crypto.createHash('sha256').update(fs.readFileSync(backupPath)).digest('hex');

  local = new PGlite();
  await local.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
  await local.exec(fs.readFileSync('supabase/migrations/202609040001_legacy_structure.sql', 'utf8'));
  await local.exec(fs.readFileSync('supabase/migrations/202610130001_loan_date.sql', 'utf8'));
  await local.exec('BEGIN; SET search_path = puzoto, pg_catalog; SET CONSTRAINTS ALL DEFERRED;');
  for (let index = 0; index < tables.length; index++) {
    const table = tables[index];
    const rows = snapshot[index].rows;
    if (!rows.length) continue;
    const columns = Object.keys(rows[0]);
    const sql = `INSERT INTO ${quoted(table.name)} (${columns.map(quoted).join(',')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(',')})`;
    for (const row of rows) await local.query(sql, columns.map(column => row[column]));
  }
  await local.exec('COMMIT;');
  for (let index = 0; index < tables.length; index++) {
    const table = tables[index];
    const { rows } = await local.query(`SELECT * FROM puzoto.${quoted(table.name)} ORDER BY ${quoted(orderColumn(table))}`);
    if (rows.length !== snapshot[index].rows.length || fingerprint(rows, table.columns) !== fingerprint(snapshot[index].rows, table.columns)) throw new Error('Restauração local não reproduziu contagens e valores.');
  }
  await local.close();
  local = null;

  await client.query('BEGIN');
  await client.query("SET LOCAL statement_timeout = '60s'");
  await client.query("SET LOCAL lock_timeout = '5s'");
  // The runtime uses this lock for every write. Abort if anything changed since the copy.
  await client.query('SELECT pg_advisory_xact_lock(782364901)');
  for (let index = 0; index < tables.length; index++) {
    const table = tables[index];
    const { rows } = await client.query(`SELECT * FROM puzoto.${quoted(table.name)} ORDER BY ${quoted(orderColumn(table))}`);
    if (rows.length !== snapshot[index].rows.length || fingerprint(rows, table.columns) !== fingerprint(snapshot[index].rows, table.columns)) throw new Error('Acervo mudou após a cópia privada; reinicie a migração.');
  }
  await client.query(fs.readFileSync('supabase/migrations/202610130001_loan_date.sql', 'utf8'));
  for (let index = 0; index < tables.length; index++) {
    const table = tables[index];
    const { rows } = await client.query(`SELECT * FROM puzoto.${quoted(table.name)} ORDER BY ${quoted(orderColumn(table))}`);
    if (rows.length !== snapshot[index].rows.length || fingerprint(rows, table.columns) !== fingerprint(snapshot[index].rows, table.columns)) throw new Error('A migração alterou registros existentes.');
  }
  const columns = await client.query("SELECT table_name FROM information_schema.columns WHERE table_schema = 'puzoto' AND column_name = 'data_emprestimo'");
  if (columns.rows.length !== 2) throw new Error('Colunas novas ausentes.');
  await client.query('COMMIT');
  console.log(JSON.stringify({ migrated: true, tables: tables.length, rows: snapshot.reduce((sum, table) => sum + table.rows.length, 0), restored: true, unchanged: true, backupSha256: backupHash }));
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error(`Migração não confirmada; tipo=${error?.constructor?.name || 'Error'} código=${error?.code || 'none'}`);
  process.exitCode = 1;
} finally {
  await local?.close().catch(() => {});
  await client.end().catch(() => {});
}
