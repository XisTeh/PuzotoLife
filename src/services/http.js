const inFlight = new Set();

export function cancelRequests() {
  for (const controller of inFlight) controller.abort();
  inFlight.clear();
}

export async function apiFetch(url, options = {}) {
  const target = new URL(url, window.location.origin);
  if (target.origin !== window.location.origin || !target.pathname.startsWith('/api/')) throw new Error('Destino da API inválido.');
  const controller = new AbortController();
  const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
  inFlight.add(controller);
  const timeout = setTimeout(() => controller.abort(), 60_000);
  const mutating = !['GET', 'HEAD'].includes((options.method || 'GET').toUpperCase());
  const button = mutating && document.activeElement instanceof HTMLButtonElement ? document.activeElement : null;
  const wasDisabled = button?.disabled;
  if (button) { button.disabled = true; button.setAttribute('aria-busy', 'true'); }
  try {
    const response = await fetch(target, { ...options, signal, credentials: 'same-origin', headers: { ...options.headers, 'X-Puzoto-Request': '1' } });
    if (response.status === 401 && !target.pathname.startsWith('/api/auth/')) {
      window.dispatchEvent(new Event('session-expired'));
      throw new Error('Sua sessão expirou. Entre novamente.');
    }
    if (response.status === 429) throw new Error('Muitas tentativas. Aguarde um momento.');
    return response;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('A solicitação foi interrompida. Verifique a conexão e tente novamente.');
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
