import { appState } from './state.js';
import { renderSidebar } from './components/Sidebar.js';
import { renderHeader } from './components/Header.js';
import { renderPage } from './pages/index.js';
import { startSession } from './components/Session.js';
import { installFeedback } from './components/Feedback.js';
import { installLegacyHandlers } from './security/legacyHandlers.js';
import { installSafeHtmlPolicy } from './security/safeDom.js';
import { installResponsiveTables } from './components/ResponsiveTables.js';
import './icons.js';

// Force replacement of entrypoints cached before stable assets became no-store.
performance.mark?.('puzoto-entry-no-store-20260908');

installSafeHtmlPolicy();
installFeedback();
installLegacyHandlers();
installResponsiveTables(document.getElementById('pageContent'));
startSession(async (session) => {
  renderSidebar();
  renderHeader(session);
  await renderPage(appState.currentPage);
});

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
      await registration.update();
    } catch { /* A aplicação online continua funcionando sem o cache estático. */ }
  }, { once: true });
}
