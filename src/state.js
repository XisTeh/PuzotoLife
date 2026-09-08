import { renderPage } from './pages/index.js';
export const appState = {
  currentPage: 'dashboard',
  user: {
    name: 'Dr. Usuário',
    status: 'Conectado'
  }
};

export function navigateTo(pageId) {
  if (appState.currentPage === pageId) return Promise.resolve();
  appState.currentPage = pageId;
  
  // Atualiza sidebar
  document.querySelectorAll('.sidebar__link').forEach(link => {
    if (link.dataset.page === pageId) {
      link.classList.add('active');
      link.setAttribute('aria-current', 'page');
    } else {
      link.classList.remove('active');
      link.removeAttribute('aria-current');
    }
  });

  // Importa e renderiza a página
  return renderPage(pageId);
}

// Expor globalmente para uso em onclick inline
window.navigateTo = navigateTo;
