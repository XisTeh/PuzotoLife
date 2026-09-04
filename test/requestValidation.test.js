import test from 'node:test';
import assert from 'node:assert/strict';
import express, { Router } from 'express';
import {
  RequestValidationError,
  validateApiRequest,
  validateBackupFilenameParam,
  validateIdParam,
} from '../server/security/requestValidation.js';

async function fixture(t) {
  const app = express();
  app.use(express.json());
  app.use('/api', validateApiRequest);
  const router = Router();
  router.param('id', validateIdParam);
  router.param('filename', validateBackupFilenameParam);
  router.post('/items', (req, res) => res.json(req.body));
  router.get('/items/:id', (req, res) => res.json({ id: req.params.id }));
  router.get('/financas/pessoas-dividas/:id', (req, res) => res.json({ id: req.params.id }));
  router.get('/backup/:filename', (req, res) => res.json({ filename: req.params.filename }));
  app.use('/api', router);
  app.use((error, _req, res, _next) => {
    const status = error instanceof RequestValidationError ? error.status : 500;
    res.status(status).json({ error: error.message });
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return (path, options = {}) => fetch(`http://127.0.0.1:${server.address().port}${path}`, options);
}

const jsonRequest = (body, headers = {}) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(body),
});

test('aceita objeto JSON comum sem alterar os valores', async (t) => {
  const request = await fixture(t);
  const response = await request('/api/items', jsonRequest({ nome: 'Exame', parcelas: [1, 2] }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { nome: 'Exame', parcelas: [1, 2] });
});

test('bloqueia Content-Type incorreto e corpo JSON que não seja objeto', async (t) => {
  const request = await fixture(t);
  assert.equal((await request('/api/items', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' })).status, 415);
  assert.equal((await request('/api/items', jsonRequest(['item']))).status, 400);
});

test('bloqueia poluição de protótipo, profundidade e parâmetro duplicado', async (t) => {
  const request = await fixture(t);
  const polluted = await request('/api/items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"__proto__":{"admin":true}}',
  });
  assert.equal(polluted.status, 400);
  assert.equal(Object.prototype.admin, undefined);
  let deep = {};
  for (let index = 0; index < 10; index += 1) deep = { child: deep };
  assert.equal((await request('/api/items', jsonRequest(deep))).status, 400);
  assert.equal((await request('/api/items?mes=2026-01&mes=2026-02', jsonRequest({ nome: 'x' }))).status, 400);
});

test('aceita apenas IDs positivos e nomes de backup gerados pelo sistema', async (t) => {
  const request = await fixture(t);
  assert.equal((await request('/api/items/15')).status, 200);
  assert.equal((await request('/api/items/dp_9')).status, 400);
  assert.equal((await request('/api/financas/pessoas-dividas/dp_9')).status, 200);
  assert.equal((await request('/api/items/0')).status, 400);
  assert.equal((await request('/api/items/abc')).status, 400);
  assert.equal((await request('/api/backup/puzoto_life_backup_2026-09-04_10-20-30_123.db')).status, 200);
  assert.equal((await request('/api/backup/..%2Fsegredo.db')).status, 400);
});
