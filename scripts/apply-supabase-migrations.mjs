import fs from 'node:fs';
import pg from 'pg';

if (fs.existsSync('.env')) process.loadEnvFile('.env');
if (!process.env.SUPABASE_DB_URL) throw new Error('Configure SUPABASE_DB_URL no .env privado.');
const url = new URL(process.env.SUPABASE_DB_URL);
if (!['.supabase.co', '.supabase.com'].some((suffix) => url.hostname.endsWith(suffix))) throw new Error('Destino não é um host Supabase.');
const ssl = {
  rejectUnauthorized: true,
  ...(process.env.SUPABASE_DB_CA_CERT ? { ca: process.env.SUPABASE_DB_CA_CERT.replaceAll('\\n', '\n') }
    : process.env.SUPABASE_DB_CA_FILE ? { ca: fs.readFileSync(process.env.SUPABASE_DB_CA_FILE, 'utf8') } : {}),
};
const migrations = [
  'supabase/migrations/202609040001_legacy_structure.sql',
  'supabase/migrations/202609040002_runtime_role.sql',
];
const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl, connectionTimeoutMillis: 10_000 });
try {
  await client.connect();
  await client.query('BEGIN');
  await client.query("SET LOCAL statement_timeout = '60s'");
  for (const migration of migrations) await client.query(fs.readFileSync(migration, 'utf8'));
  await client.query('COMMIT');
  const result = await client.query("SELECT COUNT(*)::int AS tables FROM information_schema.tables WHERE table_schema = 'puzoto' AND table_type = 'BASE TABLE'");
  console.log(`Migrações aplicadas: ${migrations.length}; tabelas encontradas: ${result.rows[0].tables}.`);
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('Falha ao aplicar migrações. Nenhuma alteração parcial foi mantida.');
  if (error.code) console.error(`Código: ${error.code}`);
  else console.error(error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
