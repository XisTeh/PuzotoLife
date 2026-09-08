import test from 'node:test';
import assert from 'node:assert/strict';
import { Router } from 'express';
process.env.NODE_ENV = 'test';
process.env.PUZOTO_DATABASE = 'sqlite';
const { createApp, setStaticCacheHeaders } = await import('../server/index.js');

test('HTML e entrypoints estáveis recebem no-store no servidor Express', () => {
  for (const file of ['index.html', 'offline.html', 'index.js', 'index.css']) {
    let cacheControl;
    setStaticCacheHeaders({ setHeader: (name, value) => { if (name === 'Cache-Control') cacheControl = value; } }, `C:/dist/assets/${file}`);
    assert.equal(cacheControl, 'no-store');
  }
  let hashedCacheControl;
  setStaticCacheHeaders({ setHeader: (_name, value) => { hashedCacheControl = value; } }, 'C:/dist/assets/dashboard-C26b_G6m.js');
  assert.equal(hashedCacheControl, undefined);
});

test('produção exige PostgreSQL, HTTPS e Supabase enquanto o runtime local permanece no loopback', () => {
  const authFactory = (_env, configured = true) => ({ router: Router(), guard: (_req, _res, next) => next(), configured });
  assert.throws(() => createApp({ NODE_ENV: 'production' }), /PostgreSQL/);
  assert.throws(() => createApp({ NODE_ENV: 'production', PUZOTO_DATABASE: 'postgres' }), /APP_ORIGIN/);
  assert.throws(() => createApp({ NODE_ENV: 'production', PUZOTO_DATABASE: 'postgres', APP_ORIGIN: 'http://example.com' }), /HTTPS/);
  assert.throws(() => createApp({ NODE_ENV: 'production', PUZOTO_DATABASE: 'postgres', APP_ORIGIN: 'https://example.com/path' }), /sem caminho/);
  assert.throws(() => createApp({ NODE_ENV: 'production', PUZOTO_DATABASE: 'postgres', APP_ORIGIN: 'https://example.com' }, (env) => authFactory(env, false)), /autenticação Supabase/);
  assert.doesNotThrow(() => createApp({ NODE_ENV: 'production', PUZOTO_DATABASE: 'postgres', APP_ORIGIN: 'https://example.com' }, authFactory));
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
