import fs from 'node:fs';
import { initializeDatabase } from './init.js';
import { databaseDialect, getDatabase } from './connection.js';

export async function initializeStorage() {
  if (databaseDialect() === 'sqlite') return initializeDatabase();
  const db = getDatabase();
  // Startup validates; it NEVER creates tables, seeds or imports personal data remotely.
  return db.snapshot(async () => {
    const { name, ...privileges } = await db.prepare('SELECT current_user AS name, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = current_user').get();
    if (name !== 'puzoto_runtime') throw new Error('Papel de runtime inválido.');
    if (Object.values(privileges).some(Boolean)) throw new Error('Papel de runtime tem privilégios excessivos.');
    const expected = JSON.parse(fs.readFileSync(new URL('../../supabase/schema-manifest.json', import.meta.url), 'utf8'));
    const allColumns = await db.prepare("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'puzoto' ORDER BY table_name, ordinal_position").all();
    const columnsByTable = new Map();
    for (const column of allColumns) {
      if (!columnsByTable.has(column.table_name)) columnsByTable.set(column.table_name, []);
      columnsByTable.get(column.table_name).push(column.column_name);
    }
    for (const table of expected.tables) {
      if (columnsByTable.get(table.name)?.join(',') !== table.columns.map(c => c.name).join(',')) throw new Error('Schema remoto incompatível. Aplique e valide as migrações antes de iniciar.');
    }
    const tables = await db.prepare("SELECT relname FROM pg_class JOIN pg_namespace ON pg_namespace.oid = relnamespace WHERE nspname = 'puzoto' AND relkind = 'r' AND relrowsecurity AND relforcerowsecurity").all();
    if (tables.length !== expected.tables.length) throw new Error('RLS obrigatório ausente.');
  });
}
