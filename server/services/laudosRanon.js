import { snapshot, atomic } from '../database/connection.js';
/**
 * Serviço de Laudos Dr. Ranon / RX
 * Lote pendente + Histórico definitivo
 */

import { getDatabase } from '../database/connection.js';
import { verificarReceitaVinculada, criarReceitaAutomaticaTrabalho } from './receitas.js';
import { registrarAuditoria } from './auditoria.js';
import { dataHojeLocal } from '../utils/dataLocal.js';

// ═══════════════════════════════════════
// LOTE PENDENTE (temporário)
// ═══════════════════════════════════════

export async function listarLaudosRanonPendentes() {
  return snapshot(async () => {
  const db = getDatabase();
  return (await db.prepare(`
    SELECT * FROM laudos_ranon_pendentes 
    ORDER BY data DESC, criado_em DESC
  `).all());
  });
}

export async function adicionarLaudoRanonPendente(dados) {
  return atomic(async () => {
  const db = getDatabase();
  const { registro_paciente, quantidade, valor_unitario, data, horario, observacao } = dados;
  const qtd = quantidade ? parseInt(quantidade, 10) : 1;
  const total = qtd * (valor_unitario || 2.00);

  const stmt = db.prepare(`
    INSERT INTO laudos_ranon_pendentes 
      (registro_paciente, quantidade, valor_unitario, total, data, horario, observacao)
    VALUES 
      (@registro_paciente, @quantidade, @valor_unitario, @total, @data, @horario, @observacao)
  `);

  const result = (await stmt.run({
    registro_paciente: String(registro_paciente).replace(/\D/g, ''),
    quantidade: qtd,
    valor_unitario: valor_unitario || 2.00,
    total,
    data,
    horario: horario || null,
    observacao: observacao || null
  }));

  return { id: result.lastInsertRowid, total };
  });
}

export async function atualizarLaudoRanonPendente(id, dados) {
  return atomic(async () => {
  const db = getDatabase();
  const { registro_paciente, quantidade, valor_unitario, data, horario, observacao } = dados;
  
  let total = undefined;
  if (quantidade !== undefined || valor_unitario !== undefined) {
     // Para atualizar total precisamos do valor atual ou fornecido
     const atual = (await db.prepare('SELECT quantidade, valor_unitario FROM laudos_ranon_pendentes WHERE id = ?').get(id));
     if (atual) {
       const qtd = quantidade !== undefined ? parseInt(quantidade, 10) : atual.quantidade;
       const vu = valor_unitario !== undefined ? parseFloat(valor_unitario) : atual.valor_unitario;
       total = qtd * vu;
     }
  }

  const stmt = db.prepare(`
    UPDATE laudos_ranon_pendentes SET
      registro_paciente = COALESCE(@registro_paciente, registro_paciente),
      quantidade = COALESCE(@quantidade, quantidade),
      valor_unitario = COALESCE(@valor_unitario, valor_unitario),
      total = COALESCE(@total, total),
      data = COALESCE(@data, data),
      horario = COALESCE(@horario, horario),
      observacao = COALESCE(@observacao, observacao),
      atualizado_em = datetime('now', 'localtime')
    WHERE id = @id
  `);

  return (await stmt.run({
    id,
    registro_paciente: registro_paciente ? String(registro_paciente).replace(/\D/g, '') : null,
    quantidade: quantidade !== undefined ? parseInt(quantidade, 10) : null,
    valor_unitario: valor_unitario !== undefined ? parseFloat(valor_unitario) : null,
    total: total !== undefined ? total : null,
    data: data || null,
    horario: horario || null,
    observacao: observacao || null
  }));
  });
}

export async function removerLaudoRanonPendente(id) {
  return atomic(async () => {
  const db = getDatabase();
  return (await db.prepare('DELETE FROM laudos_ranon_pendentes WHERE id = ?').run(id));
  });
}

export async function limparLaudosRanonPendentes() {
  return atomic(async () => {
  const db = getDatabase();
  return (await db.prepare('DELETE FROM laudos_ranon_pendentes').run());
  });
}

// ═══════════════════════════════════════
// HISTÓRICO DEFINITIVO
// ═══════════════════════════════════════

