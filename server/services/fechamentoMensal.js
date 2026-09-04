/**
 * Serviço de Fechamento Mensal
 * Gera snapshot vitalício somando todas as empresas.
 */

import { getDatabase } from '../database/connection.js';
import { registrarAuditoria } from './auditoria.js';

/**
 * Prepara o snapshot mensal somando lançamentos por empresa.
 * @param {string} referencia - Formato 'YYYY-MM' (ex: '2026-05')
 */
export function gerarPreviewMensal(mes) {
  const db = getDatabase();

  const somarPorEmpresa = (nomeEmpresa) => {
    return db.prepare(`
      SELECT 
        COALESCE(SUM(quantidade), 0) as qtd,
        COALESCE(SUM(total), 0) as total
      FROM lancamentos_trabalho
      WHERE data LIKE @ref || '%' 
        AND empresa_nome = @nome
        AND status != 'cancelado'
    `).get({ ref: mes, nome: nomeEmpresa });
  };

  const somarRanon = () => {
    return db.prepare(`
      SELECT 
        COALESCE(SUM(quantidade), 0) as qtd,
        COALESCE(SUM(total), 0) as total
      FROM laudos_ranon 
      WHERE data LIKE @ref || '%'
    `).get({ ref: mes });
  };

  const diagnostico = somarPorEmpresa('Diagnóstico');
  const perfecta = somarPorEmpresa('Perfecta');
  const email = somarPorEmpresa('E-Mail');
  const padrao = somarPorEmpresa('Padrão');
  const ranon = somarRanon();

  const qtd_global = diagnostico.qtd + perfecta.qtd + email.qtd + padrao.qtd + ranon.qtd;
  const total_global = diagnostico.total + perfecta.total + email.total + padrao.total + ranon.total;

  return {
    referencia: mes,
    diagnostico, perfecta, email, padrao, ranon,
    qtd_global, total_global
  };
}

export function fecharMesTrabalho(mes, referencia) {
  const db = getDatabase();

  const existente = db.prepare(
    'SELECT * FROM fechamentos_mensais WHERE referencia = ?'
  ).get(referencia);

  if (existente) {
    return {
      sucesso: false,
      mensagem: `Este mês já possui fechamento.`,
      fechamento: existente
    };
  }

  const preview = gerarPreviewMensal(mes);
  preview.referencia = referencia;
  
  const snapshotData = {
    ...preview,
    gerado_em: new Date().toISOString()
  };

  const resultado = db.transaction(() => {
    const stmt = db.prepare(`
      INSERT INTO fechamentos_mensais 
        (referencia, qtd_diagnostico, total_diagnostico, qtd_perfecta, total_perfecta,
         qtd_email, total_email, qtd_padrao, total_padrao, qtd_ranon, total_ranon,
         qtd_global, total_global, fechado_em, snapshot_json)
      VALUES 
        (@referencia, @qtd_diagnostico, @total_diagnostico, @qtd_perfecta, @total_perfecta,
         @qtd_email, @total_email, @qtd_padrao, @total_padrao, @qtd_ranon, @total_ranon,
         @qtd_global, @total_global, datetime('now', 'localtime'), @snapshot_json)
    `);

    const insert = stmt.run({
      referencia,
      qtd_diagnostico: preview.diagnostico.qtd,
      total_diagnostico: preview.diagnostico.total,
      qtd_perfecta: preview.perfecta.qtd,
      total_perfecta: preview.perfecta.total,
      qtd_email: preview.email.qtd,
      total_email: preview.email.total,
      qtd_padrao: preview.padrao.qtd,
      total_padrao: preview.padrao.total,
      qtd_ranon: preview.ranon.qtd,
      total_ranon: preview.ranon.total,
      qtd_global: preview.qtd_global,
      total_global: preview.total_global,
      snapshot_json: JSON.stringify(snapshotData)
    });

    registrarAuditoria('fechamento_mensal', `Fechamento mensal ${referencia}`, null, snapshotData);

    return {
      sucesso: true,
      mensagem: `Mês fechado com sucesso.`,
      fechamento_id: insert.lastInsertRowid,
      snapshot: snapshotData
    };
  })();

  return resultado;
}

export function listarFechamentosMensais() {
  const db = getDatabase();
  return db.prepare('SELECT * FROM fechamentos_mensais ORDER BY referencia DESC').all();
}

export function obterFechamentoMensalPorReferencia(referencia) {
  const db = getDatabase();
  return db.prepare('SELECT * FROM fechamentos_mensais WHERE referencia = ?').get(referencia);
}

export function obterFechamentoMensalPorId(id) {
  const db = getDatabase();
  return db.prepare('SELECT * FROM fechamentos_mensais WHERE id = ?').get(id);
}
