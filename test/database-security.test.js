import test from 'node:test';
import assert from 'node:assert/strict';
import { postgresOptions } from '../server/database/connection.js';
import { postgresQuery } from '../server/database/sql.js';

test('conexão exige Supabase, papel dedicado e TLS verificado', () => {
  const allowed = 'postgres://puzoto_runtime.example:synthetic@aws-0-sa-east-1.pooler.supabase.com:5432/postgres';
  assert.equal(postgresOptions({ SUPABASE_RUNTIME_DB_URL: allowed }).ssl.rejectUnauthorized, true);
  for (const url of [allowed.replace('puzoto_runtime.example', 'postgres.example'), allowed + '?sslmode=no-verify', allowed.replace('.supabase.com', '.supabase.com.attacker.example')]) {
    assert.throws(() => postgresOptions({ SUPABASE_RUNTIME_DB_URL: url }));
  }
  assert.throws(() => postgresOptions({}));
});

test('valores e pontuação SQL permanecem fora do comando', () => {
  const payload = "Robert'); DROP TABLE receitas; -- @id ?";
  const result = postgresQuery("SELECT '@not_a_bind ?' AS literal FROM empresas WHERE nome=@name OR nome=@name -- ?", [{ name: payload }]);
  assert.equal(result.text, "SELECT '@not_a_bind ?' AS literal FROM empresas WHERE nome=$1 OR nome=$2 -- ?");
  assert.deepEqual(result.values, [payload, payload]);
  assert.throws(() => postgresQuery('SELECT * FROM empresas WHERE id=@id', [{}]));
});
