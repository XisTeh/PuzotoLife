import { pageSkeleton } from '../components/Feedback.js';
let navigation = 0;





















import { updateHeaderTitle } from '../components/Header.js';

export async function renderPage(pageId) {
  const ticket = ++navigation;
  const container = document.getElementById('pageContent');
  container.setAttribute('aria-busy', 'true');
  container.innerHTML = pageSkeleton();
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
    const { renderDashboard, initDashboard } = await import('./dashboard.js');
    if (ticket !== navigation) return;
    container.innerHTML = renderDashboard();
    await initDashboard();
  } else if (pageId === 'rel_geral') {
    updateHeaderTitle('Relatório Geral');
    const { renderRelatorioGeral, initRelatorioGeral } = await import('./relatorioGeral.js');
    if (ticket !== navigation) return;
    container.innerHTML = renderRelatorioGeral();
    await initRelatorioGeral();
  } else if (pageId === 'rel_financas') {
    updateHeaderTitle('Relatório Financeiro');
    const { renderRelatorioFinancas, initRelatorioFinancas } = await import('./relatorioFinancas.js');
    if (ticket !== navigation) return;
    container.innerHTML = renderRelatorioFinancas();
    await initRelatorioFinancas();
  } else if (pageId === 'rel_comparativo') {
    updateHeaderTitle('Comparativo Mensal');
    const { renderComparativoMensal, initComparativoMensal } = await import('./comparativoMensal.js');
    if (ticket !== navigation) return;
    container.innerHTML = renderComparativoMensal();
    await initComparativoMensal();
  } else if (pageId === 'lancamentos') {
    updateHeaderTitle('Lançamentos');
    const { renderLancamentos, initLancamentos } = await import('./lancamentos.js');
    if (ticket !== navigation) return;
    container.innerHTML = renderLancamentos();
    await initLancamentos();
  } else if (pageId === 'dr_ranon') {
    updateHeaderTitle('Dr. Ranon / RX');
    const { renderRanon, initRanon } = await import('./ranon.js');
    if (ticket !== navigation) return;
    container.innerHTML = renderRanon();
    await initRanon();
  } else if (pageId === 'rel_trabalho') {
    updateHeaderTitle('Relatório do Trabalho');
    const { renderRelatorioTrabalho, initRelatorioTrabalho } = await import('./relatorioTrabalho.js');
    if (ticket !== navigation) return;
    container.innerHTML = renderRelatorioTrabalho();
    await initRelatorioTrabalho();
  } else if (pageId === 'fechamento_mes') {
    updateHeaderTitle('Fechamento do Mês');
    const { renderFechamentoMes, initFechamentoMes } = await import('./fechamentoMes.js');
    if (ticket !== navigation) return;
    container.innerHTML = renderFechamentoMes();
    await initFechamentoMes();
  } else if (pageId === 'gastos') {
    updateHeaderTitle('Gastos');
    const { renderGastos, initGastos } = await import('./gastos.js');
    if (ticket !== navigation) return;
    container.innerHTML = renderGastos();
    await initGastos();
  } else if (pageId === 'cartoes') {
    updateHeaderTitle('Cartões');
    const { renderCartoesPage, initCartoes } = await import('./cartoes.js');
    if (ticket !== navigation) return;
    container.innerHTML = renderCartoesPage();
    await initCartoes();
  } else if (pageId === 'contas_pagar') {
    updateHeaderTitle('Contas a Pagar');
    const { renderContasPagarPage, initContasPagar } = await import('./contasPagar.js');
    if (ticket !== navigation) return;
    container.innerHTML = renderContasPagarPage();
    await initContasPagar();
  } else if (pageId === 'pessoas_dividas') {
    updateHeaderTitle('Pessoas / Dívidas');
    const { renderPessoasDividasPage, initPessoasDividas } = await import('./pessoasDividas.js');
    if (ticket !== navigation) return;
    container.innerHTML = renderPessoasDividasPage();
    await initPessoasDividas();
  } else if (pageId === 'receitas') {
    updateHeaderTitle('Receitas');
    const { renderReceitasPage, initReceitas } = await import('./receitas.js');
    if (ticket !== navigation) return;
    container.innerHTML = renderReceitasPage();
    await initReceitas();
  } else if (pageId === 'investimentos') {
    updateHeaderTitle('Cofre');
    const { renderInvestimentosPage, initInvestimentos } = await import('./investimentos.js');
    if (ticket !== navigation) return;
    container.innerHTML = renderInvestimentosPage();
    await initInvestimentos();
  } else if (pageId === 'historico') {
    updateHeaderTitle('Histórico');
    const { renderHistoricoPage, initHistorico } = await import('./historico.js');
    if (ticket !== navigation) return;
    container.innerHTML = renderHistoricoPage();
    await initHistorico();
  } else if (pageId === 'configuracoes') {
    updateHeaderTitle('Configurações');
    const { renderConfiguracoesPage, initConfiguracoes } = await import('./configuracoes.js');
    if (ticket !== navigation) return;
    container.innerHTML = renderConfiguracoesPage();
    await initConfiguracoes();
  } else if (pageId === 'backup') {
    updateHeaderTitle('Backup');
    const { renderBackupPage, initBackup } = await import('./backup.js');
    if (ticket !== navigation) return;
    container.innerHTML = renderBackupPage();
    await initBackup();

  } else if (pageId === 'importar_dados') {
    updateHeaderTitle('Importar Dados');
    const { renderImportarDadosPage, initImportarDados } = await import('./importarDados.js');
    if (ticket !== navigation) return;
    container.innerHTML = renderImportarDadosPage();
    await initImportarDados();
  } else if (pageId === 'diagnostico') {
    updateHeaderTitle('Diagnóstico do Sistema');
    const { renderDiagnosticoPage } = await import('./diagnostico.js');
    if (ticket !== navigation) return;
    container.innerHTML = renderDiagnosticoPage();
  } else if (pageId === 'ajuda') {
    updateHeaderTitle('Ajuda');
    const { renderAjudaPage } = await import('./ajuda.js');
    if (ticket !== navigation) return;
    container.innerHTML = renderAjudaPage();
  } else {
    const config = pageConfigs[pageId] || { title: 'Página não encontrada', subtitle: 'Em breve.', icon: 'alert-circle' };
    updateHeaderTitle(config.title);
    const { renderEmptyState } = await import('./empty.js');
    if (ticket !== navigation) return;
    container.innerHTML = renderEmptyState(config.title, config.subtitle, config.icon);
  }
    if (ticket === navigation) {
      window.lucide?.createIcons();
      container.scrollTop = 0;
      if (!document.getElementById('sidebar').classList.contains('is-open')) container.focus({ preventScroll: true });
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches && !document.documentElement.classList.contains('keyboard-input')) container.animate([{ opacity: 0.6, transform: 'translateY(4px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 180, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    }
  } catch {
    if (ticket === navigation) {
      container.innerHTML = '<section class="empty-state"><h2>Não foi possível abrir esta página</h2><p>Verifique sua conexão e tente novamente.</p><button class="btn btn--primary" id="retryPage">Tentar novamente</button></section>';
      container.querySelector('#retryPage').addEventListener('click', () => renderPage(pageId));
    }
  } finally { if (ticket === navigation) container.removeAttribute('aria-busy'); }
}
