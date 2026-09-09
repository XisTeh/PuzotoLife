import { apiFetch } from './http.js';
/**
 * Camada de integração do Frontend com a API (SQLite Backend)
 */

const API_BASE_URL = '/api';

async function fetchAPI(endpoint, options = {}) {
  try {
    const response = await apiFetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });

    if (response.status === 404) {
      throw new Error('Rota da API não encontrada.');
    }
    if (response.status >= 500) {
      throw new Error('Erro interno no servidor.');
    }

    let result;
    try {
      result = await response.json();
    } catch (e) {
      throw new Error('O servidor retornou uma resposta inesperada.');
    }

    if (!result.ok && !result.success) {
      throw new Error(result.error || result.message || 'Erro na requisição');
    }
    return result.data || result; // se result não tiver data (ex: health), retorna o result inteiro
  } catch (err) {
    console.error(`Erro API ${endpoint}:`, err);
    if (err.message === 'Failed to fetch' || err.name === 'TypeError') {
      throw new Error('Servidor local não está respondendo. Verifique se o backend está rodando.');
    }
    
    throw err;
  }
}

export async function checkHealth() {
  return await fetchAPI('/health');
}

// ═══════════════════════════════════════
// EMPRESAS E CONFIGURAÇÕES
// ═══════════════════════════════════════

export async function listarEmpresas() {
  return await fetchAPI('/empresas');
}

export async function obterConfiguracao(chave) {
  return await fetchAPI(`/configuracoes/${chave}`);
}

export async function salvarConfiguracao(chave, valor) {
  return await fetchAPI('/configuracoes', {
    method: 'POST',
    body: JSON.stringify({ chave, valor })
  });
}

// ═══════════════════════════════════════
// LOTE DE TRABALHO PENDENTE
// ═══════════════════════════════════════

export async function listarLoteTrabalhoPendente() {
  return await fetchAPI('/lote-trabalho');
}

export async function adicionarItemLoteTrabalho(dados, painel = false) {
  return await fetchAPI(`/lote-trabalho${painel ? "?painel=true" : ""}`, {
    method: 'POST',
    body: JSON.stringify(dados)
  });
}

export async function atualizarItemLoteTrabalho(id, dados, painel = false) {
  return await fetchAPI(`/lote-trabalho/${id}${painel ? "?painel=true" : ""}`, {
    method: 'PUT',
    body: JSON.stringify(dados)
  });
}

export async function removerItemLoteTrabalho(id, painel = false) {
  return await fetchAPI(`/lote-trabalho/${id}${painel ? "?painel=true" : ""}`, {
    method: 'DELETE'
  });
}

export async function calcularResumoLoteTrabalho() {
  return await fetchAPI('/lote-trabalho/resumo');
}

// ═══════════════════════════════════════
// FECHAMENTO DO DIA
// ═══════════════════════════════════════

export async function fecharDiaTrabalho(data) {
  return await fetchAPI('/fechamentos/dia', {
    method: 'POST',
    body: JSON.stringify({ data })
  });
}

export async function listarFechamentosDiarios() {
  return await fetchAPI('/fechamentos/diarios');
}

export async function desfazerFechamentoDia(id) {
  return await fetchAPI(`/fechamentos/dia/${id}`, {
    method: 'DELETE'
  });
}

// ═══════════════════════════════════════
// DR. RANON / RX
// ═══════════════════════════════════════

export async function listarLaudosRanonPendentes() {
  return await fetchAPI('/ranon/pendentes');
}

export async function adicionarLaudoRanonPendente(dados, painel = false) {
  return await fetchAPI(`/ranon/pendentes${painel ? "?painel=true" : ""}`, {
    method: 'POST',
    body: JSON.stringify(dados)
  });
}

export async function atualizarLaudoRanonPendente(id, dados, painel = false) {
  return await fetchAPI(`/ranon/pendentes/${id}${painel ? "?painel=true" : ""}`, {
    method: 'PUT',
    body: JSON.stringify(dados)
  });
}

