import test from 'node:test';
import assert from 'node:assert/strict';
import { createLogEntry, logApiError } from '../server/observability/logger.js';

test('logs estruturados aceitam apenas metadados operacionais', () => {
  const privateValue = 'paciente@example.com token-super-secreto';
  const entry = createLogEntry('error', 'api_error', {
    id: '11111111-1111-4111-8111-111111111111',
    method: 'POST',
    route: '/backup/:filename',
    status: 500,
    durationMs: 12.6,
    errorType: 'DatabaseError',
    errorCode: 'XX000',
    count: 4,
    skipped: 1,
    body: privateValue,
    query: privateValue,
    message: privateValue,
    token: privateValue,
    url: `https://example.test/?email=${privateValue}`,
  }, new Date('2026-09-08T00:00:00.000Z'));

  assert.deepEqual(entry, {
    timestamp: '2026-09-08T00:00:00.000Z',
    level: 'error',
    event: 'api_error',
    id: '11111111-1111-4111-8111-111111111111',
    method: 'POST',
    route: '/backup/:filename',
    status: 500,
    durationMs: 13,
    count: 4,
    skipped: 1,
    errorType: 'DatabaseError',
    errorCode: 'XX000',
  });
  assert.equal(JSON.stringify(entry).includes(privateValue), false);
});

test('erro de API não registra mensagem, caminho concreto nem conteúdo da requisição', () => {
  const privateValue = 'Paciente Particular / arquivo-pessoal.xlsx';
  const error = new Error(privateValue);
  error.code = 'E_PRIVATE';
  const entry = logApiError({
    method: 'GET',
    path: `/backup/download/${privateValue}`,
    originalUrl: `/api/backup/download/${privateValue}?token=secret`,
    body: { name: privateValue },
    route: { path: '/backup/download/:filename' },
  }, { locals: { requestId: '22222222-2222-4222-8222-222222222222' } }, error, 400, { NODE_ENV: 'test' });

  assert.equal(entry.route, '/backup/download/:filename');
  assert.equal(entry.errorType, 'Error');
  assert.equal(entry.errorCode, 'E_PRIVATE');
  assert.equal(JSON.stringify(entry).includes(privateValue), false);
  assert.equal(JSON.stringify(entry).includes('token=secret'), false);
});
