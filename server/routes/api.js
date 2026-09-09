/**
 * Rotas da API REST
 * Expõe os serviços para o frontend via HTTP.
 */

import express, { Router } from 'express';
import { logApiError } from '../observability/logger.js';
import { validateBackupFilenameParam, validateIdParam, validateTextParam } from '../security/requestValidation.js';

// Serviços
import { listarEmpresas, listarTodasEmpresas, obterEmpresaPorNome, obterEmpresaPorId, criarEmpresa, atualizarEmpresa, desativarEmpresa, ativarEmpresa } from '../services/empresas.js';
import { obterConfiguracao, obterTodasConfiguracoes, salvarConfiguracao } from '../services/configuracoes.js';
import {
  listarLoteTrabalhoPendente, adicionarItemLoteTrabalho,
  atualizarItemLoteTrabalho, removerItemLoteTrabalho,
  limparLoteTrabalho, calcularResumoLoteTrabalho
} from '../services/loteTrabalho.js';
import {
  listarLancamentosTrabalho, criarLancamentoTrabalho,
  atualizarStatusLancamento, calcularResumoLancamentosTrabalho,
  marcarLancamentoTrabalhoComoRecebido, obterResumoHistorico
} from '../services/lancamentosTrabalho.js';
import {
  listarLaudosRanonPendentes, adicionarLaudoRanonPendente,
  atualizarLaudoRanonPendente, removerLaudoRanonPendente,
  limparLaudosRanonPendentes, listarLaudosRanonHistorico,
  salvarLaudoRanonHistorico, calcularResumoRanon,
  marcarLaudoRanonComoRecebido
} from '../services/laudosRanon.js';
import { fecharDiaTrabalho, listarFechamentosDiarios, desfazerFechamentoDia } from '../services/fechamentoDia.js';
import {
  gerarPreviewMensal, fecharMesTrabalho, listarFechamentosMensais,
  obterFechamentoMensalPorReferencia
} from '../services/fechamentoMensal.js';
import { ajustarPadraoRetroativo, listarAjustesRetroativos } from '../services/ajusteRetroativo.js';
import { listarAuditoria } from '../services/auditoria.js';
import { gerarExcelRanon } from '../services/exportarExcelRanon.js';
import { salvarPlanilhaRanon, listarHistoricoPlanihas } from '../services/salvarPlanilhaRanon.js';
import { obterAnalyticsTrabalho } from '../services/analyticsTrabalho.js';
import {
  listarCategorias, criarCategoria, atualizarCategoria, desativarCategoria, ativarCategoria,
  listarGastos, criarGasto, atualizarGasto, removerGasto, calcularResumoGastos
} from '../services/financas.js';
import {
  listarCartoes, criarCartao, atualizarCartao, removerCartao, ativarCartao,
  listarComprasCartao, criarCompraCartao, criarCompraCartaoEmAndamento,
  obterCompraCartao, atualizarCompraCartao, excluirCompraCartao,
  listarFaturasCartao, obterFaturaComParcelas, marcarFaturaComoPaga,
  listarFaturasResumo, listarParcelasRecentes, listarComprasParceladas,
  anteciparParcelas
} from '../services/cartoes.js';
import {
  listarContasPagar, criarContaPagar, marcarContaComoPaga as marcarPagaCP,
  cancelarContaPagar, calcularResumoContasPagar, atualizarValorContaPagar
} from '../services/contasPagar.js';
import {
  listarPessoasDividas, criarPessoaDivida, marcarPessoaDividaResolvida,
  cancelarPessoaDivida, removerPessoaDivida, calcularResumoPessoasDividas,
  obterHistoricoPessoa, listarPessoasUnicas,
  listarDividasParceladas, criarDividaParcelada, pagarProximaParcelaDivida,
  excluirDividaParcelada, obterDividaParcelada, atualizarValorPessoaDivida
} from '../services/pessoasDividas.js';
import {
  listarReceitas, criarReceita, atualizarReceita, marcarReceitaComoRecebida,
  cancelarReceita, removerReceita, calcularResumoReceitas, listarOrigensReceitaUnicas
} from '../services/receitas.js';
import { obterDashboard } from '../services/dashboard.js';
import {
  listarInvestimentos, obterInvestimento, criarInvestimento, atualizarInvestimento,
  definirInvestimentoAtivo, listarMovimentosInvestimento,
  registrarMovimentoInvestimento, ajustarSaldoInvestimento
} from '../services/investimentos.js';
import { obterRelatorioGeral } from '../services/relatorioGeral.js';
import { obterRelatorioFinancas } from '../services/relatorioFinancas.js';
import { obterComparativoMensal } from '../services/comparativoMensal.js';
import {
  obterInfoBanco, criarBackupManual, listarBackups,
  obterCaminhoBackup, restaurarBackup, excluirBackup,
  exportarJSON, exportarCSVTrabalho, exportarCSVFinancas
} from '../services/backup.js';
import {
  validarArquivoJSON, gerarPreviewImportacao, importarJSON
} from '../services/importarDados.js';
import { executarDiagnostico } from '../services/diagnostico.js';
import { executarLimpezaDadosTeste } from '../services/limpezaDados.js';
import { obterPainelGastos, obterPainelContasPagar, obterPainelReceitas, obterPainelInvestimentos, obterPainelLancamentos, obterPainelRanon, executarComPainel } from '../services/pageData.js';
import {
  listarPagadores, listarTodosPagadores, criarPagador, atualizarPagador, 
  obterResumoPorPagador, ativarPagador, desativarPagador, obterRecebimentosPendentes, processarRecebimentoPagador
} from '../services/pagadores.js';

