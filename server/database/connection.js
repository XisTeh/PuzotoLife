import Database from 'better-sqlite3';
import pg from 'pg';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { logEvent } from '../observability/logger.js';
import { createAdapter } from './adapter.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// Resolve after .env has loaded, not while ESM imports are being evaluated.
export const getDatabasePath = () => path.resolve(process.env.PUZOTO_LIFE_DB_PATH || path.join(root, 'data/puzoto_life.db'));
export const databaseDialect = () => process.env.PUZOTO_DATABASE || 'sqlite';
let local;
let adapter;
export function getLocalDatabase() {
  if (databaseDialect() !== 'sqlite') throw new Error('Operação exclusiva do banco SQLite local.');
  if (!local) {
    fs.mkdirSync(path.dirname(getDatabasePath()), { recursive: true });
    local = new Database(getDatabasePath());
    local.pragma('journal_mode = WAL');
    local.pragma('foreign_keys = ON');
  }
  return local;
}

export function postgresOptions(env = process.env) {
  let url;
  try { url = new URL(env.SUPABASE_RUNTIME_DB_URL); } catch { throw new Error('Configure SUPABASE_RUNTIME_DB_URL somente no backend.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !/\.(supabase\.co|supabase\.com)$/.test(url.hostname)) throw new Error('Conexão de runtime deve usar o PostgreSQL do Supabase.');
  if (!/^puzoto_runtime(?:\.[a-z0-9]+)?$/.test(decodeURIComponent(url.username))) throw new Error('Use o papel dedicado puzoto_runtime, nunca postgres ou service_role.');
  // URL sslmode options can override pg TLS. Reject rather than silently weaken it.
  if (url.search) throw new Error('Remova parâmetros da URL. A aplicação exige TLS com certificado validado.');
  const number = value => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || (Number.isInteger(parsed) && !Number.isSafeInteger(parsed))) throw new Error('Número fora da precisão suportada pelo sistema.');
    return parsed;
  };
  return {
    connectionString: url.toString(), max: 5, connectionTimeoutMillis: 10000, idleTimeoutMillis: 30000,
    ssl: {
      rejectUnauthorized: true,
      ...(env.SUPABASE_DB_CA_CERT ? { ca: env.SUPABASE_DB_CA_CERT.replaceAll('\\n', '\n') }
        : env.SUPABASE_DB_CA_FILE ? { ca: fs.readFileSync(env.SUPABASE_DB_CA_FILE, 'utf8') } : {}),
    },
    types: { getTypeParser: (oid, format) => [20, 1700].includes(oid) ? number : pg.types.getTypeParser(oid, format) },
  };
}

export function getDatabase() {
  if (adapter) return adapter;
  const dialect = databaseDialect();
  if (dialect === 'sqlite') {
    adapter = createAdapter({ dialect, acquire: async () => getLocalDatabase(), close: async () => { local?.close(); local = null; } });
  } else if (dialect === 'postgres') {
    const pool = new pg.Pool(postgresOptions());
    pool.on('error', error => logEvent('error', 'database_pool_error', {
      errorType: error?.constructor?.name || 'Error',
      errorCode: error?.code,
    }));
    adapter = createAdapter({ dialect, acquire: () => pool.connect(), close: () => pool.end() });
  } else throw new Error('PUZOTO_DATABASE deve ser sqlite ou postgres.');
  return adapter;
}
export const atomic = fn => getDatabase().atomic(fn);
export const snapshot = fn => getDatabase().snapshot(fn);
export async function closeDatabase() {
  await adapter?.close();
  if (!adapter && local) local.close();
  adapter = null;
  local = null;
}
// In-memory PostgreSQL engine injection is unavailable in normal runtime.
export function useTestDatabase(database) {
  if (process.env.NODE_ENV !== 'test' || adapter || local) throw new Error('Injeção permitida apenas em teste isolado, antes de abrir conexão.');
  adapter = database;
}

export function reopenLocalDatabase() { local = null; return getLocalDatabase(); }
