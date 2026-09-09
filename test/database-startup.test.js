import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createAdapter } from '../server/database/adapter.js';
import { useTestDatabase, closeDatabase } from '../server/database/connection.js';
import { initializeStorage } from '../server/database/initialize.js';

const manifest = JSON.parse(fs.readFileSync(new URL('../supabase/schema-manifest.json', import.meta.url), 'utf8'));
process.env.NODE_ENV = 'test';
process.env.PUZOTO_DATABASE = 'postgres';

function fixture({ missingColumn = false, bypass = false, missingRls = false } = {}) {
  const calls = [];
  const columns = manifest.tables.flatMap(table => table.columns.map(column => ({ table_name: table.name, column_name: column.name })));
  if (missingColumn) columns.pop();
  const client = {
    async query(sql) {
      calls.push(sql);
      if (sql.includes('FROM pg_roles')) return { rows: [{ name: 'puzoto_runtime', rolsuper: false, rolbypassrls: bypass, rolcreatedb: false, rolcreaterole: false }] };
      if (sql.includes('information_schema.columns')) return { rows: columns };
      if (sql.includes('FROM pg_class')) return { rows: manifest.tables.slice(missingRls ? 1 : 0).map(table => ({ relname: table.name })) };
      return { rows: [] };
    },
  };
  useTestDatabase(createAdapter({ dialect: 'postgres', acquire: async () => client, close: async () => {} }));
  return calls;
}

test('inicialização confere as 23 tabelas em cinco viagens, incluindo BEGIN e COMMIT', async t => {
  t.after(closeDatabase);
  const calls = fixture();
  await initializeStorage();
  assert.equal(manifest.tables.length, 23);
  assert.equal(calls.length, 5);
  assert.equal(calls.at(-1), 'COMMIT');
});

for (const [option, message] of [['missingColumn', /Schema remoto incompatível/], ['bypass', /privilégios excessivos/], ['missingRls', /RLS obrigatório/]]) {
  test(`inicialização agrupada continua negando ${option}`, async t => {
    t.after(closeDatabase);
    const calls = fixture({ [option]: true });
    await assert.rejects(initializeStorage, message);
    assert.equal(calls.at(-1), 'ROLLBACK');
  });
}