const router = Router();
function comPainel(req, operacao, carregarPainel) {
  return req.query.painel === 'true'
    ? executarComPainel(operacao, () => carregarPainel(req.query)) : operacao();
}
router.param('id', validateIdParam);
router.param('filename', validateBackupFilenameParam);
router.param('nome', validateTextParam('Nome'));
router.param('chave', validateTextParam('Chave', 100));
router.param('referencia', validateTextParam('Referência', 20));


// Helper para try/catch uniforme (suporta sync e async)
function asyncHandler(fn) {
  return async (req, res) => {
    try {
      const result = await fn(req, res);
      res.json({ ok: true, data: result });
    } catch (err) {
      logApiError(req, res, err, 500);
      res.status(500).json({ ok: false, error: process.env.NODE_ENV === 'production' ? 'Não foi possível concluir a operação.' : err.message });
    }
  };
}

// ═══════════════════════════════════════
// EMPRESAS
// ═══════════════════════════════════════
router.get('/empresas', asyncHandler(async (req) => req.query.todas === 'true' ? (await listarTodasEmpresas()) : (await listarEmpresas())));
router.get('/empresas/:id', asyncHandler(async (req) => (await obterEmpresaPorId(Number(req.params.id)))));
router.get('/empresas/nome/:nome', asyncHandler(async (req) => (await obterEmpresaPorNome(req.params.nome))));
router.post('/empresas', async (req, res) => {
  try {
    const id = (await criarEmpresa(req.body));
    const novaEmpresa = (await obterEmpresaPorId(id));
    res.json({ success: true, message: 'Empresa criada com sucesso.', empresa: novaEmpresa });
  } catch (err) {
    logApiError(req, res, err, 500);
    res.status(500).json({ success: false, message: 'Erro ao criar empresa.', error: process.env.NODE_ENV === 'production' ? 'Não foi possível concluir a operação.' : err.message });
  }
});

router.put('/empresas/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const empresaAtual = (await obterEmpresaPorId(id));
    if (!empresaAtual) {
      return res.status(404).json({ success: false, message: 'Empresa não encontrada.' });
    }
    
    (await atualizarEmpresa(id, req.body));
    const empresaAtualizada = (await obterEmpresaPorId(id));
    
    res.json({ success: true, message: 'Empresa atualizada com sucesso.', empresa: empresaAtualizada });
  } catch (err) {
    logApiError(req, res, err, 500);
    res.status(500).json({ success: false, message: 'Erro ao atualizar empresa.', error: process.env.NODE_ENV === 'production' ? 'Não foi possível concluir a operação.' : err.message });
  }
});
router.post('/empresas/:id/desativar', asyncHandler(async (req) => { (await desativarEmpresa(Number(req.params.id))); return { success: true }; }));
router.post('/empresas/:id/ativar', asyncHandler(async (req) => { (await ativarEmpresa(Number(req.params.id))); return { success: true }; }));

// ═══════════════════════════════════════
// CONFIGURAÇÕES
// ═══════════════════════════════════════
router.get('/configuracoes', asyncHandler(async () => (await obterTodasConfiguracoes())));
router.get('/configuracoes/:chave', asyncHandler(async (req) => (await obterConfiguracao(req.params.chave))));
router.post('/configuracoes', asyncHandler(async (req) => {
  const { chave, valor } = req.body;
  return (await salvarConfiguracao(chave, valor));
}));

