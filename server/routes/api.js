/**
 * Rotas da API REST
 * Expõe os serviços para o frontend via HTTP.
 */

import express, { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { getDatabasePath } from '../database/connection.js';

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
import {
  listarPagadores, listarTodosPagadores, criarPagador, atualizarPagador, 
  obterResumoPorPagador, ativarPagador, desativarPagador, obterRecebimentosPendentes, processarRecebimentoPagador
} from '../services/pagadores.js';

const router = Router();


// Helper para try/catch uniforme (suporta sync e async)
function asyncHandler(fn) {
  return async (req, res) => {
    try {
      const result = await fn(req, res);
      res.json({ ok: true, data: result });
    } catch (err) {
      console.error(`[API ERROR] ${req.method} ${req.path}:`, err.message);
      res.status(500).json({ ok: false, error: process.env.NODE_ENV === 'production' ? 'Não foi possível concluir a operação.' : err.message });
    }
  };
}

// ═══════════════════════════════════════
// EMPRESAS
// ═══════════════════════════════════════
router.get('/empresas', asyncHandler((req) => req.query.todas === 'true' ? listarTodasEmpresas() : listarEmpresas()));
router.get('/empresas/:id', asyncHandler((req) => obterEmpresaPorId(Number(req.params.id))));
router.get('/empresas/nome/:nome', asyncHandler((req) => obterEmpresaPorNome(req.params.nome)));
router.post('/empresas', async (req, res) => {
  try {
    const id = criarEmpresa(req.body);
    const novaEmpresa = obterEmpresaPorId(id);
    res.json({ success: true, message: 'Empresa criada com sucesso.', empresa: novaEmpresa });
  } catch (err) {
    console.error('[API ERROR] POST /empresas:', err.message);
    res.status(500).json({ success: false, message: 'Erro ao criar empresa.', error: process.env.NODE_ENV === 'production' ? 'Não foi possível concluir a operação.' : err.message });
  }
});

router.put('/empresas/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const empresaAtual = obterEmpresaPorId(id);
    if (!empresaAtual) {
      return res.status(404).json({ success: false, message: 'Empresa não encontrada.' });
    }
    
    atualizarEmpresa(id, req.body);
    const empresaAtualizada = obterEmpresaPorId(id);
    
    res.json({ success: true, message: 'Empresa atualizada com sucesso.', empresa: empresaAtualizada });
  } catch (err) {
    console.error('[API ERROR] PUT /empresas/:id:', err.message);
    res.status(500).json({ success: false, message: 'Erro ao atualizar empresa.', error: process.env.NODE_ENV === 'production' ? 'Não foi possível concluir a operação.' : err.message });
  }
});
router.post('/empresas/:id/desativar', asyncHandler((req) => { desativarEmpresa(Number(req.params.id)); return { success: true }; }));
router.post('/empresas/:id/ativar', asyncHandler((req) => { ativarEmpresa(Number(req.params.id)); return { success: true }; }));

// ═══════════════════════════════════════
// CONFIGURAÇÕES
// ═══════════════════════════════════════
router.get('/configuracoes', asyncHandler(() => obterTodasConfiguracoes()));
router.get('/configuracoes/:chave', asyncHandler((req) => obterConfiguracao(req.params.chave)));
router.post('/configuracoes', asyncHandler((req) => {
  const { chave, valor } = req.body;
  return salvarConfiguracao(chave, valor);
}));

// ═══════════════════════════════════════
// LOTE DE TRABALHO PENDENTE
// ═══════════════════════════════════════
router.get('/lote-trabalho', asyncHandler(() => listarLoteTrabalhoPendente()));
router.get('/lote-trabalho/resumo', asyncHandler(() => calcularResumoLoteTrabalho()));
router.post('/lote-trabalho', asyncHandler((req) => adicionarItemLoteTrabalho(req.body)));
router.put('/lote-trabalho/:id', asyncHandler((req) => atualizarItemLoteTrabalho(Number(req.params.id), req.body)));
router.delete('/lote-trabalho/:id', asyncHandler((req) => removerItemLoteTrabalho(Number(req.params.id))));
router.delete('/lote-trabalho', asyncHandler(() => limparLoteTrabalho()));