export async function removerLaudoRanonPendente(id, painel = false) {
  return await fetchAPI(`/ranon/pendentes/${id}${painel ? "?painel=true" : ""}`, {
    method: 'DELETE'
  });
}

export async function limparLaudosRanonPendentes() {
  return await fetchAPI('/ranon/pendentes', {
    method: 'DELETE'
  });
}

export async function obterPrecoPadraoRanon() {
  const cfg = await obterConfiguracao('preco_padrao_ranon');
  return cfg ? parseFloat(cfg.valor) : 2.00;
}

export async function salvarPrecoPadraoRanon(valor) {
  return await salvarConfiguracao('preco_padrao_ranon', valor.toString());
}

// ═══════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════

export async function obterDashboard(mes) {
  const params = new URLSearchParams();
  if (mes) params.append('mes', mes);
  return await fetchAPI(`/dashboard?${params.toString()}`);
}

export async function listarInvestimentos(incluirInativos = true) {
  return await fetchAPI(`/financas/investimentos?incluir_inativos=${incluirInativos}`);
}

export async function obterPainelInvestimentos(incluirInativos = true) {
  return await fetchAPI(`/financas/investimentos-painel?incluir_inativos=${incluirInativos}`);
}

export async function criarInvestimento(dados) {
  return await fetchAPI('/financas/investimentos', {
    method: 'POST',
    body: JSON.stringify(dados)
  });
}

export async function atualizarInvestimento(id, dados) {
  return await fetchAPI(`/financas/investimentos/${id}`, {
    method: 'PUT',
    body: JSON.stringify(dados)
  });
}

export async function definirInvestimentoAtivo(id, ativo) {
  return await fetchAPI(`/financas/investimentos/${id}/${ativo ? 'ativar' : 'desativar'}`, {
    method: 'POST'
  });
}

export async function listarMovimentosInvestimento(id) {
  return await fetchAPI(`/financas/investimentos/${id}/movimentos`);
}

export async function registrarMovimentoInvestimento(id, dados) {
  return await fetchAPI(`/financas/investimentos/${id}/movimentos`, {
    method: 'POST',
    body: JSON.stringify(dados)
  });
}

export async function ajustarSaldoInvestimento(id, dados) {
  return await fetchAPI(`/financas/investimentos/${id}/ajustar`, {
    method: 'POST',
    body: JSON.stringify(dados)
  });
}

export async function obterRelatorioGeral(mes) {
  const params = new URLSearchParams();
  if (mes) params.append('mes', mes);
  return await fetchAPI(`/relatorios/geral?${params.toString()}`);
}

export async function obterRelatorioFinancas(mes) {
  const params = new URLSearchParams();
  if (mes) params.append('mes', mes);
  return await fetchAPI(`/relatorios/financas?${params.toString()}`);
}

export async function obterComparativoMensal(inicio, fim) {
  const params = new URLSearchParams();
  if (inicio) params.append('inicio', inicio);
  if (fim) params.append('fim', fim);
  return await fetchAPI(`/relatorios/comparativo-mensal?${params.toString()}`);
}

// ═══════════════════════════════════════
// PAGADORES
// ═══════════════════════════════════════

export async function listarPagadores() {
  return await fetchAPI('/pagadores');
}

export async function obterResumoPagadores(mes) {
  const params = new URLSearchParams();
  if (mes) params.append('mes', mes);
  return await fetchAPI(`/pagadores/resumo?${params.toString()}`);
}

export async function atualizarPagador(id, dados) {
  return await fetchAPI(`/pagadores/${id}`, {
    method: 'PUT',
    body: JSON.stringify(dados)
  });
}


export const obterPainelLancamentos = () => fetchAPI('/lote-trabalho/painel');
export const obterPainelRanon = () => fetchAPI('/ranon/painel');
