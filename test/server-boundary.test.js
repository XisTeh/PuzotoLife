import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/index.js';

test('backend legado não inicia em produção nem em interface externa', () => {
  assert.throws(() => createApp({ NODE_ENV: 'production' }), /Publicação bloqueada/);
  assert.throws(() => createApp({ HOST: '0.0.0.0' }), /Publicação bloqueada/);
});
test('health não expõe caminho e servidor nunca serve backups ou .env', async (t) => {
  const server = createApp({ NODE_ENV: 'test' }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const health = await (await fetch(`${base}/api/health`)).json();
  assert.equal(health.storage, 'sqlite');
  assert.equal(health.banco, undefined);
  for (const url of ['/.env', '/.inv', '/Info/manifest.json', '/data/puzoto_life.db', '/server/database/connection.js', '/.git/config']) assert.equal((await fetch(base + url)).status, 404);
});