// ═══════════════════════════════════════
// LOTE DE TRABALHO PENDENTE
// ═══════════════════════════════════════
router.get('/lote-trabalho/painel', asyncHandler(() => obterPainelLancamentos()));
router.get('/lote-trabalho', asyncHandler(async () => (await listarLoteTrabalhoPendente())));
router.get('/lote-trabalho/resumo', asyncHandler(async () => (await calcularResumoLoteTrabalho())));
router.post('/lote-trabalho', asyncHandler(async (req) => comPainel(req, () => adicionarItemLoteTrabalho(req.body), obterPainelLancamentos)));
router.put('/lote-trabalho/:id', asyncHandler(async (req) => comPainel(req, () => atualizarItemLoteTrabalho(Number(req.params.id), req.body), obterPainelLancamentos)));
router.delete('/lote-trabalho/:id', asyncHandler(async (req) => comPainel(req, () => removerItemLoteTrabalho(Number(req.params.id)), obterPainelLancamentos)));
router.delete('/lote-trabalho', asyncHandler(async () => (await limparLoteTrabalho())));

// ═══════════════════════════════════════
// LANÇAMENTOS DE TRABALHO (DEFINITIVO)
// ═══════════════════════════════════════
router.get('/lancamentos', asyncHandler(async (req) => (await listarLancamentosTrabalho(req.query))));
router.get('/lancamentos/resumo', asyncHandler(async (req) => (await calcularResumoLancamentosTrabalho(req.query.mes))));
router.post('/lancamentos', asyncHandler(async (req) => (await criarLancamentoTrabalho(req.body))));
router.patch('/lancamentos/:id/status', asyncHandler(async (req) => {
  return (await atualizarStatusLancamento(Number(req.params.id), req.body.status, req.body.recebido_em));
}));
router.post('/trabalho/lancamentos/:id/receber', asyncHandler(async (req) => (await marcarLancamentoTrabalhoComoRecebido(Number(req.params.id)))));
router.get('/trabalho/historico/resumo', asyncHandler(async (req) => (await obterResumoHistorico(req.query.mes, req.query.empresa_id, req.query.status))));

// ═══════════════════════════════════════
// DR. RANON / RX — PENDENTES
// ═══════════════════════════════════════
router.get('/ranon/painel', asyncHandler(() => obterPainelRanon()));
router.get('/ranon/pendentes', asyncHandler(async () => (await listarLaudosRanonPendentes())));
router.post('/ranon/pendentes', asyncHandler(async (req) => comPainel(req, () => adicionarLaudoRanonPendente(req.body), obterPainelRanon)));
router.put('/ranon/pendentes/:id', asyncHandler(async (req) => comPainel(req, () => atualizarLaudoRanonPendente(Number(req.params.id), req.body), obterPainelRanon)));
router.delete('/ranon/pendentes/:id', asyncHandler(async (req) => comPainel(req, () => removerLaudoRanonPendente(Number(req.params.id)), obterPainelRanon)));
router.delete('/ranon/pendentes', asyncHandler(async () => (await limparLaudosRanonPendentes())));

// ═══════════════════════════════════════
// DR. RANON / RX — EXPORTAR EXCEL
// ═══════════════════════════════════════
router.get('/ranon/exportar-excel', async (req, res) => {
  try {
    const { buffer, nomeArquivo } = await gerarExcelRanon();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo}"; filename*=UTF-8''${encodeURIComponent(nomeArquivo)}`);
    res.send(Buffer.from(buffer));
  } catch (err) {
    logApiError(req, res, err, 400);
    res.status(400).json({ ok: false, error: process.env.NODE_ENV === 'production' ? 'Não foi possível concluir a operação.' : err.message });
  }
});

// ═══════════════════════════════════════
// DR. RANON / RX — HISTÓRICO
// ═══════════════════════════════════════
router.get('/ranon/historico', asyncHandler(async (req) => (await listarLaudosRanonHistorico(req.query))));
router.post('/ranon/historico', asyncHandler(async (req) => (await salvarLaudoRanonHistorico(req.body))));
router.post('/ranon/historico/:id/receber', asyncHandler(async (req) => (await marcarLaudoRanonComoRecebido(Number(req.params.id)))));
router.get('/ranon/resumo', asyncHandler(async (req) => (await calcularResumoRanon(req.query.mes))));

// ═══════════════════════════════════════
// DR. RANON / RX — SALVAR PLANILHA
// ═══════════════════════════════════════
router.post('/ranon/salvar-planilha', async (req, res) => {
  try {
    const { mes_referencia } = req.body;
    if (!mes_referencia) {
      return res.status(400).json({ ok: false, error: 'Mês de referência é obrigatório.' });
    }
    const resultado = await salvarPlanilhaRanon(mes_referencia);
    res.json({ ok: resultado.success, data: resultado });
  } catch (err) {
    logApiError(req, res, err, 500);
    res.status(500).json({ ok: false, error: process.env.NODE_ENV === 'production' ? 'Não foi possível concluir a operação.' : err.message });
  }
});

