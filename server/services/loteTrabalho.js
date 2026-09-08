/**
 * Serviço de Lote de Trabalho Pendente
 * Representa o lote temporário antes de Fechar o Dia.
 */

import { getDatabase } from '../database/connection.js';

export function listarLoteTrabalhoPendente() {
  const db = getDatabase();
  return db.prepare(`
    SELECT * FROM lotes_trabalho_pendentes 
    ORDER BY data DESC, criado_em DESC
  `).all();
}

export function obterItemLoteTrabalho(id) {
  const db = getDatabase();
  return db.prepare('SELECT * FROM lotes_trabalho_pendentes WHERE id = ?').get(id);
}

export function adicionarItemLoteTrabalho(dados) {
  const db = getDatabase();
  const { empresa_id, empresa_nome, quantidade, valor_unitario, data, horario, observacao } = dados;
  const total = quantidade * valor_unitario;

  const stmt = db.prepare(`
    INSERT INTO lotes_trabalho_pendentes 
      (empresa_id, empresa_nome, quantidade, valor_unitario, total, data, horario, observacao)
    VALUES 
      (@empresa_id, @empresa_nome, @quantidade, @valor_unitario, @total, @data, @horario, @observacao)
  `);

  const result = stmt.run({
    empresa_id,
    empresa_nome,
    quantidade,
    valor_unitario,
    total,
    data,
    horario: horario || null,
    observacao: observacao || null
  });

  return { id: result.lastInsertRowid, total };
}

export function atualizarItemLoteTrabalho(id, dados) {
  const db = getDatabase();
  const { empresa_id, empresa_nome, quantidade, valor_unitario, data, horario, observacao } = dados;
  const total = quantidade * valor_unitario;

  const stmt = db.prepare(`
    UPDATE lotes_trabalho_pendentes SET
      empresa_id = COALESCE(@empresa_id, empresa_id),
      empresa_nome = COALESCE(@empresa_nome, empresa_nome),
      quantidade = COALESCE(@quantidade, quantidade),
      valor_unitario = COALESCE(@valor_unitario, valor_unitario),
      total = @total,
      data = COALESCE(@data, data),
      horario = COALESCE(@horario, horario),
      observacao = COALESCE(@observacao, observacao),
      atualizado_em = datetime('now', 'localtime')
    WHERE id = @id
  `);

  return stmt.run({ id, empresa_id, empresa_nome, quantidade, valor_unitario, total, data, horario, observacao });
}

export function removerItemLoteTrabalho(id) {
  const db = getDatabase();
  return db.prepare('DELETE FROM lotes_trabalho_pendentes WHERE id = ?').run(id);
}

export function limparLoteTrabalho() {
  const db = getDatabase();
  return db.prepare('DELETE FROM lotes_trabalho_pendentes').run();
}

export function calcularResumoLoteTrabalho() {
  const db = getDatabase();

  // Resumo geral
  const geral = db.prepare(`
    SELECT 
      COUNT(*) as total_itens,
      COALESCE(SUM(quantidade), 0) as total_quantidade,
      COALESCE(SUM(total), 0) as total_valor
    FROM lotes_trabalho_pendentes
  `).get();

  // Resumo por empresa
  const porEmpresa = db.prepare(`
    SELECT 
      empresa_nome,
      COUNT(*) as itens,
      SUM(quantidade) as quantidade,
      SUM(total) as valor
    FROM lotes_trabalho_pendentes
    GROUP BY empresa_nome
    ORDER BY empresa_nome
  `).all();

  return { geral, porEmpresa };
}
