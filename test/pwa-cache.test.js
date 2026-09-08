import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const workerSource = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
const vercelConfig = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));

function workerFixture({ fetchImpl = async () => ({ ok: true, clone: () => ({}) }) } = {}) {
  const listeners = {};
  const operations = { added: [], deleted: [], matched: [], put: [], fetch: [], claimed: false };
  const cache = {
    addAll: async (entries) => { operations.added.push(...entries); },
    put: async (request) => { operations.put.push(typeof request === 'string' ? request : request.url); },
  };
  const sandbox = {
    URL,
    Set,
    Promise,
    console,
    self: {
      location: { origin: 'https://puzoto-life.example' },
      addEventListener: (name, listener) => { listeners[name] = listener; },
      skipWaiting: () => {},
      clients: { claim: async () => { operations.claimed = true; } },
    },
    caches: {
      open: async () => cache,
      keys: async () => ['puzoto-shell-v1', 'puzoto-static-v2', 'puzoto-static-v3', 'puzoto-static-v4', 'puzoto-static-v5', 'unrelated-cache'],
      delete: async (key) => { operations.deleted.push(key); return true; },
      match: async (request) => {
        const key = typeof request === 'string' ? request : request.url;
        operations.matched.push(key);
        return { offline: key === '/offline.html' };
      },
    },
    fetch: async (...args) => { operations.fetch.push(args); return fetchImpl(...args); },
  };
  vm.runInNewContext(workerSource, sandbox, { filename: 'public/sw.js' });
  return { listeners, operations };
}

function lifecycleEvent() {
  let work;
  return { event: { waitUntil: (promise) => { work = promise; } }, done: () => work };
}

function fetchEvent(request) {
  let response;
  return { event: { request, respondWith: (promise) => { response = promise; } }, response: () => response };
}

test('service worker guarda somente recursos públicos estáveis e remove o cache legado', async () => {
  const { listeners, operations } = workerFixture();
  const install = lifecycleEvent();
  listeners.install(install.event);
  await install.done();
  assert.ok(operations.added.includes('/offline.html'));
  assert.ok(operations.added.includes('/manifest.webmanifest'));
  assert.ok(!operations.added.includes('/'));
  assert.ok(!operations.added.some((entry) => entry.endsWith('.js')));

  const activate = lifecycleEvent();
  listeners.activate(activate.event);
  await activate.done();
  assert.deepEqual(operations.deleted, ['puzoto-shell-v1', 'puzoto-static-v2', 'puzoto-static-v3', 'puzoto-static-v4']);
  assert.equal(operations.claimed, true);
});

test('navegação busca HTML sem cache e usa somente a página offline estável como fallback', async () => {
  const online = workerFixture();
  const navigation = fetchEvent({ method: 'GET', mode: 'navigate', url: 'https://puzoto-life.example/' });
  online.listeners.fetch(navigation.event);
  await navigation.response();
  assert.equal(online.operations.fetch[0][1].cache, 'no-store');
  assert.deepEqual(online.operations.put, []);

  const offline = workerFixture({ fetchImpl: async () => { throw new Error('offline'); } });
  const failedNavigation = fetchEvent({ method: 'GET', mode: 'navigate', url: 'https://puzoto-life.example/' });
  offline.listeners.fetch(failedNavigation.event);
  const fallback = await failedNavigation.response();
  assert.equal(fallback.offline, true);
  assert.deepEqual(offline.operations.matched, ['/offline.html']);
});

test('API e bundles versionados nunca são interceptados pelo cache', () => {
  const { listeners } = workerFixture();
  const api = fetchEvent({ method: 'GET', mode: 'cors', destination: '', url: 'https://puzoto-life.example/api/dashboard' });
  listeners.fetch(api.event);
  assert.equal(api.response(), undefined);

  const script = fetchEvent({ method: 'GET', mode: 'cors', destination: 'script', url: 'https://puzoto-life.example/assets/index-old.js' });
  listeners.fetch(script.event);
  assert.equal(script.response(), undefined);
});

test('registro do service worker ignora o cache HTTP e solicita atualização', async () => {
  const mainSource = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(mainSource, /register\('\/sw\.js', \{ updateViaCache: 'none' \}\)/);
  assert.match(mainSource, /registration\.update\(\)/);
  assert.doesNotMatch(mainSource, /warmPageModules/);
});

test('entrypoints estáveis não são armazenados e chunks antigos têm recuperação transitória', () => {
  const headers = Object.fromEntries(vercelConfig.headers.map(rule => [rule.source, rule.headers]));
  assert.deepEqual(headers['/assets/index.js'], [{ key: 'Cache-Control', value: 'no-store' }]);
  assert.deepEqual(headers['/assets/index.css'], [{ key: 'Cache-Control', value: 'no-store' }]);

  const rewrites = new Map(vercelConfig.rewrites.map(rule => [rule.source, rule.destination]));
  assert.equal(rewrites.get('/assets/gastos-BzZKahpP.js'), '/assets/gastos-Sr3p8HEB.js');
  assert.equal(rewrites.get('/assets/contasPagar-BWYtTW3T.js'), '/assets/contasPagar-BiBr4wdV.js');
  assert.equal(rewrites.get('/assets/receitas-A_bUZNFg.js'), '/assets/receitas-75gkrjyj.js');
});