router.get('/ranon/historico-planilhas', asyncHandler(async (req) => {
  const limit = parseInt(req.query.limit) || 5;
  return (await listarHistoricoPlanihas(limit));
}));

// ═══════════════════════════════════════
// FECHAMENTO DO DIA
// ═══════════════════════════════════════
router.get('/fechamentos/diarios', asyncHandler(async () => (await listarFechamentosDiarios())));
router.post('/fechamentos/dia', asyncHandler(async (req) => (await fecharDiaTrabalho(req.body?.data))));
router.delete('/fechamentos/dia/:id', asyncHandler(async (req) => (await desfazerFechamentoDia(Number(req.params.id)))));

// ═══════════════════════════════════════
// FECHAMENTO MENSAL
// ═══════════════════════════════════════
router.get('/fechamentos/mensais', asyncHandler(async () => (await listarFechamentosMensais())));
router.get('/fechamentos/mensais/preview', asyncHandler(async (req) => (await gerarPreviewMensal(req.query.mes))));
router.get('/fechamentos/mensais/:referencia', asyncHandler(async (req) => (await obterFechamentoMensalPorReferencia(req.params.referencia))));
router.post('/fechamentos/mensal', asyncHandler(async (req) => (await fecharMesTrabalho(req.body.mes, req.body.referencia))));

// ═══════════════════════════════════════
// AJUSTE RETROATIVO
// ═══════════════════════════════════════
router.get('/ajustes', asyncHandler(async (req) => (await listarAjustesRetroativos(req.query.referencia))));
router.post('/ajustes/padrao', asyncHandler(async (req) => {
  const { fechamento_mensal_id, quantidade, valor_unitario, observacao, empresa } = req.body;
  return (await ajustarPadraoRetroativo(fechamento_mensal_id, quantidade, valor_unitario, observacao, empresa || 'Padrão'));
}));

// ═══════════════════════════════════════
// AUDITORIA
// ═══════════════════════════════════════
router.get('/auditoria', asyncHandler(async (req) => (await listarAuditoria(req.query))));

// ═══════════════════════════════════════
// ANALYTICS DO TRABALHO
// ═══════════════════════════════════════
router.get('/trabalho/analytics', asyncHandler(async (req) => {
  const mes = req.query.mes || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const empresa = req.query.empresa || 'todas';
  const status = req.query.status || 'todos';
  return (await obterAnalyticsTrabalho(mes, empresa, status));
}));

// ═══════════════════════════════════════
// FINANÇAS — CATEGORIAS
// ═══════════════════════════════════════
router.get('/financas/categorias', asyncHandler(async (req) => (await listarCategorias(req.query))));
router.post('/financas/categorias', asyncHandler(async (req) => (await criarCategoria(req.body))));
router.put('/financas/categorias/:id', asyncHandler(async (req) => (await atualizarCategoria(Number(req.params.id), req.body))));
router.delete('/financas/categorias/:id', asyncHandler(async (req) => { (await desativarCategoria(Number(req.params.id))); return { success: true }; }));
router.post('/financas/categorias/:id/desativar', asyncHandler(async (req) => { (await desativarCategoria(Number(req.params.id))); return { success: true }; }));
router.post('/financas/categorias/:id/ativar', asyncHandler(async (req) => { (await ativarCategoria(Number(req.params.id))); return { success: true }; }));

// ═══════════════════════════════════════
// FINANÇAS — GASTOS
// ═══════════════════════════════════════
router.get('/financas/gastos', asyncHandler(async (req) => (await listarGastos(req.query))));
router.get('/financas/gastos-painel', asyncHandler(async (req) => obterPainelGastos(req.query)));
router.post('/financas/gastos', asyncHandler(async (req) => comPainel(req, () => criarGasto(req.body), obterPainelGastos)));
router.put('/financas/gastos/:id', asyncHandler(async (req) => comPainel(req, () => atualizarGasto(Number(req.params.id), req.body), obterPainelGastos)));
router.delete('/financas/gastos/:id', asyncHandler(async (req) => { (await removerGasto(Number(req.params.id))); return { success: true }; }));
router.get('/financas/gastos/resumo', asyncHandler(async (req) => (await calcularResumoGastos(req.query))));