// ═══════════════════════════════════════
// LANÇAMENTOS DE TRABALHO (DEFINITIVO)
// ═══════════════════════════════════════
router.get('/lancamentos', asyncHandler((req) => listarLancamentosTrabalho(req.query)));
router.get('/lancamentos/resumo', asyncHandler((req) => calcularResumoLancamentosTrabalho(req.query.mes)));
router.post('/lancamentos', asyncHandler((req) => criarLancamentoTrabalho(req.body)));
router.patch('/lancamentos/:id/status', asyncHandler((req) => {
  return atualizarStatusLancamento(Number(req.params.id), req.body.status, req.body.recebido_em);
}));
router.post('/trabalho/lancamentos/:id/receber', asyncHandler((req) => marcarLancamentoTrabalhoComoRecebido(Number(req.params.id))));
router.get('/trabalho/historico/resumo', asyncHandler((req) => obterResumoHistorico(req.query.mes, req.query.empresa_id, req.query.status)));

// ═══════════════════════════════════════
// DR. RANON / RX — PENDENTES
// ═══════════════════════════════════════
router.get('/ranon/pendentes', asyncHandler(() => listarLaudosRanonPendentes()));
router.post('/ranon/pendentes', asyncHandler((req) => adicionarLaudoRanonPendente(req.body)));
router.put('/ranon/pendentes/:id', asyncHandler((req) => atualizarLaudoRanonPendente(Number(req.params.id), req.body)));
router.delete('/ranon/pendentes/:id', asyncHandler((req) => removerLaudoRanonPendente(Number(req.params.id))));
router.delete('/ranon/pendentes', asyncHandler(() => limparLaudosRanonPendentes()));

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
    console.error('[API ERROR] GET /ranon/exportar-excel:', err.message);
    res.status(400).json({ ok: false, error: process.env.NODE_ENV === 'production' ? 'Não foi possível concluir a operação.' : err.message });
  }
});

// ═══════════════════════════════════════
// DR. RANON / RX — HISTÓRICO
// ═══════════════════════════════════════
router.get('/ranon/historico', asyncHandler((req) => listarLaudosRanonHistorico(req.query)));
router.post('/ranon/historico', asyncHandler((req) => salvarLaudoRanonHistorico(req.body)));
router.post('/ranon/historico/:id/receber', asyncHandler((req) => marcarLaudoRanonComoRecebido(Number(req.params.id))));
router.get('/ranon/resumo', asyncHandler((req) => calcularResumoRanon(req.query.mes)));

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
    console.error('[API ERROR] POST /ranon/salvar-planilha:', err.message);
    res.status(500).json({ ok: false, error: process.env.NODE_ENV === 'production' ? 'Não foi possível concluir a operação.' : err.message });
  }
});

router.get('/ranon/historico-planilhas', asyncHandler((req) => {
  const limit = parseInt(req.query.limit) || 5;
  return listarHistoricoPlanihas(limit);
}));

// ═══════════════════════════════════════
// FECHAMENTO DO DIA
// ═══════════════════════════════════════
router.get('/fechamentos/diarios', asyncHandler(() => listarFechamentosDiarios()));
router.post('/fechamentos/dia', asyncHandler((req) => fecharDiaTrabalho(req.body?.data)));
router.delete('/fechamentos/dia/:id', asyncHandler((req) => desfazerFechamentoDia(Number(req.params.id))));

// ═══════════════════════════════════════
// FECHAMENTO MENSAL
// ═══════════════════════════════════════
router.get('/fechamentos/mensais', asyncHandler(() => listarFechamentosMensais()));
router.get('/fechamentos/mensais/preview', asyncHandler((req) => gerarPreviewMensal(req.query.mes)));
router.get('/fechamentos/mensais/:referencia', asyncHandler((req) => obterFechamentoMensalPorReferencia(req.params.referencia)));
router.post('/fechamentos/mensal', asyncHandler((req) => fecharMesTrabalho(req.body.mes, req.body.referencia)));

// ═══════════════════════════════════════
// AJUSTE RETROATIVO
// ═══════════════════════════════════════
router.get('/ajustes', asyncHandler((req) => listarAjustesRetroativos(req.query.referencia)));
router.post('/ajustes/padrao', asyncHandler((req) => {
  const { fechamento_mensal_id, quantidade, valor_unitario, observacao, empresa } = req.body;
  return ajustarPadraoRetroativo(fechamento_mensal_id, quantidade, valor_unitario, observacao, empresa || 'Padrão');
}));

// ═══════════════════════════════════════
// AUDITORIA
// ═══════════════════════════════════════
router.get('/auditoria', asyncHandler((req) => listarAuditoria(req.query)));

