import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import pg from 'pg';

if (fs.existsSync('.env')) process.loadEnvFile('.env');
const source = path.resolve(process.env.MIGRATION_SOURCE || 'Info/puzoto_life-consistente.db');
const db = new Database(source, { readonly: true });
const manifest = JSON.parse(fs.readFileSync('supabase/schema-manifest.json', 'utf8'));
const quote = (name) => `"${name.replaceAll('"', '""')}"`;
const digest = (rows, columns) => createHash('sha256').update(JSON.stringify(rows.map((row) => columns.map((column) => {
  const value = row[column.name];
  return value == null ? null : ['INTEGER', 'REAL', 'BOOLEAN'].includes(column.type) ? Number(value) : value;
})))).digest('hex');
const changedColumns = (sourceRows, targetRows, columns) => columns
  .filter((column) => digest(sourceRows, [column]) !== digest(targetRows, [column]))
  .map((column) => column.name);
const numericDelta = (sourceRows, targetRows, column) => sourceRows.reduce((maximum, row, index) => {
  const sourceValue = row[column.name];
  const targetValue = targetRows[index]?.[column.name];
  if (sourceValue == null && targetValue == null) return maximum;
  return Math.max(maximum, Math.abs(Number(sourceValue) - Number(targetValue)));
}, 0);
if (db.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('Snapshot SQLite inválido.');
const foreignKeys = db.pragma('foreign_key_check');
if (foreignKeys.length) throw new Error(`Snapshot tem ${foreignKeys.length} relacionamentos inválidos; corrigir em cópia antes da migração.`);
const rows = new Map();
const actualTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((table) => table.name);
if (JSON.stringify(actualTables) !== JSON.stringify(manifest.tables.map((table) => table.name).sort())) throw new Error('O snapshot tem tabelas diferentes do schema preparado. Revisar o schema antes de migrar.');
for (const table of manifest.tables) {
  const actualColumns = db.prepare(`PRAGMA table_info(${quote(table.name)})`).all().map((column) => ({ name: column.name, type: column.type, primaryKey: Boolean(column.pk) }));
  if (JSON.stringify(actualColumns) !== JSON.stringify(table.columns)) throw new Error(`Schema mudou em ${table.name}. Preparar/revisar a nova migração primeiro.`);
  const keys = table.columns.filter((column) => column.primaryKey).map((column) => quote(column.name));
  if (!keys.length) throw new Error(`Tabela sem chave primária: ${table.name}. Revisar migração.`);
  rows.set(table.name, db.prepare(`SELECT * FROM ${quote(table.name)} ORDER BY ${keys.join(', ')}`).all());
}
db.close();
if (!process.argv.includes('--apply')) {
  console.log(`Pré-validação local OK: ${manifest.tables.length} tabelas, ${[...rows.values()].reduce((n, value) => n + value.length, 0)} registros. Nenhuma conexão externa ou escrita executada.`);
  process.exit(0);
}
if (!process.env.SUPABASE_DB_URL) throw new Error('Configure SUPABASE_DB_URL no .env privado.');
const connectionUrl = new URL(process.env.SUPABASE_DB_URL);
if (!['.supabase.co', '.supabase.com'].some((suffix) => connectionUrl.hostname.endsWith(suffix))) throw new Error('Destino não é um host Supabase.');
// Não usar rejectUnauthorized:false. A cadeia TLS precisa ser confiável.
const client = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: true, ...(process.env.SUPABASE_DB_CA_FILE ? { ca: fs.readFileSync(process.env.SUPABASE_DB_CA_FILE, 'utf8') } : {}) },
  connectionTimeoutMillis: 10_000,
});
try {
  await client.connect();
  await client.query('BEGIN');
  await client.query("SET LOCAL statement_timeout = '60s'");
  await client.query('SET CONSTRAINTS ALL DEFERRED');
  const names = manifest.tables.map((table) => `puzoto.${quote(table.name)}`);
  await client.query(`LOCK TABLE ${names.join(', ')} IN ACCESS EXCLUSIVE MODE`);
  for (const table of manifest.tables) {
    const target = `puzoto.${quote(table.name)}`;
    const count = await client.query(`SELECT COUNT(*) AS n FROM ${target}`);
    if (Number(count.rows[0].n) !== 0) throw new Error(`Destino não vazio: ${table.name}. Nenhum dado será substituído.`);
  }
  const checks = [];
  for (const table of manifest.tables) {
    const sourceRows = rows.get(table.name);
    const names = table.columns.map((column) => quote(column.name));
    const target = `puzoto.${quote(table.name)}`;
    for (let offset = 0; offset < sourceRows.length; offset += 100) {
      const batch = sourceRows.slice(offset, offset + 100);
      const values = batch.flatMap((row) => table.columns.map((column) => row[column.name]));
      const placeholders = batch.map((_row, i) => `(${names.map((_name, j) => `$${i * names.length + j + 1}`).join(', ')})`);
      await client.query(`INSERT INTO ${target} (${names.join(', ')}) VALUES ${placeholders.join(', ')}`, values);
    }
    const primary = table.columns.filter((column) => column.primaryKey);
    const result = await client.query(`SELECT * FROM ${target} ORDER BY ${primary.map((column) => quote(column.name)).join(', ')}`);
    if (digest(sourceRows, table.columns) !== digest(result.rows, table.columns)) {
      const columns = changedColumns(sourceRows, result.rows, table.columns);
      const tolerable = columns.every((name) => {
        const column = table.columns.find((item) => item.name === name);
        return ['INTEGER', 'REAL', 'BOOLEAN'].includes(column.type) && numericDelta(sourceRows, result.rows, column) <= 1e-9;
      });
      if (!tolerable) throw new Error(`Paridade de valores falhou em ${table.name} nas colunas ${columns.join(', ')}. Rollback.`);
    }
    for (const key of primary.filter((column) => column.type === 'INTEGER')) {
      await client.query(`SELECT setval(pg_get_serial_sequence($1, $2), COALESCE((SELECT MAX(${quote(key.name)}) FROM ${target}), 1), EXISTS(SELECT 1 FROM ${target}))`, [target, key.name]);
    }
    checks.push({ table: table.name, rows: result.rows.length, parity: 'ok' });
  }
  await client.query('SET CONSTRAINTS ALL IMMEDIATE');
  await client.query('COMMIT');
  fs.mkdirSync('data/migration-reports', { recursive: true });
  fs.writeFileSync(`data/migration-reports/${Date.now()}.json`, JSON.stringify({ completedAt: new Date().toISOString(), checks }, null, 2));
  console.log('Migração confirmada com paridade em todas as tabelas. O runtime NÃO foi alterado automaticamente.');
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('Migração não confirmada. O destino foi revertido se a transação estava aberta.');
  // Evitar imprimir strings de conexão ou registros retornados pelo driver.
  if (error.code) console.error(`Código: ${error.code}`);
  else console.error(error.message);
  process.exitCode = 1;
} finally { await client.end(); }