// ═══════════════════════════════════════
// FINANÇAS — CARTÕES E FATURAS
// ═══════════════════════════════════════
router.get('/financas/cartoes', asyncHandler(async () => (await listarCartoes())));
router.post('/financas/cartoes', asyncHandler(async (req) => (await criarCartao(req.body))));
// Rotas com caminhos estáticos ANTES de :id
router.get('/financas/cartoes/compras', asyncHandler(async (req) => (await listarComprasCartao(req.query.cartao_id ? Number(req.query.cartao_id) : null))));
router.get('/financas/cartoes/compras-parceladas', asyncHandler(async () => (await listarComprasParceladas())));
router.get('/financas/cartoes/compras-parceladas/:id', asyncHandler(async (req) => (await obterCompraCartao(Number(req.params.id)))));
router.put('/financas/cartoes/compras-parceladas/:id', asyncHandler(async (req) => (await atualizarCompraCartao(Number(req.params.id), req.body))));
router.delete('/financas/cartoes/compras-parceladas/:id', asyncHandler(async (req) => (await excluirCompraCartao(Number(req.params.id), req.body.confirmacao))));
router.post('/financas/cartoes/compras', asyncHandler(async (req) => (await criarCompraCartao(req.body))));
router.post('/financas/cartoes/compras/em-andamento', asyncHandler(async (req) => (await criarCompraCartaoEmAndamento(req.body))));
router.get('/financas/cartoes/faturas', asyncHandler(async (req) => (await listarFaturasCartao(req.query))));
router.get('/financas/cartoes/faturas/resumo', asyncHandler(async () => (await listarFaturasResumo())));
router.get('/financas/cartoes/faturas/:id', asyncHandler(async (req) => (await obterFaturaComParcelas(Number(req.params.id)))));
router.post('/financas/cartoes/faturas/:id/pagar', asyncHandler(async (req) => (await marcarFaturaComoPaga(Number(req.params.id), req.body))));
router.get('/financas/cartoes/parcelas/recentes', asyncHandler(async () => (await listarParcelasRecentes())));
router.post('/financas/cartoes/parcelas/antecipar', asyncHandler(async (req) => (await anteciparParcelas(req.body))));
// Rotas com :id genérico por último
router.put('/financas/cartoes/:id', asyncHandler(async (req) => (await atualizarCartao(Number(req.params.id), req.body))));
router.delete('/financas/cartoes/:id', asyncHandler(async (req) => (await removerCartao(Number(req.params.id), req.query.forcar === 'true'))));
router.post('/financas/cartoes/:id/desativar', asyncHandler(async (req) => (await ativarCartao(Number(req.params.id), false))));
router.post('/financas/cartoes/:id/ativar', asyncHandler(async (req) => (await ativarCartao(Number(req.params.id), true))));

// ═══════════════════════════════════════
// FINANÇAS — CONTAS A PAGAR
// ═══════════════════════════════════════
router.get('/financas/contas-pagar', asyncHandler(async (req) => (await listarContasPagar(req.query))));
router.get('/financas/contas-pagar-painel', asyncHandler(async (req) => obterPainelContasPagar(req.query)));
router.post('/financas/contas-pagar', asyncHandler(async (req) => (await criarContaPagar(req.body))));
router.post('/financas/contas-pagar/:id/pagar', asyncHandler((req) => marcarPagaCP(Number(req.params.id))));
router.post('/financas/contas-pagar/:id/cancelar', asyncHandler(async (req) => (await cancelarContaPagar(Number(req.params.id)))));
router.put('/financas/contas-pagar/:id/valor', asyncHandler(async (req) => (await atualizarValorContaPagar(Number(req.params.id), req.body.valor))));
router.get('/financas/contas-pagar/resumo', asyncHandler(async (req) => (await calcularResumoContasPagar(req.query.mes))));

// ═══════════════════════════════════════
// FINANÇAS — PESSOAS / DÍVIDAS
// ═══════════════════════════════════════
router.get('/financas/pessoas-dividas', asyncHandler(async (req) => (await listarPessoasDividas(req.query))));
router.post('/financas/pessoas-dividas', asyncHandler(async (req) => (await criarPessoaDivida(req.body))));
router.put('/financas/pessoas-dividas/:id/valor', asyncHandler(async (req) => (await atualizarValorPessoaDivida(req.params.id, parseFloat(req.body.valor)))));
router.post('/financas/pessoas-dividas/:id/resolver', asyncHandler(async (req) => {
  const idStr = req.params.id;
  if (idStr.startsWith('dp_')) {
    const grupoId = Number(idStr.replace('dp_', ''));
    return (await pagarProximaParcelaDivida(grupoId));
  } else {
    return (await marcarPessoaDividaResolvida(Number(idStr)));
  }
}));
router.post('/financas/pessoas-dividas/:id/cancelar', asyncHandler(async (req) => {
  const idStr = req.params.id;
  if (idStr.startsWith('dp_')) {
    const grupoId = Number(idStr.replace('dp_', ''));
    return (await excluirDividaParcelada(grupoId));
  } else {
    return (await cancelarPessoaDivida(Number(idStr), req.body.todasParcelas));
  }
}));
router.delete('/financas/pessoas-dividas/:id', asyncHandler(async (req) => {
  const idStr = req.params.id;
  if (idStr.startsWith('dp_')) {
    const grupoId = Number(idStr.replace('dp_', ''));
    return (await excluirDividaParcelada(grupoId));
  } else {
    return (await removerPessoaDivida(Number(idStr), req.query.todasParcelas === 'true'));
  }
}));
router.get('/financas/pessoas-dividas/resumo', asyncHandler(async (req) => (await calcularResumoPessoasDividas(req.query.mes))));
router.get('/financas/pessoas-dividas/historico/:nome', asyncHandler(async (req) => (await obterHistoricoPessoa(req.params.nome))));
router.get('/financas/pessoas-dividas/nomes', asyncHandler(async () => (await listarPessoasUnicas())));

