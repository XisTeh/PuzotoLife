import { snapshot, atomic } from '../database/connection.js';
/**
 * Serviço de Lote de Trabalho Pendente
 * Representa o lote temporário antes de Fechar o Dia.
 */

import { getDatabase } from '../database/connection.js';

export async function listarLoteTrabalhoPendente() {
  return snapshot(async () => {
  const db = getDatabase();
  return (await db.prepare(`
    SELECT * FROM lotes_trabalho_pendentes 
    ORDER BY data DESC, criado_em DESC
  `).all());
  });
}

export async function obterItemLoteTrabalho(id) {
  return snapshot(async () => {
  const db = getDatabase();
  return (await db.prepare('SELECT * FROM lotes_trabalho_pendentes WHERE id = ?').get(id));
  });
}

export async function adicionarItemLoteTrabalho(dados) {
  return atomic(async () => {
  const db = getDatabase();
  const { empresa_id, empresa_nome, quantidade, valor_unitario, data, horario, observacao } = dados;
  const total = quantidade * valor_unitario;

  const stmt = db.prepare(`
    INSERT INTO lotes_trabalho_pendentes 
      (empresa_id, empresa_nome, quantidade, valor_unitario, total, data, horario, observacao)
    VALUES 
      (@empresa_id, @empresa_nome, @quantidade, @valor_unitario, @total, @data, @horario, @observacao)
  `);

  const result = (await stmt.run({
    empresa_id,
    empresa_nome,
    quantidade,
    valor_unitario,
    total,
    data,
    horario: horario || null,
    observacao: observacao || null
  }));

  return { id: result.lastInsertRowid, total };
  });
}

export async function atualizarItemLoteTrabalho(id, dados) {
  return atomic(async () => {
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

  return (await stmt.run({ id, empresa_id, empresa_nome, quantidade, valor_unitario, total, data, horario: horario ?? null, observacao: observacao ?? null }));
  });
}

export async function removerItemLoteTrabalho(id) {
  return atomic(async () => {
  const db = getDatabase();
  return (await db.prepare('DELETE FROM lotes_trabalho_pendentes WHERE id = ?').run(id));
  });
}

export async function limparLoteTrabalho() {
  return atomic(async () => {
  const db = getDatabase();
  return (await db.prepare('DELETE FROM lotes_trabalho_pendentes').run());
  });
}

export async function calcularResumoLoteTrabalho() {
  return snapshot(async () => {
  const db = getDatabase();

  // Resumo geral
  const geral = (await db.prepare(`
    SELECT 
      COUNT(*) as total_itens,
      COALESCE(SUM(quantidade), 0) as total_quantidade,
      COALESCE(SUM(total), 0) as total_valor
    FROM lotes_trabalho_pendentes
  `).get());

  // Resumo por empresa
  const porEmpresa = (await db.prepare(`
    SELECT 
      empresa_nome,
      COUNT(*) as itens,
      SUM(quantidade) as quantidade,
      SUM(total) as valor
    FROM lotes_trabalho_pendentes
    GROUP BY empresa_nome
    ORDER BY empresa_nome
  `).all());

  return { geral, porEmpresa };
  });
}
