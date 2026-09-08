import fs from 'node:fs';
import { initializeDatabase } from './init.js';
import { databaseDialect, getDatabase } from './connection.js';

export async function initializeStorage() {
  if (databaseDialect() === 'sqlite') return initializeDatabase();
  const db = getDatabase();
  // Startup validates; it NEVER creates tables, seeds or imports personal data remotely.
  return db.snapshot(async () => {
    const role = await db.prepare('SELECT current_user AS name').get();
    if (role.name !== 'puzoto_runtime') throw new Error('Papel de runtime inválido.');
    const privileges = await db.prepare('SELECT rolsuper, rolbypassrls, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = current_user').get();
    if (Object.values(privileges).some(Boolean)) throw new Error('Papel de runtime tem privilégios excessivos.');
    const expected = JSON.parse(fs.readFileSync(new URL('../../supabase/schema-manifest.json', import.meta.url), 'utf8'));
    for (const table of expected.tables) {
      const columns = await db.prepare(`PRAGMA table_info(${table.name})`).all();
      if (columns.map(c => c.name).join(',') !== table.columns.map(c => c.name).join(',')) throw new Error('Schema remoto incompatível. Aplique e valide as migrações antes de iniciar.');
    }
    const tables = await db.prepare("SELECT relname FROM pg_class JOIN pg_namespace ON pg_namespace.oid = relnamespace WHERE nspname = 'puzoto' AND relkind = 'r' AND relrowsecurity AND relforcerowsecurity").all();
    if (tables.length !== expected.tables.length) throw new Error('RLS obrigatório ausente.');
  });
}