export async function listarLaudosRanonHistorico(filtros = {}) {
  return snapshot(async () => {
  const db = getDatabase();
  let sql = 'SELECT * FROM laudos_ranon WHERE 1=1';
  const params = {};

  if (filtros.data) {
    sql += ' AND data = @data';
    params.data = filtros.data;
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

export async function salvarLaudoRanonHistorico(dados) {
  return atomic(async () => {
  const db = getDatabase();
  const {
    registro_paciente, quantidade, valor_unitario, data, horario,
    status, arquivo_excel_backup, observacao
  } = dados;
  const qtd = quantidade ? parseInt(quantidade, 10) : 1;
  const total = qtd * valor_unitario;

  const stmt = db.prepare(`
    INSERT INTO laudos_ranon 
      (registro_paciente, quantidade, valor_unitario, total, data, horario, status, arquivo_excel_backup, observacao)
    VALUES 
      (@registro_paciente, @quantidade, @valor_unitario, @total, @data, @horario, @status, @arquivo_excel_backup, @observacao)
  `);

  const result = (await stmt.run({
    registro_paciente: String(registro_paciente).replace(/\D/g, ''),
    quantidade: qtd,
    valor_unitario,
    total,
    data,
    horario: horario || null,
    status: status || 'produzido',
    arquivo_excel_backup: arquivo_excel_backup || null,
    observacao: observacao || null
  }));

  return { id: result.lastInsertRowid, total };
  });
}

export async function atualizarStatusLaudoRanon(id, status, recebido_em = null) {
  return atomic(async () => {
  const db = getDatabase();
  return (await db.prepare(`
    UPDATE laudos_ranon SET
      status = @status,
      recebido_em = @recebido_em,
      atualizado_em = datetime('now', 'localtime')
    WHERE id = @id
  `).run({ id, status, recebido_em }));
  });
}

export async function marcarLaudoRanonComoRecebido(id) {
  return atomic(async () => {
  const db = getDatabase();
  const laudo = (await db.prepare('SELECT * FROM laudos_ranon WHERE id = ?').get(id));

  if (!laudo) throw new Error('Laudo não encontrado');
  if (laudo.status === 'cancelado') throw new Error('Laudo cancelado não pode ser recebido');

  const existente = (await verificarReceitaVinculada('laudo_ranon', id));
  if (existente) {
    if (laudo.status !== 'recebido') {
      (await atualizarStatusLaudoRanon(id, 'recebido', laudo.recebido_em || dataHojeLocal()));
    }
    return { success: true, message: 'Este laudo já estava recebido e já possui receita vinculada.', receita: existente };
  }

  const recebidoEm = dataHojeLocal();
  
  const desc = `Recebimento Dr. Ranon / RX - Registro ${laudo.registro_paciente}`;
  const rec = (await criarReceitaAutomaticaTrabalho({
    data: recebidoEm,
    descricao: desc,
    valor: laudo.total,
    referencia_trabalho_tipo: 'laudo_ranon',
    referencia_trabalho_id: id,
    observacao: `Laudo original ID: ${id} da data ${laudo.data}`
  }));

  (await atualizarStatusLaudoRanon(id, 'recebido', recebidoEm));

  const laudoAtualizado = (await db.prepare('SELECT * FROM laudos_ranon WHERE id = ?').get(id));

  (await registrarAuditoria('recebimento_ranon', 'Laudo Dr. Ranon / RX marcado como recebido', laudo, { laudo: laudoAtualizado, receita_id: rec.id }));

  return { success: true, message: 'Laudo marcado como recebido e receita criada.', receita: rec };
  });
}

// ═══════════════════════════════════════
// RESUMO
// ═══════════════════════════════════════

export async function calcularResumoRanon(mes = null) {
  return snapshot(async () => {
  const db = getDatabase();
  let where = '';
  const params = {};

  if (mes) {
    where = "WHERE data LIKE @mes || '%'";
    params.mes = mes;
  }

  const pendentes = (await db.prepare(`
    SELECT 
      COALESCE(SUM(quantidade), COUNT(*)) as total_laudos,
      COALESCE(SUM(total), 0) as total_valor
    FROM laudos_ranon_pendentes
  `).get());

  const historico = (await db.prepare(`
    SELECT 
      COALESCE(SUM(quantidade), COUNT(*)) as total_laudos,
      COALESCE(SUM(total), 0) as total_valor
    FROM laudos_ranon ${where}
  `).get(params));

  return { pendentes, historico };
  });
}
