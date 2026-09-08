import { pageSkeleton } from '../components/Feedback.js';
import { bindLegacyHandlers } from '../security/legacyHandlers.js';
import { enhanceResponsiveTables } from '../components/ResponsiveTables.js';
let navigation = 0;

const pageModuleLoaders = {
  dashboard: () => import('./dashboard.js'),
  rel_geral: () => import('./relatorioGeral.js'),
  rel_financas: () => import('./relatorioFinancas.js'),
  rel_comparativo: () => import('./comparativoMensal.js'),
  lancamentos: () => import('./lancamentos.js'),
  dr_ranon: () => import('./ranon.js'),
  rel_trabalho: () => import('./relatorioTrabalho.js'),
  fechamento_mes: () => import('./fechamentoMes.js'),
  gastos: () => import('./gastos.js'),
  cartoes: () => import('./cartoes.js'),
  contas_pagar: () => import('./contasPagar.js'),
  pessoas_dividas: () => import('./pessoasDividas.js'),
  receitas: () => import('./receitas.js'),
  investimentos: () => import('./investimentos.js'),
  historico: () => import('./historico.js'),
  configuracoes: () => import('./configuracoes.js'),
  backup: () => import('./backup.js'),
  importar_dados: () => import('./importarDados.js'),
  diagnostico: () => import('./diagnostico.js'),
  ajuda: () => import('./ajuda.js')
};

const pageModulePromises = new Map();

export function preloadPage(pageId) {
  const loader = pageModuleLoaders[pageId];
  if (!loader) return Promise.resolve(null);
  if (!pageModulePromises.has(pageId)) {
    const request = loader().catch(error => {
      pageModulePromises.delete(pageId);
      throw error;
    });
    pageModulePromises.set(pageId, request);
  }
  return pageModulePromises.get(pageId);
}






















import { updateHeaderTitle } from '../components/Header.js';

function setPageContent(container, content) {
  container.innerHTML = content;
  bindLegacyHandlers(container);
  enhanceResponsiveTables(container);
  window.lucide?.createIcons();
}