// Dívidas Parceladas
router.get('/financas/dividas-parceladas', asyncHandler(async (req) => (await listarDividasParceladas(req.query))));
router.post('/financas/dividas-parceladas', asyncHandler(async (req) => (await criarDividaParcelada(req.body))));
router.get('/financas/dividas-parceladas/:id', asyncHandler(async (req) => (await obterDividaParcelada(Number(req.params.id)))));
router.post('/financas/dividas-parceladas/:id/pagar', asyncHandler(async (req) => (await pagarProximaParcelaDivida(Number(req.params.id)))));
router.delete('/financas/dividas-parceladas/:id', asyncHandler(async (req) => (await excluirDividaParcelada(Number(req.params.id)))));

// ═══════════════════════════════════════
// FINANÇAS — RECEITAS
// ═══════════════════════════════════════
router.get('/financas/receitas', asyncHandler(async (req) => (await listarReceitas(req.query))));
router.get('/financas/receitas-painel', asyncHandler(async (req) => obterPainelReceitas(req.query)));
router.post('/financas/receitas', asyncHandler(async (req) => comPainel(req, () => criarReceita(req.body), obterPainelReceitas)));
router.put('/financas/receitas/:id', asyncHandler(async (req) => comPainel(req, () => atualizarReceita(Number(req.params.id), req.body), obterPainelReceitas)));
router.post('/financas/receitas/:id/receber', asyncHandler(async (req) => (await marcarReceitaComoRecebida(Number(req.params.id)))));
router.post('/financas/receitas/:id/cancelar', asyncHandler(async (req) => (await cancelarReceita(Number(req.params.id)))));
router.delete('/financas/receitas/:id', asyncHandler(async (req) => (await removerReceita(Number(req.params.id)))));
router.get('/financas/receitas/resumo', asyncHandler(async (req) => (await calcularResumoReceitas(req.query.mes))));
router.get('/financas/receitas/origens', asyncHandler(async () => (await listarOrigensReceitaUnicas())));

// INVESTIMENTOS
router.get('/financas/investimentos-painel', asyncHandler(async (req) => obterPainelInvestimentos(req.query.incluir_inativos !== 'false')));
router.get('/financas/investimentos', asyncHandler(async (req) => (await listarInvestimentos(req.query.incluir_inativos !== 'false'))));
router.post('/financas/investimentos', asyncHandler(async (req) => (await criarInvestimento(req.body))));
router.get('/financas/investimentos/:id', asyncHandler(async (req) => (await obterInvestimento(Number(req.params.id)))));
router.put('/financas/investimentos/:id', asyncHandler(async (req) => (await atualizarInvestimento(Number(req.params.id), req.body))));
router.post('/financas/investimentos/:id/ativar', asyncHandler(async (req) => (await definirInvestimentoAtivo(Number(req.params.id), true))));
router.post('/financas/investimentos/:id/desativar', asyncHandler(async (req) => (await definirInvestimentoAtivo(Number(req.params.id), false))));
router.get('/financas/investimentos/:id/movimentos', asyncHandler(async (req) => (await listarMovimentosInvestimento(Number(req.params.id)))));
router.post('/financas/investimentos/:id/movimentos', asyncHandler(async (req) => (await registrarMovimentoInvestimento(Number(req.params.id), req.body))));
router.post('/financas/investimentos/:id/ajustar', asyncHandler(async (req) => (await ajustarSaldoInvestimento(Number(req.params.id), req.body))));

// ═══════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════
router.get('/dashboard', asyncHandler(async (req) => {
  const mes = req.query.mes || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  return (await obterDashboard(mes));
}));

// ═══════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════
// RELATÓRIOS
// ═══════════════════════════════════════

router.get('/relatorios/geral', async (req, res) => {
  try {
    const mes = req.query.mes;
    if (!mes) return res.status(400).json({ success: false, message: 'Mês não informado' });

    const dados = (await obterRelatorioGeral(mes));
    res.json({ ok: true, data: dados });
  } catch (error) {
    logApiError(req, res, error, 500);
    res.status(500).json({ success: false, message: process.env.NODE_ENV === 'production' ? 'Não foi possível concluir a operação.' : error.message });
  }
});

