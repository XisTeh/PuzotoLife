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