export async function renderPage(pageId) {
  const ticket = ++navigation;
  const container = document.getElementById('pageContent');
  container.setAttribute('aria-busy', 'true');
  const skeletonTimer = setTimeout(() => {
    if (ticket === navigation) container.innerHTML = pageSkeleton();
  }, 100);
  try {
  
  // Mapeamento de títulos e ícones para as páginas vazias
  const pageConfigs = {
    // Trabalho
    'dr_ranon': { title: 'Dr. Ranon / RX', subtitle: 'Controle específico de laudos para o Dr. Ranon.', icon: 'stethoscope' },
    'empresas': { title: 'Empresas', subtitle: 'Cadastro e gestão de empresas e clínicas parceiras.', icon: 'building-2' },
    'fechamento_dia': { title: 'Fechamento do Dia', subtitle: 'Resumo e conciliação diária da produção.', icon: 'sun' },
    'fechamento_mes': { title: 'Fechamento do Mês', subtitle: 'Consolidação mensal e faturamento.', icon: 'calendar-check' },
    'historico': { title: 'Histórico', subtitle: 'Histórico completo de laudos digitados.', icon: 'history' },
    
    // Finanças
    'gastos': { title: 'Gastos', subtitle: 'Controle de despesas e saídas financeiras.', icon: 'arrow-down-circle' },
    'cartoes': { title: 'Cartões', subtitle: 'Gestão de faturas e limites de cartões de crédito.', icon: 'credit-card' },
    'contas_pagar': { title: 'Contas a Pagar', subtitle: 'Acompanhamento de vencimentos e boletos.', icon: 'receipt' },
    'pessoas_dividas': { title: 'Pessoas / Dívidas', subtitle: 'Controle de empréstimos, dívidas e contas com terceiros.', icon: 'users' },
    'receitas': { title: 'Receitas', subtitle: 'Registro de entradas e recebimentos.', icon: 'arrow-up-circle' },
    'investimentos': { title: 'Cofre', subtitle: 'Dinheiro guardado para usar quando precisar.', icon: 'piggy-bank' },
    'categorias': { title: 'Categorias', subtitle: 'Categorização para fluxo de caixa.', icon: 'tags' },
    
    // Relatórios
    'rel_geral': { title: 'Relatório Geral', subtitle: 'Visão consolidada de todas as suas métricas.', icon: 'bar-chart-2' },
    'rel_trabalho': { title: 'Relatórios de Trabalho', subtitle: 'Análise detalhada da sua produção.', icon: 'briefcase' },
    'rel_financas': { title: 'Relatórios Financeiros', subtitle: 'DRE e fluxo de caixa detalhado.', icon: 'pie-chart' },
    'rel_comparativo': { title: 'Comparativo Mensal', subtitle: 'Evolução mês a mês das suas receitas e despesas.', icon: 'trending-up' },
    
    // Sistema
    'configuracoes': { title: 'Configurações', subtitle: 'Ajustes gerais do sistema Puzoto Life.', icon: 'settings' },
    'backup': { title: 'Backup', subtitle: 'Rotinas de segurança e exportação de dados.', icon: 'database' },
    'importar_dados': { title: 'Importar Dados', subtitle: 'Importação de planilhas e sistemas legados.', icon: 'download-cloud' },
    'diagnostico': { title: 'Diagnóstico', subtitle: 'Diagnóstico completo do sistema.', icon: 'activity' }
  };

  if (pageId === 'dashboard') {
    updateHeaderTitle('Visão Geral');
    const { renderDashboard, initDashboard } = await preloadPage('dashboard');
    if (ticket !== navigation) return;
    clearTimeout(skeletonTimer);
    setPageContent(container, renderDashboard());
    await initDashboard();
  } else if (pageId === 'rel_geral') {
    updateHeaderTitle('Relatório Geral');
    const { renderRelatorioGeral, initRelatorioGeral } = await preloadPage('rel_geral');
    if (ticket !== navigation) return;
    clearTimeout(skeletonTimer);
    setPageContent(container, renderRelatorioGeral());
    await initRelatorioGeral();
  } else if (pageId === 'rel_financas') {
    updateHeaderTitle('Relatório Financeiro');
    const { renderRelatorioFinancas, initRelatorioFinancas } = await preloadPage('rel_financas');
    if (ticket !== navigation) return;
    clearTimeout(skeletonTimer);
    setPageContent(container, renderRelatorioFinancas());
    await initRelatorioFinancas();
  } else if (pageId === 'rel_comparativo') {
    updateHeaderTitle('Comparativo Mensal');
    const { renderComparativoMensal, initComparativoMensal } = await preloadPage('rel_comparativo');
    if (ticket !== navigation) return;
    clearTimeout(skeletonTimer);
    setPageContent(container, renderComparativoMensal());
    await initComparativoMensal();
  } else if (pageId === 'lancamentos') {
    updateHeaderTitle('Lançamentos');
    const { renderLancamentos, initLancamentos } = await preloadPage('lancamentos');
    if (ticket !== navigation) return;
    clearTimeout(skeletonTimer);
    setPageContent(container, renderLancamentos());
    await initLancamentos();
  } else if (pageId === 'dr_ranon') {
    updateHeaderTitle('Dr. Ranon / RX');
    const { renderRanon, initRanon } = await preloadPage('dr_ranon');
    if (ticket !== navigation) return;
    clearTimeout(skeletonTimer);
    setPageContent(container, renderRanon());
    await initRanon();
  } else if (pageId === 'rel_trabalho') {
    updateHeaderTitle('Relatório do Trabalho');
    const { renderRelatorioTrabalho, initRelatorioTrabalho } = await preloadPage('rel_trabalho');
    if (ticket !== navigation) return;
    clearTimeout(skeletonTimer);
    setPageContent(container, renderRelatorioTrabalho());
    await initRelatorioTrabalho();
  } else if (pageId === 'fechamento_mes') {
    updateHeaderTitle('Fechamento do Mês');
    const { renderFechamentoMes, initFechamentoMes } = await preloadPage('fechamento_mes');
    if (ticket !== navigation) return;
    clearTimeout(skeletonTimer);
    setPageContent(container, renderFechamentoMes());
    await initFechamentoMes();
  } else if (pageId === 'gastos') {
    updateHeaderTitle('Gastos');
    const { renderGastos, initGastos } = await preloadPage('gastos');
    if (ticket !== navigation) return;
    clearTimeout(skeletonTimer);
    setPageContent(container, renderGastos());
    await initGastos();
  } else if (pageId === 'cartoes') {
    updateHeaderTitle('Cartões');
    const { renderCartoesPage, initCartoes } = await preloadPage('cartoes');
    if (ticket !== navigation) return;
    clearTimeout(skeletonTimer);
    setPageContent(container, renderCartoesPage());
    await initCartoes();
  } else if (pageId === 'contas_pagar') {
    updateHeaderTitle('Contas a Pagar');
    const { renderContasPagarPage, initContasPagar } = await preloadPage('contas_pagar');
    if (ticket !== navigation) return;
    clearTimeout(skeletonTimer);
    setPageContent(container, renderContasPagarPage());
    await initContasPagar();
  } else if (pageId === 'pessoas_dividas') {
    updateHeaderTitle('Pessoas / Dívidas');
    const { renderPessoasDividasPage, initPessoasDividas } = await preloadPage('pessoas_dividas');
    if (ticket !== navigation) return;
    clearTimeout(skeletonTimer);
    setPageContent(container, renderPessoasDividasPage());
    await initPessoasDividas();
  } else if (pageId === 'receitas') {
    updateHeaderTitle('Receitas');
    const { renderReceitasPage, initReceitas } = await preloadPage('receitas');
    if (ticket !== navigation) return;
    clearTimeout(skeletonTimer);
    setPageContent(container, renderReceitasPage());
    await initReceitas();
  } else if (pageId === 'investimentos') {
    updateHeaderTitle('Cofre');
    const { renderInvestimentosPage, initInvestimentos } = await preloadPage('investimentos');
    if (ticket !== navigation) return;
    clearTimeout(skeletonTimer);
    setPageContent(container, renderInvestimentosPage());
    await initInvestimentos();
  } else if (pageId === 'historico') {
    updateHeaderTitle('Histórico');
    const { renderHistoricoPage, initHistorico } = await preloadPage('historico');
    if (ticket !== navigation) return;
    clearTimeout(skeletonTimer);
    setPageContent(container, renderHistoricoPage());
    await initHistorico();
  } else if (pageId === 'configuracoes') {
    updateHeaderTitle('Configurações');
    const { renderConfiguracoesPage, initConfiguracoes } = await preloadPage('configuracoes');
    if (ticket !== navigation) return;
    clearTimeout(skeletonTimer);
    setPageContent(container, renderConfiguracoesPage());
    await initConfiguracoes();
  } else if (pageId === 'backup') {
    updateHeaderTitle('Backup');
    const { renderBackupPage, initBackup } = await preloadPage('backup');
    if (ticket !== navigation) return;
    clearTimeout(skeletonTimer);
    setPageContent(container, renderBackupPage());
    await initBackup();

  } else if (pageId === 'importar_dados') {
    updateHeaderTitle('Importar Dados');
    const { renderImportarDadosPage, initImportarDados } = await preloadPage('importar_dados');
    if (ticket !== navigation) return;
    clearTimeout(skeletonTimer);
    setPageContent(container, renderImportarDadosPage());
    await initImportarDados();
  } else if (pageId === 'diagnostico') {
    updateHeaderTitle('Diagnóstico do Sistema');
    const { renderDiagnosticoPage } = await preloadPage('diagnostico');
    if (ticket !== navigation) return;
    clearTimeout(skeletonTimer);
    setPageContent(container, renderDiagnosticoPage());
  } else if (pageId === 'ajuda') {
    updateHeaderTitle('Ajuda');
    const { renderAjudaPage } = await preloadPage('ajuda');
    if (ticket !== navigation) return;
    clearTimeout(skeletonTimer);
    setPageContent(container, renderAjudaPage());
  } else {
    const config = pageConfigs[pageId] || { title: 'Página não encontrada', subtitle: 'Em breve.', icon: 'alert-circle' };
    updateHeaderTitle(config.title);
    const { renderEmptyState } = await import('./empty.js');
    if (ticket !== navigation) return;
    clearTimeout(skeletonTimer);
    setPageContent(container, renderEmptyState(config.title, config.subtitle, config.icon));
  }
    if (ticket === navigation) {
      bindLegacyHandlers(container);
      enhanceResponsiveTables(container);
      window.lucide?.createIcons();
      container.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      document.getElementById('mainContent')?.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      if (!document.getElementById('sidebar').classList.contains('is-open')) container.focus({ preventScroll: true });
    }
  } catch {
    if (ticket === navigation) {
      container.innerHTML = '<section class="empty-state"><h2>Não foi possível abrir esta página</h2><p>Verifique sua conexão e tente novamente.</p><button class="btn btn--primary" id="retryPage">Tentar novamente</button></section>';
      container.querySelector('#retryPage').addEventListener('click', () => renderPage(pageId));
    }
  } finally {
    clearTimeout(skeletonTimer);
    if (ticket === navigation) container.removeAttribute('aria-busy');
  }
}