router.get('/relatorios/financas', asyncHandler(async (req) => {
  const mes = req.query.mes;
  if (!mes) throw new Error('Mês não informado');
  return (await obterRelatorioFinancas(mes));
}));

router.get('/relatorios/comparativo-mensal', asyncHandler(async (req) => {
  const { inicio, fim } = req.query;
  return (await obterComparativoMensal(inicio, fim));
}));

// ═══════════════════════════════════════
// DIAGNÓSTICO E SISTEMA
// ═══════════════════════════════════════
router.get('/diagnostico/completo', async (req, res) => {
  try {
    const result = (await executarDiagnostico());
    res.json(result);
  } catch (err) {
    logApiError(req, res, err, 500);
    res.status(500).json({ success: false, error: process.env.NODE_ENV === 'production' ? 'Não foi possível concluir a operação.' : err.message });
  }
});

router.post('/sistema/limpar-dados-teste', async (req, res) => {
  try {
    const { confirmacao } = req.body;
    if (!confirmacao) {
      return res.status(400).json({ success: false, error: 'Confirmação não informada.' });
    }
    const result = (await executarLimpezaDadosTeste(confirmacao));
    res.json(result);
  } catch (err) {
    logApiError(req, res, err, 400);
    res.status(400).json({ success: false, error: process.env.NODE_ENV === 'production' ? 'Não foi possível concluir a operação.' : err.message });
  }
});

// ═══════════════════════════════════════
// BACKUP
// ═══════════════════════════════════════

router.get('/backup/info', async (req, res) => {
  try {
    const info = obterInfoBanco();
    res.json({ ok: true, data: info });
  } catch (err) {
    logApiError(req, res, err, 500);
    res.status(500).json({ ok: false, error: process.env.NODE_ENV === 'production' ? 'Não foi possível concluir a operação.' : err.message });
  }
});

router.post('/backup/criar', async (req, res) => {
  try {
    const resultado = await criarBackupManual();
    res.json({ ok: true, data: resultado });
  } catch (err) {
    logApiError(req, res, err, 500);
    res.status(500).json({ ok: false, error: process.env.NODE_ENV === 'production' ? 'Não foi possível concluir a operação.' : err.message });
  }
});

router.get('/backup/listar', async (req, res) => {
  try {
    const backups = listarBackups();
    res.json({ ok: true, data: backups });
  } catch (err) {
    logApiError(req, res, err, 500);
    res.status(500).json({ ok: false, error: process.env.NODE_ENV === 'production' ? 'Não foi possível concluir a operação.' : err.message });
  }
});

router.get('/backup/download/:filename', async (req, res) => {
  try {
    const filePath = obterCaminhoBackup(req.params.filename);
    res.download(filePath, req.params.filename);
  } catch (err) {
    logApiError(req, res, err, 400);
    res.status(400).json({ ok: false, error: process.env.NODE_ENV === 'production' ? 'Não foi possível concluir a operação.' : err.message });
  }
});

router.post('/backup/restaurar', async (req, res) => {
  try {
    const { filename, confirmacao } = req.body;
    const resultado = (await restaurarBackup(filename, confirmacao));
    res.json({ ok: true, data: resultado });
  } catch (err) {
    logApiError(req, res, err, 500);
    res.status(500).json({ ok: false, error: process.env.NODE_ENV === 'production' ? 'Não foi possível concluir a operação.' : err.message });
  }
});

router.delete('/backup/:filename', async (req, res) => {
  try {
    const resultado = excluirBackup(req.params.filename);
    res.json({ ok: true, data: resultado });
  } catch (err) {
    logApiError(req, res, err, 400);
    res.status(400).json({ ok: false, error: process.env.NODE_ENV === 'production' ? 'Não foi possível concluir a operação.' : err.message });
  }
});

router.get('/backup/exportar-json', async (req, res) => {
  try {
    const dados = (await exportarJSON());
    const pad = (n) => String(n).padStart(2, '0');
    const now = new Date();
    const ts = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    const filename = `puzoto_life_export_${ts}.json`;
    
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(dados, null, 2));
  } catch (err) {
    logApiError(req, res, err, 500);
    res.status(500).json({ ok: false, error: process.env.NODE_ENV === 'production' ? 'Não foi possível concluir a operação.' : err.message });
  }
});