// ═══════════════════════════════════════
// ANALYTICS DO TRABALHO
// ═══════════════════════════════════════
router.get('/trabalho/analytics', asyncHandler((req) => {
  const mes = req.query.mes || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const empresa = req.query.empresa || 'todas';
  const status = req.query.status || 'todos';
  return obterAnalyticsTrabalho(mes, empresa, status);
}));

// ═══════════════════════════════════════
// FINANÇAS — CATEGORIAS
// ═══════════════════════════════════════
router.get('/financas/categorias', asyncHandler((req) => listarCategorias(req.query)));
router.post('/financas/categorias', asyncHandler((req) => criarCategoria(req.body)));
router.put('/financas/categorias/:id', asyncHandler((req) => atualizarCategoria(Number(req.params.id), req.body)));
router.delete('/financas/categorias/:id', asyncHandler((req) => { desativarCategoria(Number(req.params.id)); return { success: true }; }));
router.post('/financas/categorias/:id/desativar', asyncHandler((req) => { desativarCategoria(Number(req.params.id)); return { success: true }; }));
router.post('/financas/categorias/:id/ativar', asyncHandler((req) => { ativarCategoria(Number(req.params.id)); return { success: true }; }));

// ═══════════════════════════════════════
// FINANÇAS — GASTOS
// ═══════════════════════════════════════
router.get('/financas/gastos', asyncHandler((req) => listarGastos(req.query)));
router.post('/financas/gastos', asyncHandler((req) => criarGasto(req.body)));
router.put('/financas/gastos/:id', asyncHandler((req) => atualizarGasto(Number(req.params.id), req.body)));
router.delete('/financas/gastos/:id', asyncHandler((req) => { removerGasto(Number(req.params.id)); return { success: true }; }));
router.get('/financas/gastos/resumo', asyncHandler((req) => calcularResumoGastos(req.query)));

// ═══════════════════════════════════════
// FINANÇAS — CARTÕES E FATURAS
// ═══════════════════════════════════════
router.get('/financas/cartoes', asyncHandler(() => listarCartoes()));
router.post('/financas/cartoes', asyncHandler((req) => criarCartao(req.body)));
// Rotas com caminhos estáticos ANTES de :id
router.get('/financas/cartoes/compras', asyncHandler((req) => listarComprasCartao(req.query.cartao_id ? Number(req.query.cartao_id) : null)));
router.get('/financas/cartoes/compras-parceladas', asyncHandler(() => listarComprasParceladas()));
router.get('/financas/cartoes/compras-parceladas/:id', asyncHandler((req) => obterCompraCartao(Number(req.params.id))));
router.put('/financas/cartoes/compras-parceladas/:id', asyncHandler((req) => atualizarCompraCartao(Number(req.params.id), req.body)));
router.delete('/financas/cartoes/compras-parceladas/:id', asyncHandler((req) => excluirCompraCartao(Number(req.params.id), req.body.confirmacao)));
router.post('/financas/cartoes/compras', asyncHandler((req) => criarCompraCartao(req.body)));
router.post('/financas/cartoes/compras/em-andamento', asyncHandler((req) => criarCompraCartaoEmAndamento(req.body)));
router.get('/financas/cartoes/faturas', asyncHandler((req) => listarFaturasCartao(req.query)));
router.get('/financas/cartoes/faturas/resumo', asyncHandler(() => listarFaturasResumo()));
router.get('/financas/cartoes/faturas/:id', asyncHandler((req) => obterFaturaComParcelas(Number(req.params.id))));
router.post('/financas/cartoes/faturas/:id/pagar', asyncHandler((req) => marcarFaturaComoPaga(Number(req.params.id), req.body)));
router.get('/financas/cartoes/parcelas/recentes', asyncHandler(() => listarParcelasRecentes()));
router.post('/financas/cartoes/parcelas/antecipar', asyncHandler((req) => anteciparParcelas(req.body)));
// Rotas com :id genérico por último
router.put('/financas/cartoes/:id', asyncHandler((req) => atualizarCartao(Number(req.params.id), req.body)));
router.delete('/financas/cartoes/:id', asyncHandler((req) => removerCartao(Number(req.params.id), req.query.forcar === 'true')));
router.post('/financas/cartoes/:id/desativar', asyncHandler((req) => ativarCartao(Number(req.params.id), false)));
router.post('/financas/cartoes/:id/ativar', asyncHandler((req) => ativarCartao(Number(req.params.id), true)));

