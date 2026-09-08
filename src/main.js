import { appState } from './state.js';
import { renderSidebar } from './components/Sidebar.js';
import { renderHeader } from './components/Header.js';
import { renderPage, warmPageModules } from './pages/index.js';
import { startSession } from './components/Session.js';
import { installFeedback } from './components/Feedback.js';
import { installLegacyHandlers } from './security/legacyHandlers.js';
import './icons.js';

installFeedback();
installLegacyHandlers();
startSession(async (session) => {
  renderSidebar();
  renderHeader(session);
  await renderPage(appState.currentPage);
  void warmPageModules();
});

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}), { once: true });
}
