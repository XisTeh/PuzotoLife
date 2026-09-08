import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { initializeDatabase } from '../../server/database/init.js';
import { getLocalDatabase, closeDatabase, useTestDatabase } from '../../server/database/connection.js';
import { createAdapter } from '../../server/database/adapter.js';
import pgDriver from 'pg';
import { randomUUID } from 'node:crypto';

async function testPostgresEngine() {
  if (!process.env.TEST_POSTGRES_URL) {
    const pg = new PGlite();
    return { pg, serialize: true, acquire: async () => pg, close: () => pg.close() };
  }
  const url = new URL(process.env.TEST_POSTGRES_URL);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('Testes jamais acessam PostgreSQL remoto.');
  const admin = new pgDriver.Client({ connectionString: url.toString() });
  await admin.connect();
  const name = `puzoto_test_${randomUUID().replaceAll('-', '')}`;
  // Cluster-wide role creation is serialized across Node test processes.
  await admin.query('BEGIN; SELECT pg_advisory_xact_lock(782364902)');
  await admin.query("DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF; IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF; IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='puzoto_runtime') THEN CREATE ROLE puzoto_runtime NOLOGIN NOBYPASSRLS; END IF; END $$");
  await admin.query('COMMIT');
  await admin.query(`CREATE DATABASE ${name}`);
  url.pathname = `/${name}`;
  const numberParser = (oid, format) => [20, 1700].includes(oid) ? Number : pgDriver.types.getTypeParser(oid, format);
  const pool = new pgDriver.Pool({ connectionString: url.toString(), max: 5, types: { getTypeParser: numberParser } });
  const setup = await pool.connect();
  return {
    pg: { exec: sql => setup.query(sql), query: (sql, args) => setup.query(sql, args) },
    serialize: false,
    ready: () => setup.release(),
    acquire: async () => { const client = await pool.connect(); await client.query('SET ROLE puzoto_runtime'); return client; },
    close: async () => { await pool.end(); await admin.query(`DROP DATABASE ${name}`); await admin.end(); },
  };
}

export async function initializeTestDatabase(engine = 'sqlite') {
  if (process.env.NODE_ENV !== 'test' || !process.env.PUZOTO_LIFE_DB_PATH) throw new Error('Teste requer banco temporário explícito.');
  process.env.PUZOTO_DATABASE = 'sqlite';
  initializeDatabase();
  if (engine === 'sqlite') return;
  const raw = getLocalDatabase();
  const names = raw.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
  const data = names.map(({ name }) => [name, raw.prepare(`SELECT * FROM "${name}"`).all()]);
  await closeDatabase();
  const engineInstance = await testPostgresEngine();
  const { pg } = engineInstance;
  if (!process.env.TEST_POSTGRES_URL) await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
  await pg.exec(fs.readFileSync('supabase/migrations/202609040001_legacy_structure.sql', 'utf8'));
  await pg.exec(fs.readFileSync('supabase/migrations/202609040002_runtime_role.sql', 'utf8'));
  await pg.exec('BEGIN; SET search_path = puzoto, pg_catalog; SET CONSTRAINTS ALL DEFERRED;');
  for (const [name, rows] of data) {
    for (const row of rows) {
      const columns = Object.keys(row);
      await pg.query(`INSERT INTO "${name}" (${columns.map(c => `"${c}"`).join(',')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(',')})`, Object.values(row));
    }
    if (rows[0]?.id !== undefined) await pg.query(`SELECT setval(pg_get_serial_sequence('puzoto.${name}', 'id'), (SELECT max(id) FROM "${name}"))`);
  }
  await pg.exec('COMMIT; SET ROLE puzoto_runtime;');
  engineInstance.ready?.();
  process.env.PUZOTO_DATABASE = 'postgres';
  useTestDatabase(createAdapter({ dialect: 'postgres', ...engineInstance }));
}
