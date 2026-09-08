import fs from 'node:fs';

if (fs.existsSync('.env')) process.loadEnvFile('.env');
process.env.PUZOTO_DATABASE = 'postgres';
const [{ initializeStorage }, { getDatabase, closeDatabase }] = await Promise.all([
  import('../server/database/initialize.js'),
  import('../server/database/connection.js'),
]);
try {
  await initializeStorage();
  const database = getDatabase();
  const manifest = JSON.parse(fs.readFileSync('supabase/schema-manifest.json', 'utf8'));
  const role = await database.prepare('SELECT current_user AS name').get();
  let records = 0;
  for (const table of manifest.tables) records += Number((await database.prepare(`SELECT COUNT(*) AS n FROM "${table.name}"`).get()).n);
  let ddlDenied = false;
  try { await database.prepare('CREATE TABLE puzoto.runtime_must_not_create (id integer)').run(); }
  catch { ddlDenied = true; }
  if (!ddlDenied) throw new Error('O papel de runtime conseguiu executar DDL.');
  console.log(JSON.stringify({ validated: true, role: role.name, tables: manifest.tables.length, records, ddlDenied }));
} finally {
  await closeDatabase();
}
