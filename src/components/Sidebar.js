import { navigateTo, appState } from '../state.js';
import { checkHealth } from '../services/api.js';

const menuItems = [
  {
    title: 'VISÃO GERAL',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard' }
    ]
  },
  {
    title: 'TRABALHO',
    items: [
      { id: 'lancamentos', label: 'Lançamentos', icon: 'file-text' },
      { id: 'dr_ranon', label: 'Dr. Ranon / RX', icon: 'stethoscope' },
      { id: 'fechamento_mes', label: 'Fechamento do Mês', icon: 'calendar-check' },
      { id: 'historico', label: 'Histórico e Recebimentos', icon: 'history' }
    ]
  },
  {
    title: 'FINANÇAS',
    items: [
      { id: 'gastos', label: 'Gastos', icon: 'arrow-down-circle' },
      { id: 'cartoes', label: 'Cartões', icon: 'credit-card' },
      { id: 'contas_pagar', label: 'Contas a Pagar', icon: 'receipt' },
      { id: 'pessoas_dividas', label: 'Pessoas / Dívidas', icon: 'users' },
      { id: 'receitas', label: 'Receitas', icon: 'arrow-up-circle' },
      { id: 'investimentos', label: 'Cofre', icon: 'piggy-bank' }
    ]
  },
  {
    title: 'RELATÓRIOS',
    items: [
      { id: 'rel_geral', label: 'Geral', icon: 'bar-chart-2' },
      { id: 'rel_trabalho', label: 'Trabalho', icon: 'briefcase' },
      { id: 'rel_financas', label: 'Finanças', icon: 'pie-chart' },
      { id: 'rel_comparativo', label: 'Comparativo Mensal', icon: 'trending-up' }
    ]
  },
  {
    title: 'SISTEMA',
    items: [
      { id: 'configuracoes', label: 'Configurações', icon: 'settings' },
      { id: 'backup', label: 'Backup', icon: 'database' },
      { id: 'importar_dados', label: 'Importar Dados', icon: 'download-cloud' },
      { id: 'diagnostico', label: 'Diagnóstico', icon: 'activity' },
      { id: 'ajuda', label: 'Ajuda', icon: 'help-circle' }
    ]
  }
];

export function renderSidebar() {
  const sidebar = document.getElementById('sidebar');

  let navHtml = '';

  menuItems.forEach(section => {
    navHtml += `
      <div class="sidebar__section">
        <div class="sidebar__section-title">${section.title}</div>
    `;

    section.items.forEach(item => {
      const activeClass = item.id === appState.currentPage ? 'active' : '';
      navHtml += `
        <a class="sidebar__link ${activeClass}" href="#${item.id}" data-page="${item.id}">
          <i data-lucide="${item.icon}"></i>
          <span>${item.label}</span>
        </a>
      `;
    });

    navHtml += `</div>`;
  });

  sidebar.innerHTML = `
    <button class="header__btn mobile-menu sidebar-close" id="closeMenu" aria-label="Fechar menu"><i data-lucide="x"></i></button><div class="sidebar__brand">
      <div class="sidebar__logo-wrap">
        <img src="/images/PuzotoLife.png" alt="Puzoto Life" class="sidebar__logo" onerror="this.src='/images/PuzotoLife.ico'">
      </div>
      <div class="sidebar__app-name">Puzoto <span>Life</span></div>
    </div>

    <nav class="sidebar__nav scroll-hide">
      ${navHtml}
    </nav>

    <div class="sidebar__footer">
      <div class="sidebar__status">
        <div class="sidebar__status-top">
          <div class="sidebar__status-dot"></div>
          <div class="sidebar__status-info">
            <span class="sidebar__status-label">Verificando conexão</span>
            <span class="sidebar__status-version">v1.0.0</span>
          </div>
        </div>
        <div class="sidebar__status-bar">
          <div class="sidebar__status-bar-fill"></div>
        </div>
      </div>
    </div>
  `;

  // Add click events to links
  sidebar.querySelectorAll('.sidebar__link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo(link.dataset.page);
    });
  });

  updateHealthStatus();
}

async function updateHealthStatus() {
  const labelEl = document.querySelector('.sidebar__status-label');
  const dotEl = document.querySelector('.sidebar__status-dot');
  const barEl = document.querySelector('.sidebar__status-bar-fill');

  if (!labelEl || !dotEl) return;

  try {
    const health = await checkHealth();
    if (health && health.status === 'online') {
      labelEl.textContent = 'Conectado';
      labelEl.parentElement.parentElement.title = 'API disponível';
      dotEl.style.background = 'var(--color-teal)';

      if (barEl) barEl.style.background = 'var(--color-teal)';
    } else {
      throw new Error('Offline');
    }
  } catch (err) {
    labelEl.textContent = 'Desconectado';
    labelEl.parentElement.parentElement.title = 'Não foi possível verificar a conexão.';
    dotEl.style.background = 'var(--color-rose)';

    if (barEl) barEl.style.background = 'var(--color-rose)';
  }
}
