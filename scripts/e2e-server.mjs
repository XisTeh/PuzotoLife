import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'puzoto-e2e-'));
process.env.NODE_ENV = 'test';
process.env.PUZOTO_LIFE_DB_PATH = path.join(dir, 'test.db');
process.env.PORT = '3321';
process.env.APP_ORIGIN = 'http://127.0.0.1:3321';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_PUBLISHABLE_KEY = '';
process.env.SUPABASE_OWNER_ID = '';
const { createApp } = await import('../server/index.js');
const { initializeDatabase } = await import('../server/database/init.js');
initializeDatabase();
createApp().listen(3321, '127.0.0.1', () => console.log('E2E em http://127.0.0.1:3321 — banco sintético isolado'));