// ═══════════════════════════════════════
// FINANÇAS — CONTAS A PAGAR
// ═══════════════════════════════════════
router.get('/financas/contas-pagar', asyncHandler((req) => listarContasPagar(req.query)));
router.post('/financas/contas-pagar', asyncHandler((req) => criarContaPagar(req.body)));
router.post('/financas/contas-pagar/:id/pagar', asyncHandler((req) => marcarPagaCP(Number(req.params.id))));
router.post('/financas/contas-pagar/:id/cancelar', asyncHandler((req) => cancelarContaPagar(Number(req.params.id))));
router.put('/financas/contas-pagar/:id/valor', asyncHandler((req) => atualizarValorContaPagar(Number(req.params.id), req.body.valor)));
router.get('/financas/contas-pagar/resumo', asyncHandler((req) => calcularResumoContasPagar(req.query.mes)));

// ═══════════════════════════════════════
// FINANÇAS — PESSOAS / DÍVIDAS
// ═══════════════════════════════════════
router.get('/financas/pessoas-dividas', asyncHandler((req) => listarPessoasDividas(req.query)));
router.post('/financas/pessoas-dividas', asyncHandler((req) => criarPessoaDivida(req.body)));
router.put('/financas/pessoas-dividas/:id/valor', asyncHandler((req) => atualizarValorPessoaDivida(req.params.id, parseFloat(req.body.valor))));
router.post('/financas/pessoas-dividas/:id/resolver', asyncHandler((req) => {
  const idStr = req.params.id;
  if (idStr.startsWith('dp_')) {
    const grupoId = Number(idStr.replace('dp_', ''));
    return pagarProximaParcelaDivida(grupoId);
  } else {
    return marcarPessoaDividaResolvida(Number(idStr));
  }
}));
router.post('/financas/pessoas-dividas/:id/cancelar', asyncHandler((req) => {
  const idStr = req.params.id;
  if (idStr.startsWith('dp_')) {
    const grupoId = Number(idStr.replace('dp_', ''));
    return excluirDividaParcelada(grupoId);
  } else {
    return cancelarPessoaDivida(Number(idStr), req.body.todasParcelas);
  }
}));
router.delete('/financas/pessoas-dividas/:id', asyncHandler((req) => {
  const idStr = req.params.id;
  if (idStr.startsWith('dp_')) {
    const grupoId = Number(idStr.replace('dp_', ''));
    return excluirDividaParcelada(grupoId);
  } else {
    return removerPessoaDivida(Number(idStr), req.query.todasParcelas === 'true');
  }
}));
router.get('/financas/pessoas-dividas/resumo', asyncHandler((req) => calcularResumoPessoasDividas(req.query.mes)));
router.get('/financas/pessoas-dividas/historico/:nome', asyncHandler((req) => obterHistoricoPessoa(req.params.nome)));
router.get('/financas/pessoas-dividas/nomes', asyncHandler(() => listarPessoasUnicas()));

// Dívidas Parceladas
router.get('/financas/dividas-parceladas', asyncHandler((req) => listarDividasParceladas(req.query)));
router.post('/financas/dividas-parceladas', asyncHandler((req) => criarDividaParcelada(req.body)));
router.get('/financas/dividas-parceladas/:id', asyncHandler((req) => obterDividaParcelada(Number(req.params.id))));
router.post('/financas/dividas-parceladas/:id/pagar', asyncHandler((req) => pagarProximaParcelaDivida(Number(req.params.id))));
router.delete('/financas/dividas-parceladas/:id', asyncHandler((req) => excluirDividaParcelada(Number(req.params.id))));

// ═══════════════════════════════════════
// FINANÇAS — RECEITAS
// ═══════════════════════════════════════
router.get('/financas/receitas', asyncHandler((req) => listarReceitas(req.query)));
router.post('/financas/receitas', asyncHandler((req) => criarReceita(req.body)));
router.put('/financas/receitas/:id', asyncHandler((req) => atualizarReceita(Number(req.params.id), req.body)));
router.post('/financas/receitas/:id/receber', asyncHandler((req) => marcarReceitaComoRecebida(Number(req.params.id))));
router.post('/financas/receitas/:id/cancelar', asyncHandler((req) => cancelarReceita(Number(req.params.id))));
router.delete('/financas/receitas/:id', asyncHandler((req) => removerReceita(Number(req.params.id))));
router.get('/financas/receitas/resumo', asyncHandler((req) => calcularResumoReceitas(req.query.mes)));
router.get('/financas/receitas/origens', asyncHandler(() => listarOrigensReceitaUnicas()));

