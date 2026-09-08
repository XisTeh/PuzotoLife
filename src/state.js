import { renderPage } from './pages/index.js';
export const appState = {
  currentPage: 'dashboard',
  user: {
    name: 'Dr. Usuário',
    status: 'Conectado'
  }
};

export function navigateTo(pageId) {
  appState.currentPage = pageId;
  
  // Atualiza sidebar
  document.querySelectorAll('.sidebar__link').forEach(link => {
    if (link.dataset.page === pageId) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  // Importa e renderiza a página
  renderPage(pageId);
}

// Expor globalmente para uso em onclick inline
window.navigateTo = navigateTo;
