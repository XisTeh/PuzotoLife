import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import pg from 'pg';

if (!process.argv.includes('--apply')) throw new Error('Use --apply somente após revisar as migrações e a paridade dos dados.');
if (fs.existsSync('.env')) process.loadEnvFile('.env');
if (!process.env.SUPABASE_DB_URL) throw new Error('Configure SUPABASE_DB_URL no .env privado.');
const adminUrl = new URL(process.env.SUPABASE_DB_URL);
if (!adminUrl.username.startsWith('postgres.')) throw new Error('A provisão exige a conexão administrativa do pooler.');
const runtimePassword = randomBytes(36).toString('base64url');
const ssl = {
  rejectUnauthorized: true,
  ...(process.env.SUPABASE_DB_CA_CERT ? { ca: process.env.SUPABASE_DB_CA_CERT.replaceAll('\\n', '\n') }
    : process.env.SUPABASE_DB_CA_FILE ? { ca: fs.readFileSync(process.env.SUPABASE_DB_CA_FILE, 'utf8') } : {}),
};
const client = new pg.Client({ connectionString: adminUrl.toString(), ssl, connectionTimeoutMillis: 10_000 });
try {
  await client.connect();
  const escaped = runtimePassword.replaceAll("'", "''");
  await client.query(`ALTER ROLE puzoto_runtime WITH LOGIN PASSWORD '${escaped}'`);
  const privileges = await client.query("SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls FROM pg_roles WHERE rolname = 'puzoto_runtime'");
  if (privileges.rows.length !== 1 || Object.values(privileges.rows[0]).some(Boolean)) throw new Error('O papel de runtime recebeu privilégios excessivos.');
} finally {
  await client.end().catch(() => {});
}
const runtimeUrl = new URL(adminUrl);
runtimeUrl.username = `puzoto_runtime.${adminUrl.username.split('.').slice(1).join('.')}`;
runtimeUrl.password = runtimePassword;
let content = fs.readFileSync('.env', 'utf8');
content = content.replace(/^SUPABASE_RUNTIME_DB_URL=.*$/m, `SUPABASE_RUNTIME_DB_URL=${runtimeUrl.toString()}`);
fs.writeFileSync('.env', content, { mode: 0o600 });
console.log('Papel de runtime ativado e URL restrita armazenada somente no .env ignorado.');