// INVESTIMENTOS
router.get('/financas/investimentos', asyncHandler((req) => listarInvestimentos(req.query.incluir_inativos !== 'false')));
router.post('/financas/investimentos', asyncHandler((req) => criarInvestimento(req.body)));
router.get('/financas/investimentos/:id', asyncHandler((req) => obterInvestimento(Number(req.params.id))));
router.put('/financas/investimentos/:id', asyncHandler((req) => atualizarInvestimento(Number(req.params.id), req.body)));
router.post('/financas/investimentos/:id/ativar', asyncHandler((req) => definirInvestimentoAtivo(Number(req.params.id), true)));
router.post('/financas/investimentos/:id/desativar', asyncHandler((req) => definirInvestimentoAtivo(Number(req.params.id), false)));
router.get('/financas/investimentos/:id/movimentos', asyncHandler((req) => listarMovimentosInvestimento(Number(req.params.id))));
router.post('/financas/investimentos/:id/movimentos', asyncHandler((req) => registrarMovimentoInvestimento(Number(req.params.id), req.body)));
router.post('/financas/investimentos/:id/ajustar', asyncHandler((req) => ajustarSaldoInvestimento(Number(req.params.id), req.body)));

// ═══════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════
router.get('/dashboard', asyncHandler((req) => {
  const mes = req.query.mes || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  return obterDashboard(mes);
}));

// ═══════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════
router.get('/health', (req, res) => {
  const dbPath = getDatabasePath();
  let dbExists = false;
  let dbSize = '0 KB';
  
  if (fs.existsSync(dbPath)) {
    dbExists = true;
    const stats = fs.statSync(dbPath);
    dbSize = (stats.size / 1024).toFixed(2) + ' KB';
  }

  const dataPath = path.join(process.cwd(), 'data');
  
  res.json({
    success: true,
    status: 'online',
    app: 'Puzoto Life',
    version: '1.0.0',
    database: {
      exists: dbExists,
      path: dbPath,
      size: dbSize
    },
    folders: {
      backup: fs.existsSync(path.join(dataPath, 'backups', 'database')),
      laudos_ranon: fs.existsSync(path.join(dataPath, 'backups', 'laudos_ranon'))
    },
    time: new Date().toISOString().replace('T', ' ').substring(0, 19)
  });
});

// ═══════════════════════════════════════
// RELATÓRIOS
// ═══════════════════════════════════════

