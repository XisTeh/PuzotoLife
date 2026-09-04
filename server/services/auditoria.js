import { atomic, snapshot } from '../database/connection.js';
/**
 * Serviço de Auditoria
 * Registra edições, exclusões, fechamentos e ajustes retroativos.
 */

import { getDatabase } from '../database/connection.js';

export async function registrarAuditoria(tipo, descricao, dados_antes = null, dados_depois = null) {
  return atomic(async () => {
  const db = getDatabase();

  const stmt = db.prepare(`
    INSERT INTO auditoria (tipo, descricao, dados_antes, dados_depois)
    VALUES (@tipo, @descricao, @dados_antes, @dados_depois)
  `);

  return (await stmt.run({
    tipo,
    descricao,
    dados_antes: dados_antes ? JSON.stringify(dados_antes) : null,
    dados_depois: dados_depois ? JSON.stringify(dados_depois) : null
  }));
  });
}

export async function listarAuditoria(filtros = {}) {
  return snapshot(async () => {
  const db = getDatabase();
  let sql = 'SELECT * FROM auditoria WHERE 1=1';
  const params = {};

  if (filtros.tipo) {
    sql += ' AND tipo = @tipo';
    params.tipo = filtros.tipo;
  }

  if (filtros.limite) {
    sql += ' ORDER BY criado_em DESC LIMIT @limite';
    params.limite = filtros.limite;
  } else {
    sql += ' ORDER BY criado_em DESC LIMIT 100';
  }

  return (await db.prepare(sql).all(params));
  });
}
