/**
 * Conexão singleton com o banco SQLite.
 * O arquivo .db fica em /data/puzoto_life.db
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DB_PATH = process.env.PUZOTO_LIFE_DB_PATH
  ? path.resolve(process.env.PUZOTO_LIFE_DB_PATH)
  : path.join(DEFAULT_DATA_DIR, 'puzoto_life.db');
const DATA_DIR = path.dirname(DB_PATH);

// Garante que o diretório /data exista
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let db = null;

export function getDatabase() {
  if (!db) {
    db = new Database(DB_PATH, { verbose: null });
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

export function getDatabasePath() {
  return DB_PATH;
}
