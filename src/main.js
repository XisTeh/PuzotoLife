import { appState } from './state.js';
import { renderSidebar } from './components/Sidebar.js';
import { renderHeader } from './components/Header.js';
import { renderPage } from './pages/index.js';
import { startSession } from './components/Session.js';
import { installFeedback } from './components/Feedback.js';
import './icons.js';

installFeedback();
startSession(async (session) => {
  renderSidebar();
  renderHeader(session);
  await renderPage(appState.currentPage);
});
