import { snapshot, atomic } from '../database/connection.js';
/**
 * Serviço de Lançamentos de Trabalho (histórico definitivo)
 */

import { getDatabase } from '../database/connection.js';
import { verificarReceitaVinculada, criarReceitaAutomaticaTrabalho } from './receitas.js';
import { registrarAuditoria } from './auditoria.js';
import { dataHojeLocal } from '../utils/dataLocal.js';

export async function listarLancamentosTrabalho(filtros = {}) {
  return snapshot(async () => {
  const db = getDatabase();
  let sql = `
    SELECT * 
    FROM lancamentos_trabalho
    WHERE 1=1
  `;
  const params = {};

  if (filtros.data) {
    sql += ' AND data = @data';
    params.data = filtros.data;
  }

  if (filtros.empresa_id) {
    sql += ' AND empresa_id = @empresa_id';
    params.empresa_id = filtros.empresa_id;
  }

  if (filtros.status) {
    sql += ' AND status = @status';
    params.status = filtros.status;
  }

  if (filtros.mes) {
    sql += " AND data LIKE @mes || '%'";
    params.mes = filtros.mes;
  }

  sql += ' ORDER BY data DESC, criado_em DESC';

  return (await db.prepare(sql).all(params));
  });
}

export async function criarLancamentoTrabalho(dados) {
  return atomic(async () => {
  const db = getDatabase();
  const {
    empresa_id, empresa_nome, quantidade, valor_unitario,
    data, horario, status, observacao, origem_fechamento_dia_id
  } = dados;
  const total = quantidade * valor_unitario;

  const stmt = db.prepare(`
    INSERT INTO lancamentos_trabalho 
      (empresa_id, empresa_nome, quantidade, valor_unitario, total, data, horario, status, observacao, origem_fechamento_dia_id)
    VALUES 
      (@empresa_id, @empresa_nome, @quantidade, @valor_unitario, @total, @data, @horario, @status, @observacao, @origem_fechamento_dia_id)
  `);

  const result = (await stmt.run({
    empresa_id,
    empresa_nome,
    quantidade,
    valor_unitario,
    total,
    data,
    horario: horario || null,
    status: status || 'produzido',
    observacao: observacao || null,
    origem_fechamento_dia_id: origem_fechamento_dia_id || null
  }));

  return { id: result.lastInsertRowid, total };
  });
}

export async function atualizarStatusLancamento(id, status, recebido_em = null) {
  return atomic(async () => {
  const db = getDatabase();
  const stmt = db.prepare(`
    UPDATE lancamentos_trabalho SET
      status = @status,
      recebido_em = @recebido_em,
      atualizado_em = datetime('now', 'localtime')
    WHERE id = @id
  `);
  return (await stmt.run({ id, status, recebido_em }));
  });
}

export async function marcarLancamentoTrabalhoComoRecebido(id) {
  return atomic(async () => {
  const db = getDatabase();
  const lancamento = (await db.prepare('SELECT * FROM lancamentos_trabalho WHERE id = ?').get(id));

  if (!lancamento) throw new Error('Lançamento não encontrado');
  if (lancamento.status === 'cancelado') throw new Error('Lançamento cancelado não pode ser recebido');

  // Verifica se já existe receita
  const existente = (await verificarReceitaVinculada('lancamento_trabalho', id));
  if (existente) {
    // Se não estivesse recebido, atualiza só para garantir
    if (lancamento.status !== 'recebido') {
      (await atualizarStatusLancamento(id, 'recebido', lancamento.recebido_em || dataHojeLocal()));
    }
    return { success: true, message: 'Este lançamento já estava recebido e já possui receita vinculada.', receita: existente };
  }

  // Preenche recebido_em
  const recebidoEm = dataHojeLocal();
  
  // Cria receita automática
  const desc = `Recebimento ${lancamento.empresa_nome} - ${lancamento.quantidade} exames`;
  const rec = (await criarReceitaAutomaticaTrabalho({
    data: recebidoEm,
    descricao: desc,
    valor: lancamento.total,
    referencia_trabalho_tipo: 'lancamento_trabalho',
    referencia_trabalho_id: id,
    observacao: `Lançamento original ID: ${id} da data ${lancamento.data}`
  }));

  // Atualiza status
  (await atualizarStatusLancamento(id, 'recebido', recebidoEm));

  // Pega atualizado
  const lancAtualizado = (await db.prepare('SELECT * FROM lancamentos_trabalho WHERE id = ?').get(id));

  // Auditoria
  (await registrarAuditoria('recebimento_trabalho', 'Lançamento de trabalho marcado como recebido', lancamento, { lancamento: lancAtualizado, receita_id: rec.id }));

  return { success: true, message: 'Lançamento marcado como recebido e receita criada.', receita: rec };
  });
}

