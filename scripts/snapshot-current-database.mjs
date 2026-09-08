import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

if (fs.existsSync('.env')) process.loadEnvFile('.env');
const source = path.resolve(process.env.PUZOTO_LIFE_DB_PATH || 'data/puzoto_life.db');
const targetDir = path.resolve('data/migration-source');
fs.mkdirSync(targetDir, { recursive: true });
const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const target = path.join(targetDir, `puzoto-before-supabase-${stamp}.db`);
const database = new Database(source);
try {
  await database.backup(target);
} finally {
  database.close();
}
const snapshot = new Database(target, { readonly: true });
try {
  const integrity = snapshot.pragma('integrity_check', { simple: true });
  const foreignKeys = snapshot.pragma('foreign_key_check');
  const tables = snapshot.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
  const records = tables.reduce((total, { name }) => total + snapshot.prepare(`SELECT COUNT(*) AS n FROM "${name}"`).get().n, 0);
  if (integrity !== 'ok' || foreignKeys.length) throw new Error('Snapshot inconsistente; migração cancelada.');
  fs.writeFileSync('data/migration-source/current-source.txt', target, { mode: 0o600 });
  console.log(JSON.stringify({ snapshot: path.basename(target), integrity, foreignKeyErrors: foreignKeys.length, tables: tables.length, records }));
} finally {
  snapshot.close();
}
