let keyboardController;
export function renderHeader(session = { mode: 'local' }) {
  keyboardController?.abort();
  keyboardController = new AbortController();
  const header = document.getElementById('topHeader');
  header.innerHTML = `
    <div class="header__left">
      <button class="header__btn mobile-menu" id="openMenu" aria-label="Abrir menu" aria-controls="sidebar" aria-expanded="false"><i data-lucide="menu"></i></button>
      <div class="header-context"><span class="eyebrow">MEU ESPAÇO</span><span id="headerPageTitle">Visão geral</span></div>
    </div>
    <div class="header__right">
      <span class="connection-label">${session.mode === 'local' ? 'Neste computador' : 'Conta pessoal'}</span>
      <button class="header__btn" id="importShortcut" aria-label="Importar dados"><i data-lucide="download"></i><span>Importar</span></button>
      ${session.mode === 'local' ? '' : '<button class="header__btn" id="logoutButton" aria-label="Sair da conta"><i data-lucide="log-out"></i><span>Sair</span></button>'}
    </div>`;
  header.querySelector('#importShortcut').addEventListener('click', () => window.navigateTo('importar_dados'));
  header.querySelector('#logoutButton')?.addEventListener('click', () => window.dispatchEvent(new Event('puzoto-logout')));
  const sidebar = document.getElementById('sidebar');
  let backdrop = document.getElementById('menuBackdrop');
  if (!backdrop) { backdrop = document.createElement('button'); backdrop.id = 'menuBackdrop'; backdrop.className = 'menu-backdrop'; backdrop.setAttribute('aria-label', 'Fechar menu'); document.getElementById('app').append(backdrop); }
  const toggle = header.querySelector('#openMenu');
  function closeMenu() {
    sidebar.classList.remove('is-open');
    backdrop.classList.remove('is-visible');
    toggle.setAttribute('aria-expanded', 'false');
    document.getElementById('mainContent').inert = false;
    sidebar.removeAttribute('role');
    sidebar.removeAttribute('aria-modal');
  }
  toggle.addEventListener('click', () => {
    sidebar.classList.add('is-open'); backdrop.classList.add('is-visible'); toggle.setAttribute('aria-expanded', 'true');
    sidebar.setAttribute('role', 'dialog'); sidebar.setAttribute('aria-modal', 'true'); sidebar.setAttribute('aria-label', 'Navegação principal');
    document.getElementById('mainContent').inert = true;
    requestAnimationFrame(() => sidebar.querySelector('#closeMenu')?.focus());
  });
  sidebar.querySelector('#closeMenu')?.addEventListener('click', () => { closeMenu(); toggle.focus(); });
  backdrop.onclick = () => { closeMenu(); toggle.focus(); };
  sidebar.addEventListener('click', (event) => { if (event.target.closest('[data-page]')) closeMenu(); });
  document.addEventListener('keydown', (event) => {
    if (!sidebar.classList.contains('is-open')) return;
    if (event.key === 'Escape') { closeMenu(); toggle.focus(); }
    if (event.key === 'Tab') {
      const items = [...sidebar.querySelectorAll('button, a[href]')].filter(el => el.offsetParent !== null);
      const first = items[0]; const last = items.at(-1);
      if (!sidebar.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }, { signal: keyboardController.signal });
  matchMedia('(min-width: 901px)').addEventListener('change', closeMenu);
}
export function updateHeaderTitle(title) {
  const label = document.getElementById('headerPageTitle');
  if (label) label.textContent = title;
  document.title = title + ' · Puzoto Life';
}
