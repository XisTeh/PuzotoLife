import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('schema PostgreSQL cria 23 tabelas com RLS e nega clientes anônimos', async () => {
  const db = new PGlite();
  try {
    await db.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
    await db.exec(fs.readFileSync('supabase/migrations/202609040001_legacy_structure.sql', 'utf8'));
    const result = await db.query("SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class JOIN pg_namespace ON pg_namespace.oid = relnamespace WHERE nspname = 'puzoto' AND relkind = 'r'");
    assert.equal(result.rows.length, 23);
    assert.ok(result.rows.every((row) => row.relrowsecurity && row.relforcerowsecurity));
    await db.exec('SET ROLE anon;');
    await assert.rejects(() => db.query('SELECT * FROM puzoto.empresas'), /permission denied/);
    await db.exec('RESET ROLE; SET ROLE authenticated;');
    await assert.rejects(() => db.query('SELECT * FROM puzoto.empresas'), /permission denied/);
  } finally { await db.close(); }
});
