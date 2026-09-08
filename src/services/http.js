const inFlight = new Set();

const DEFAULT_READ_TIMEOUT_MS = 15_000;
const DEFAULT_WRITE_TIMEOUT_MS = 20_000;

export function cancelRequests() {
  for (const controller of inFlight) controller.abort();
  inFlight.clear();
}

export async function apiFetch(url, options = {}) {
  const target = new URL(url, window.location.origin);
  if (target.origin !== window.location.origin || !target.pathname.startsWith('/api/')) throw new Error('Destino da API inválido.');
  const method = (options.method || 'GET').toUpperCase();
  const timeoutMs = Number.isFinite(options.timeoutMs)
    ? Math.max(1, options.timeoutMs)
    : ['GET', 'HEAD'].includes(method) ? DEFAULT_READ_TIMEOUT_MS : DEFAULT_WRITE_TIMEOUT_MS;
  const { signal: externalSignal, ...fetchOptions } = options;
  delete fetchOptions.timeoutMs;
  const controller = new AbortController();
  const signal = externalSignal ? AbortSignal.any([externalSignal, controller.signal]) : controller.signal;
  inFlight.add(controller);
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const mutating = !['GET', 'HEAD'].includes(method);
  const button = mutating && document.activeElement instanceof HTMLButtonElement ? document.activeElement : null;
  const wasDisabled = button?.disabled;
  if (button) { button.disabled = true; button.setAttribute('aria-busy', 'true'); }
  try {
    const response = await fetch(target, { ...fetchOptions, signal, credentials: 'same-origin', headers: { ...fetchOptions.headers, 'X-Puzoto-Request': '1' } });
    if (response.status === 401 && !target.pathname.startsWith('/api/auth/')) {
      window.dispatchEvent(new Event('session-expired'));
      throw new Error('Sua sessão expirou. Entre novamente.');
    }
    if (response.status === 429) throw new Error('Muitas tentativas. Aguarde um momento.');
    return response;
  } catch (error) {
    if (error.name === 'AbortError' && timedOut) throw new Error('A resposta demorou demais. Verifique a conexão e tente novamente.');
    if (error.name === 'AbortError') throw new Error('A solicitação foi interrompida. Tente novamente.');
    throw error;
  } finally {
    clearTimeout(timeout);
    inFlight.delete(controller);
    if (button?.isConnected) { button.disabled = wasDisabled; button.removeAttribute('aria-busy'); }
  }
}

export async function authRequest(action, body) {
  const response = await apiFetch(`/api/auth/${action}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Não foi possível concluir. Tente novamente.');
  return data;
}