router.get('/backup/exportar-csv-trabalho', async (req, res) => {
  try {
    const sections = (await exportarCSVTrabalho());
    const pad = (n) => String(n).padStart(2, '0');
    const now = new Date();
    const ts = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    const filename = `puzoto_life_trabalho_${ts}.csv`;
    
    let csv = '';
    for (const [tabela, content] of Object.entries(sections)) {
      if (content) {
        csv += `=== ${tabela.toUpperCase()} ===\n${content}\n\n`;
      }
    }
    
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.send('\uFEFF' + csv); // BOM para Excel
  } catch (err) {
    logApiError(req, res, err, 500);
    res.status(500).json({ ok: false, error: process.env.NODE_ENV === 'production' ? 'Não foi possível concluir a operação.' : err.message });
  }
});

router.get('/backup/exportar-csv-financas', async (req, res) => {
  try {
    const sections = (await exportarCSVFinancas());
    const pad = (n) => String(n).padStart(2, '0');
    const now = new Date();
    const ts = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    const filename = `puzoto_life_financas_${ts}.csv`;
    
    let csv = '';
    for (const [tabela, content] of Object.entries(sections)) {
      if (content) {
        csv += `=== ${tabela.toUpperCase()} ===\n${content}\n\n`;
      }
    }
    
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.send('\uFEFF' + csv); // BOM para Excel
  } catch (err) {
    logApiError(req, res, err, 500);
    res.status(500).json({ ok: false, error: process.env.NODE_ENV === 'production' ? 'Não foi possível concluir a operação.' : err.message });
  }
});

// ===========================================
// IMPORTAR DADOS
// ===========================================

router.post('/importar/validar-json', express.text({ type: '*/*', limit: '50mb' }), async (req, res) => {
  try {
    const conteudo = req.body;
    if (!conteudo || typeof conteudo !== 'string' || conteudo.trim().length === 0) {
      return res.status(400).json({ ok: false, error: 'Nenhum conteudo recebido. Envie o JSON como texto no body.' });
    }

    const resultado = validarArquivoJSON(conteudo);

    if (!resultado.valido) {
      return res.status(400).json({ ok: false, error: resultado.erro });
    }

    res.json({
      ok: true,
      data: {
        success: true,
        message: 'Arquivo validado com sucesso.',
        preview: resultado.preview
      }
    });
  } catch (err) {
    logApiError(req, res, err, 500);
    res.status(500).json({ ok: false, error: process.env.NODE_ENV === 'production' ? 'Não foi possível concluir a operação.' : err.message });
  }
});

router.post('/importar/json', express.text({ type: '*/*', limit: '50mb' }), async (req, res) => {
  try {
    const body = req.body;
    if (!body || typeof body !== 'string' || body.trim().length === 0) {
      return res.status(400).json({ ok: false, error: 'Nenhum conteudo recebido.' });
    }

    // O frontend envia JSON com { conteudo, modo, evitarDuplicados, confirmacao }
    let payload;
    try {
      payload = JSON.parse(body);
    } catch (e) {
      return res.status(400).json({ ok: false, error: 'Payload invalido.' });
    }

    const { conteudo, modo, evitarDuplicados, confirmacao } = payload;

    if (!conteudo) {
      return res.status(400).json({ ok: false, error: 'Campo conteudo e obrigatorio.' });
    }

    const resultado = (await importarJSON(conteudo, {
      modo: modo || 'adicionar',
      evitarDuplicados: evitarDuplicados !== false,
      confirmacao: confirmacao
    }));

    res.json({ ok: true, data: resultado });
  } catch (err) {
    logApiError(req, res, err, 500);
    res.status(500).json({ ok: false, error: process.env.NODE_ENV === 'production' ? 'Não foi possível concluir a operação.' : err.message });
  }
});

// ═══════════════════════════════════════
// PAGADORES
// ═══════════════════════════════════════

router.get('/pagadores', asyncHandler(async () => (await listarPagadores())));
router.get('/pagadores/todos', asyncHandler(async () => (await listarTodosPagadores())));
router.get('/pagadores/resumo', asyncHandler(async (req) => (await obterResumoPorPagador(req.query.mes))));
router.get('/pagadores/recebimentos-pendentes', asyncHandler(async (req) => (await obterRecebimentosPendentes(req.query.mes))));
router.post('/pagadores/receber', asyncHandler(async (req) => (await processarRecebimentoPagador(req.body))));
router.post('/pagadores', asyncHandler(async (req) => (await criarPagador(req.body))));
router.put('/pagadores/:id', asyncHandler(async (req) => (await atualizarPagador(parseInt(req.params.id), req.body))));
router.post('/pagadores/:id/ativar', asyncHandler(async (req) => (await ativarPagador(parseInt(req.params.id)))));
router.post('/pagadores/:id/desativar', asyncHandler(async (req) => (await desativarPagador(parseInt(req.params.id)))));

export default router;