router.get('/relatorios/geral', (req, res) => {
  try {
    const mes = req.query.mes;
    if (!mes) return res.status(400).json({ success: false, message: 'Mês não informado' });

    const dados = obterRelatorioGeral(mes);
    res.json({ ok: true, data: dados });
  } catch (error) {
    console.error('Erro ao obter relatório geral:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/relatorios/financas', asyncHandler((req) => {
  const mes = req.query.mes;
  if (!mes) throw new Error('Mês não informado');
  return obterRelatorioFinancas(mes);
}));

router.get('/relatorios/comparativo-mensal', asyncHandler((req) => {
  const { inicio, fim } = req.query;
  return obterComparativoMensal(inicio, fim);
}));

// ═══════════════════════════════════════
// DIAGNÓSTICO E SISTEMA
// ═══════════════════════════════════════
router.get('/diagnostico/completo', (req, res) => {
  try {
    const result = executarDiagnostico();
    res.json(result);
  } catch (err) {
    console.error('[API ERROR] GET /diagnostico/completo:', err.message);
    res.status(500).json({ success: false, error: process.env.NODE_ENV === 'production' ? 'Não foi possível concluir a operação.' : err.message });
  }
});

router.post('/sistema/limpar-dados-teste', (req, res) => {
  try {
    const { confirmacao } = req.body;
    if (!confirmacao) {
      return res.status(400).json({ success: false, error: 'Confirmação não informada.' });
    }
    const result = executarLimpezaDadosTeste(confirmacao);
    res.json(result);
  } catch (err) {
    console.error('[API ERROR] POST /sistema/limpar-dados-teste:', err.message);
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
    console.error('[API ERROR] GET /backup/info:', err.message);
    res.status(500).json({ ok: false, error: process.env.NODE_ENV === 'production' ? 'Não foi possível concluir a operação.' : err.message });
  }
});

router.post('/backup/criar', async (req, res) => {
  try {
    const resultado = await criarBackupManual();
    res.json({ ok: true, data: resultado });
  } catch (err) {
    console.error('[API ERROR] POST /backup/criar:', err.message);
    res.status(500).json({ ok: false, error: process.env.NODE_ENV === 'production' ? 'Não foi possível concluir a operação.' : err.message });
  }
});

router.get('/backup/listar', async (req, res) => {
  try {
    const backups = listarBackups();
    res.json({ ok: true, data: backups });
  } catch (err) {
    console.error('[API ERROR] GET /backup/listar:', err.message);
    res.status(500).json({ ok: false, error: process.env.NODE_ENV === 'production' ? 'Não foi possível concluir a operação.' : err.message });
  }
});

router.get('/backup/download/:filename', async (req, res) => {
  try {
    const filePath = obterCaminhoBackup(req.params.filename);
    res.download(filePath, req.params.filename);
  } catch (err) {
    console.error('[API ERROR] GET /backup/download:', err.message);
    res.status(400).json({ ok: false, error: process.env.NODE_ENV === 'production' ? 'Não foi possível concluir a operação.' : err.message });
  }
});

router.post('/backup/restaurar', async (req, res) => {
  try {
    const { filename, confirmacao } = req.body;
    const resultado = restaurarBackup(filename, confirmacao);
    res.json({ ok: true, data: resultado });
  } catch (err) {
    console.error('[API ERROR] POST /backup/restaurar:', err.message);
    res.status(500).json({ ok: false, error: process.env.NODE_ENV === 'production' ? 'Não foi possível concluir a operação.' : err.message });
  }
});

router.delete('/backup/:filename', async (req, res) => {
  try {
    const resultado = excluirBackup(req.params.filename);
    res.json({ ok: true, data: resultado });
  } catch (err) {
    console.error('[API ERROR] DELETE /backup:', err.message);
    res.status(400).json({ ok: false, error: process.env.NODE_ENV === 'production' ? 'Não foi possível concluir a operação.' : err.message });
  }
});

router.get('/backup/exportar-json', async (req, res) => {
  try {
    const dados = exportarJSON();
    const pad = (n) => String(n).padStart(2, '0');
    const now = new Date();
    const ts = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    const filename = `puzoto_life_export_${ts}.json`;
    
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(dados, null, 2));
  } catch (err) {
    console.error('[API ERROR] GET /backup/exportar-json:', err.message);
    res.status(500).json({ ok: false, error: process.env.NODE_ENV === 'production' ? 'Não foi possível concluir a operação.' : err.message });
  }
});

router.get('/backup/exportar-csv-trabalho', async (req, res) => {
  try {
    const sections = exportarCSVTrabalho();
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
    console.error('[API ERROR] GET /backup/exportar-csv-trabalho:', err.message);
    res.status(500).json({ ok: false, error: process.env.NODE_ENV === 'production' ? 'Não foi possível concluir a operação.' : err.message });
  }
});

router.get('/backup/exportar-csv-financas', async (req, res) => {
  try {
    const sections = exportarCSVFinancas();
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
    console.error('[API ERROR] GET /backup/exportar-csv-financas:', err.message);
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
    console.error('[API ERROR] POST /importar/validar-json:', err.message);
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

    const resultado = importarJSON(conteudo, {
      modo: modo || 'adicionar',
      evitarDuplicados: evitarDuplicados !== false,
      confirmacao: confirmacao
    });

    res.json({ ok: true, data: resultado });
  } catch (err) {
    console.error('[API ERROR] POST /importar/json:', err.message);
    res.status(500).json({ ok: false, error: process.env.NODE_ENV === 'production' ? 'Não foi possível concluir a operação.' : err.message });
  }
});

// ═══════════════════════════════════════
// PAGADORES
// ═══════════════════════════════════════

router.get('/pagadores', asyncHandler(() => listarPagadores()));
router.get('/pagadores/todos', asyncHandler(() => listarTodosPagadores()));
router.get('/pagadores/resumo', asyncHandler((req) => obterResumoPorPagador(req.query.mes)));
router.get('/pagadores/recebimentos-pendentes', asyncHandler((req) => obterRecebimentosPendentes(req.query.mes)));
router.post('/pagadores/receber', asyncHandler((req) => processarRecebimentoPagador(req.body)));
router.post('/pagadores', asyncHandler((req) => criarPagador(req.body)));
router.put('/pagadores/:id', asyncHandler((req) => atualizarPagador(parseInt(req.params.id), req.body)));
router.post('/pagadores/:id/ativar', asyncHandler((req) => ativarPagador(parseInt(req.params.id))));
router.post('/pagadores/:id/desativar', asyncHandler((req) => desativarPagador(parseInt(req.params.id))));

export default router;
