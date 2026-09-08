import test from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import express from 'express';
import { createAuth, authConfigured } from '../server/security/auth.js';
import { installHttpSecurity } from '../server/security/http.js';
import { allowedRequestOrigins } from '../server/security/origin.js';

const owner = '11111111-1111-4111-8111-111111111111';
const env = {
  NODE_ENV: 'test',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'public-test',
  SUPABASE_OWNER_ID: owner,
  SESSION_SECRET: 'test-session-secret-with-at-least-32-characters',
  APP_ORIGIN: 'http://localhost:5174',
};
async function fixture(t, userId = owner) {
  let revoked = false;
  let recoveryRequest;
  const authCalls = { getUser: 0, setSession: 0, lastGetUserToken: null };
  const session = { access_token: 'test-access-token', refresh_token: 'test-refresh-token' };
  const auth = createAuth(env, () => ({ auth: {
    signInWithPassword: async ({ password }) => password === 'correct-password' ? { data: { user: { id: userId }, session } } : { error: true, data: {} },
    setSession: async () => { authCalls.setSession++; return revoked ? { error: true, data: {} } : { error: null, data: { user: { id: userId }, session } }; },
    getUser: async (token) => { authCalls.getUser++; authCalls.lastGetUserToken = token; return revoked ? { error: true, data: {} } : { data: { user: { id: userId } } }; },
    signOut: async () => { revoked = true; },
    updateUser: async () => ({ error: null }),
    resetPasswordForEmail: async (email, options) => { recoveryRequest = { email, options }; return { data: {}, error: null }; },
  } }));
  const app = express();
  installHttpSecurity(app, env);
  app.use(express.json());
  app.use('/api/auth', auth.router);
  app.get('/api/private', auth.guard, (_req, res) => res.json({ ok: true }));
  app.get('/', (_req, res) => res.type('html').send('<!doctype html><title>Puzoto Life</title>'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const request = (url, options = {}) => fetch(`http://127.0.0.1:${server.address().port}${url}`, options);
  const rawRequest = (url, headers = {}) => new Promise((resolve, reject) => {
    const outgoing = httpRequest({ hostname: '127.0.0.1', port: server.address().port, path: url, headers }, (response) => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    outgoing.on('error', reject);
    outgoing.end();
  });
  const login = (password = 'correct-password') => request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Puzoto-Request': '1' }, body: JSON.stringify({ email: 'owner@example.com', password }) });
  return { request, rawRequest, login, revoke: () => { revoked = true; }, recoveryRequest: () => recoveryRequest, authCalls };
}
test('configuração incompleta de Auth falha fechada', () => {
  assert.equal(authConfigured({}), false);
  assert.throws(() => authConfigured({ SUPABASE_URL: env.SUPABASE_URL }));
  assert.throws(() => authConfigured({ ...env, SUPABASE_URL: 'http://insecure.example' }));
  assert.throws(() => createAuth({ ...env, SESSION_SECRET: '' }), /SESSION_SECRET/);
});
test('dados negados sem sessão e com cookie forjado', async (t) => {
  const { request } = await fixture(t);
  assert.equal((await request('/api/private')).status, 401);
  assert.equal((await request('/api/private', { headers: { Cookie: 'puzoto_session=fake' } })).status, 401);
});
test('login incorreto e outro usuário não acessam o acervo', async (t) => {
  const first = await fixture(t);
  assert.equal((await first.login('wrong')).status, 401);
  const second = await fixture(t, '22222222-2222-4222-8222-222222222222');
  assert.equal((await second.login()).status, 401);
});
test('sessão HttpOnly permite proprietário e respeita revogação remota', async (t) => {
  const { request, login, revoke } = await fixture(t);
  const response = await login();
  assert.equal(response.status, 200);
  const setCookie = response.headers.getSetCookie().at(-1);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  const cookie = setCookie.split(';')[0];
  assert.equal((await request('/api/private', { headers: { Cookie: cookie } })).status, 200);
  revoke();
  assert.equal((await request('/api/private', { headers: { Cookie: cookie } })).status, 401);
});
test('requisição privada valida o token remotamente uma vez sem criar sessão redundante', async (t) => {
  const { request, login, authCalls } = await fixture(t);
  const cookie = (await login()).headers.getSetCookie().at(-1).split(';')[0];
  assert.equal((await request('/api/private', { headers: { Cookie: cookie } })).status, 200);
  assert.equal(authCalls.getUser, 1);
  assert.equal(authCalls.setSession, 0);
  assert.equal(authCalls.lastGetUserToken, 'test-access-token');
});
test('sessão assinada permanece válida em outra instância do servidor', async (t) => {
  const first = await fixture(t);
  const second = await fixture(t);
  const cookie = (await first.login()).headers.getSetCookie().at(-1).split(';')[0];
  assert.equal((await second.request('/api/private', { headers: { Cookie: cookie } })).status, 200);
});
test('logout invalida o cookie no servidor', async (t) => {
  const { request, login } = await fixture(t);
  const cookie = (await login()).headers.getSetCookie().at(-1).split(';')[0];
  assert.equal((await request('/api/auth/logout', { method: 'POST', headers: { Cookie: cookie, 'X-Puzoto-Request': '1' } })).status, 200);
  assert.equal((await request('/api/private', { headers: { Cookie: cookie } })).status, 401);
});
test('origem externa e mutação sem header de proteção são bloqueadas', async (t) => {
  const { request } = await fixture(t);
  const external = await request('/api/auth/login', { method: 'POST', headers: { Origin: 'https://evil.example', 'X-Puzoto-Request': '1' } });
  assert.equal(external.status, 403);
  assert.match(external.headers.get('x-request-id'), /^[0-9a-f-]{36}$/);
  assert.equal((await request('/api/auth/login', { method: 'POST' })).status, 403);
});
test('navegação de documento cross-site abre o app e leitura cross-site continua bloqueada', async (t) => {
  const { request, rawRequest } = await fixture(t);
  const navigationHeaders = {
    Origin: 'https://search.example',
    'Sec-Fetch-Site': 'cross-site',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Dest': 'document',
  };
  const navigation = await rawRequest('/', navigationHeaders);
  assert.equal(navigation.status, 200);
  assert.match(navigation.body, /Puzoto Life/);
  const corsRead = await request('/api/private', { headers: {
    Origin: 'https://evil.example',
    'Sec-Fetch-Site': 'cross-site',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Dest': 'empty',
  } });
  assert.equal(corsRead.status, 403);
});
test('aliases locais são aceitos no desenvolvimento e recuperação usa origem canônica', async (t) => {
  const { request, recoveryRequest } = await fixture(t);
  const headers = { Origin: 'http://127.0.0.1:5174', 'Content-Type': 'application/json', 'X-Puzoto-Request': '1' };
  const loginResponse = await request('/api/auth/login', { method: 'POST', headers, body: JSON.stringify({ email: 'owner@example.com', password: 'correct-password' }) });
  assert.equal(loginResponse.status, 200);
  const response = await request('/api/auth/forgot-password', { method: 'POST', headers, body: JSON.stringify({ email: 'owner@example.com' }) });
  assert.equal(response.status, 200);
  assert.deepEqual(recoveryRequest(), { email: 'owner@example.com', options: { redirectTo: 'http://localhost:5174/' } });
});
test('produção aceita somente a origem configurada', () => {
  const allowed = allowedRequestOrigins({ ...env, NODE_ENV: 'production' });
  assert.deepEqual([...allowed], ['http://localhost:5174']);
});
test('rate limit de login e headers de proteção', async (t) => {
  const { login } = await fixture(t);
  for (let i = 0; i < 10; i++) await login('wrong');
  const response = await login('wrong');
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