export async function calcularResumoLancamentosTrabalho(mes = null) {
  return snapshot(async () => {
  const db = getDatabase();
  let where = '';
  const params = {};

  if (mes) {
    where = "WHERE data LIKE @mes || '%'";
    params.mes = mes;
  }

  // Resumo geral
  const geral = (await db.prepare(`
    SELECT 
      COALESCE(SUM(quantidade), 0) as total_quantidade,
      COALESCE(SUM(total), 0) as total_valor,
      COUNT(id) as total_registros
    FROM lancamentos_trabalho
    ${where}
  `).get(params));

  // Resumo por empresa
  const porEmpresa = (await db.prepare(`
    SELECT 
      empresa_nome,
      SUM(quantidade) as quantidade,
      SUM(total) as valor,
      COUNT(id) as registros
    FROM lancamentos_trabalho
    ${where}
    GROUP BY empresa_nome
    ORDER BY empresa_nome
  `).all(params));

  // Resumo por status
  const porStatus = (await db.prepare(`
    SELECT 
      status,
      SUM(quantidade) as quantidade,
      SUM(total) as valor,
      COUNT(id) as registros
    FROM lancamentos_trabalho
    ${where}
    GROUP BY status
  `).all(params));

  return { geral, porEmpresa, porStatus };
  });
}

export async function obterResumoHistorico(mes, empresa_id, status) {
  return snapshot(async () => {
  const db = getDatabase();
  
  let whereLanc = '1=1';
  let whereRanon = '1=1';
  const paramsLanc = [];
  const paramsRanon = [];

  if (mes) {
    whereLanc += " AND data LIKE ?";
    paramsLanc.push(mes + '%');
    whereRanon += " AND data LIKE ?";
    paramsRanon.push(mes + '%');
  }

  if (empresa_id && empresa_id !== 'todas') {
    whereLanc += " AND empresa_id = ?";
    paramsLanc.push(empresa_id);
  }

  if (status && status !== 'todos') {
    whereLanc += " AND status = ?";
    paramsLanc.push(status);
    whereRanon += " AND status = ?";
    paramsRanon.push(status);
  }

  const lancamentos = (await db.prepare(`
    SELECT quantidade, total, status, recebido_em 
    FROM lancamentos_trabalho
    WHERE ${whereLanc}
  `).all(...paramsLanc));
  
  let laudos = [];
  if (!empresa_id || empresa_id === 'todas') {
      laudos = (await db.prepare(`SELECT 1 as quantidade, total, status, recebido_em FROM laudos_ranon WHERE ${whereRanon}`).all(...paramsRanon));
  }

  const todos = [...lancamentos, ...laudos];

  const totalFechado = todos.filter(t => t.status === 'fechado' || t.status === 'produzido').reduce((acc, t) => acc + t.total, 0);
  const totalRecebido = todos.filter(t => t.status === 'recebido').reduce((acc, t) => acc + t.total, 0);
  let aReceber = todos.filter(t => t.status !== 'recebido' && t.status !== 'cancelado').reduce((acc, t) => acc + t.total, 0);
  let quantidadeTotal = todos.filter(t => t.status !== 'cancelado').reduce((acc, t) => acc + t.quantidade, 0);

  // Incluir laudos pendentes do Dr. Ranon (não salvos ainda) apenas no "A Receber" e na quantidade
  // Só soma se não há filtro de empresa específica (pois ranon é entidade separada)
  if (!empresa_id || empresa_id === 'todas') {
    const pendentesRanon = (await db.prepare(`
      SELECT COALESCE(SUM(quantidade), 0) as qtd, COALESCE(SUM(total), 0) as valor FROM laudos_ranon_pendentes
    `).get());
    if (pendentesRanon && pendentesRanon.qtd > 0) {
      aReceber += pendentesRanon.valor;
      quantidadeTotal += pendentesRanon.qtd;
    }
  }

  // Recebimentos do mês: considera tudo que teve recebido_em no mês filtrado, independente do 'data' (produção) ou usa os dados filtrados.
  // Pela regra de negócio, "Recebimentos do mês" se refere aos lançamentos filtrados na tabela OU recebimentos ocorridos no mês selecionado?
  // O usuário diz: "Total marcado como recebido no mês selecionado". Vou buscar diretamente do banco.
  let mesRec = mes ? mes : new Date().toISOString().substring(0, 7);
  let sqlRecLanc = "SELECT total FROM lancamentos_trabalho WHERE status = 'recebido' AND recebido_em LIKE ?";
  let paramsRecLanc = [mesRec + '%'];
  if (empresa_id && empresa_id !== 'todas') {
    sqlRecLanc += " AND empresa_id = ?";
    paramsRecLanc.push(empresa_id);
  }
  const recLanc = (await db.prepare(sqlRecLanc).all(...paramsRecLanc));

  let recRanon = [];
  if (!empresa_id || empresa_id === 'todas') {
     recRanon = (await db.prepare("SELECT total FROM laudos_ranon WHERE status = 'recebido' AND recebido_em LIKE ?").all(mesRec + '%'));
  }
  
  const recebimentosMes = [...recLanc, ...recRanon].reduce((acc, t) => acc + t.total, 0);

  return {
    totalFechado,
    totalRecebido,
    aReceber,
    quantidadeTotal,
    recebimentosMes
  };
  });
}

