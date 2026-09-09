import { atomic, snapshot } from '../database/connection.js';
import { listarCategorias, listarGastos, calcularResumoGastos } from './financas.js';
import { listarContasPagar, calcularResumoContasPagar } from './contasPagar.js';
import { listarReceitas, calcularResumoReceitas, listarOrigensReceitaUnicas } from './receitas.js';
import { listarInvestimentos, listarMovimentosInvestimento } from './investimentos.js';
import { listarEmpresas } from './empresas.js';
import { obterConfiguracao } from './configuracoes.js';
import { listarLoteTrabalhoPendente, calcularResumoLoteTrabalho } from './loteTrabalho.js';
import { listarFechamentosDiarios } from './fechamentoDia.js';
import { listarLaudosRanonPendentes } from './laudosRanon.js';
import { listarHistoricoPlanihas } from './salvarPlanilhaRanon.js';

// The mutation and the returned totals share the same transaction and owner lock.
// Only return to HTTP after COMMIT, including when a panel read fails.
export function executarComPainel(operacao, carregarPainel) {
  return atomic(async () => {
    const resultado = await operacao();
    return { ...resultado, painel: await carregarPainel() };
  });
}

export function obterPainelLancamentos() {
  return snapshot(async () => {
    const [empresas, ultimaEmpresa, lote, resumo, historico] = await Promise.all([
      listarEmpresas(), obterConfiguracao('ultima_empresa_selecionada'),
      listarLoteTrabalhoPendente(), calcularResumoLoteTrabalho(), listarFechamentosDiarios(),
    ]);
    return { empresas, ultimaEmpresa, lote, resumo, historico };
  });
}

export function obterPainelRanon() {
  return snapshot(async () => {
    const [preco, mesReferencia, lote, historico] = await Promise.all([
      obterConfiguracao('preco_padrao_ranon'), obterConfiguracao('mes_referencia_ranon_padrao'),
      listarLaudosRanonPendentes(), listarHistoricoPlanihas(5),
    ]);
    return { preco, mesReferencia, lote, historico };
  });
}

export function obterPainelGastos(filtros) {
  return snapshot(async () => {
    const [categorias, gastos, resumo] = await Promise.all([
      listarCategorias({ tipo: 'gasto' }), listarGastos(filtros), calcularResumoGastos(filtros),
    ]);
    return { categorias, gastos, resumo };
  });
}

export function obterPainelContasPagar(filtros) {
  return atomic(async () => {
    const contas = await listarContasPagar(filtros);
    const [categorias, resumo] = await Promise.all([listarCategorias(), calcularResumoContasPagar(filtros.mes)]);
    return { categorias, contas, resumo };
  });
}

export function obterPainelReceitas(filtros) {
  return snapshot(async () => {
    const [categorias, origens, receitas, resumo] = await Promise.all([
      listarCategorias(), listarOrigensReceitaUnicas(), listarReceitas(filtros), calcularResumoReceitas(filtros.mes),
    ]);
    return { categorias, origens, receitas, resumo };
  });
}

export function obterPainelInvestimentos(incluirInativos = true) {
  return snapshot(async () => {
    const investimentos = await listarInvestimentos(incluirInativos);
    const atual = investimentos[0] || null;
    const movimentos = atual ? await listarMovimentosInvestimento(atual.id) : [];
    return { investimentos, movimentos };
  });
}
