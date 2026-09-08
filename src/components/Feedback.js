export function installFeedback() {
  const notice = document.createElement('div');
  notice.className = 'app-notice';
  notice.setAttribute('role', 'status');
  notice.setAttribute('aria-live', 'polite');
  document.body.append(notice);
  let timeout;
  window.addEventListener('puzoto-notice', (event) => {
    clearTimeout(timeout);
    notice.textContent = event.detail;
    notice.classList.add('is-visible');
    timeout = setTimeout(() => notice.classList.remove('is-visible'), 5000);
  });
  window.addEventListener('offline', () => window.dispatchEvent(new CustomEvent('puzoto-notice', { detail: 'Você está sem conexão. Os dados não serão enviados até a conexão voltar.' })));
  window.addEventListener('online', () => window.dispatchEvent(new CustomEvent('puzoto-notice', { detail: 'Conexão restabelecida.' })));
  document.addEventListener('keydown', () => document.documentElement.classList.add('keyboard-input'), true);
  document.addEventListener('pointerdown', () => document.documentElement.classList.remove('keyboard-input'), true);
}

export function pageSkeleton() {
  return `<div class="page-skeleton" role="status" aria-label="Carregando página"><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-subtitle"></div><div class="skeleton-grid"><div class="skeleton skeleton-card"></div><div class="skeleton skeleton-card"></div><div class="skeleton skeleton-card"></div></div><div class="skeleton skeleton-panel"></div><span class="sr-only">Carregando suas informações…</span></div>`;
}

export function settleLoadingPlaceholders(container, onRetry) {
  const pending = [...container.querySelectorAll('[data-loading-placeholder]')]
    .filter((element) => /carregando|processando|aguarde/i.test(element.textContent));
  if (!pending.length) return false;

  for (const element of pending) {
    element.removeAttribute('data-loading-placeholder');
    element.textContent = element.tagName === 'OPTION' ? 'Indisponível' : 'Não foi possível carregar.';
    if (element.tagName === 'OPTION') element.disabled = true;
  }

  if (!container.querySelector('.page-load-warning')) {
    const warning = document.createElement('section');
    warning.className = 'page-load-warning';
    warning.setAttribute('role', 'alert');
    const text = document.createElement('span');
    text.textContent = 'Parte das informações não respondeu. Verifique a conexão e tente novamente.';
    const retry = document.createElement('button');
    retry.className = 'btn btn--primary';
    retry.type = 'button';
    retry.textContent = 'Tentar novamente';
    retry.addEventListener('click', onRetry, { once: true });
    warning.append(text, retry);
    const header = container.querySelector('.page-header');
    if (header) header.after(warning);
    else container.prepend(warning);
  }
  return true;
}
