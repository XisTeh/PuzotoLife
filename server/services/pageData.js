import { atomic, snapshot } from '../database/connection.js';
import { listarCategorias, listarGastos, calcularResumoGastos } from './financas.js';
import { listarContasPagar, calcularResumoContasPagar } from './contasPagar.js';
import { listarReceitas, calcularResumoReceitas, listarOrigensReceitaUnicas } from './receitas.js';
import { listarInvestimentos, listarMovimentosInvestimento } from './investimentos.js';

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
