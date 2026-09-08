import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = {
  location: { origin: 'https://puzoto-life.example' },
  dispatchEvent() {},
};

const requests = [];
globalThis.fetch = async (target, options) => {
  requests.push({ target: target.href, options });
  return await new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('Interrompida', 'AbortError')), { once: true });
  });
};

const { apiFetch } = await import('../src/services/http.js');

test('cliente HTTP encerra resposta lenta no prazo configurado', async () => {
  const started = performance.now();
  await assert.rejects(
    apiFetch('/api/slow-test', { timeoutMs: 30 }),
    /resposta demorou demais/i,
  );
  assert.ok(performance.now() - started < 500);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].target, 'https://puzoto-life.example/api/slow-test');
  assert.equal('timeoutMs' in requests[0].options, false);
});
