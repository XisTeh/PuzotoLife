import { atomic, snapshot } from '../database/connection.js';
/**
 * Serviço de Ajuste Retroativo
 * Por enquanto, usado apenas para a empresa Padrão.
 * 
 * Regras:
 * 1. Localiza o fechamento mensal
 * 2. Soma quantidade em qtd_padrao
 * 3. Soma valor em total_padrao
 * 4. Atualiza qtd_global e total_global
 * 5. Registra em ajustes_retroativos
 * 6. Registra em auditoria
 * 7. Não mexe em mês atual
 * 8. Não mexe em outras empresas
 */

import { getDatabase } from '../database/connection.js';
import { registrarAuditoria } from './auditoria.js';

export async function ajustarPadraoRetroativo(fechamento_mensal_id, quantidade, valor_unitario, observacao = null, empresa = 'Padrão') {
  return atomic(async () => {
  const db = getDatabase();

  // 1. Localizar o fechamento mensal
  const fechamento = (await db.prepare(
    'SELECT * FROM fechamentos_mensais WHERE id = ?'
  ).get(fechamento_mensal_id));

  if (!fechamento) {
    return {
      sucesso: false,
      mensagem: `Fechamento mensal ID ${fechamento_mensal_id} não encontrado.`
    };
  }

  // Mapeamento de empresas para colunas correspondentes na tabela fechamentos_mensais
  const mapEmpresaCampos = {
    'Diagnóstico': { qtdField: 'qtd_diagnostico', totalField: 'total_diagnostico', snapKey: 'diagnostico' },
    'Perfecta': { qtdField: 'qtd_perfecta', totalField: 'total_perfecta', snapKey: 'perfecta' },
    'E-Mail': { qtdField: 'qtd_email', totalField: 'total_email', snapKey: 'email' },
    'Padrão': { qtdField: 'qtd_padrao', totalField: 'total_padrao', snapKey: 'padrao' },
    'Dr. Ranon / RX': { qtdField: 'qtd_ranon', totalField: 'total_ranon', snapKey: 'ranon' }
  };

  const config = mapEmpresaCampos[empresa];
  if (!config) {
    return {
      sucesso: false,
      mensagem: `Empresa '${empresa}' inválida ou não suportada para ajuste retroativo.`
    };
  }

  const { qtdField, totalField, snapKey } = config;
  const total = quantidade * valor_unitario;

  const dadosAntes = {
    qtd_empresa: fechamento[qtdField],
    total_empresa: fechamento[totalField],
    qtd_global: fechamento.qtd_global,
    total_global: fechamento.total_global
  };

  const resultado = (await db.transaction(async () => {
    // 2-4. Atualizar o fechamento mensal
    const novosValores = {
      qtd_empresa: fechamento[qtdField] + quantidade,
      total_empresa: fechamento[totalField] + total,
      qtd_global: fechamento.qtd_global + quantidade,
      total_global: fechamento.total_global + total
    };

    // Atualizar o JSON do snapshot
    let snapshotJsonStr = fechamento.snapshot_json;
    try {
      const snap = JSON.parse(fechamento.snapshot_json);
      if (snap[snapKey]) {
        snap[snapKey].qtd += quantidade;
        snap[snapKey].total += total;
      }
      snap.qtd_global += quantidade;
      snap.total_global += total;
      
      // Lista interna de ajustes
      if (!snap.ajustes) snap.ajustes = [];
      snap.ajustes.push({
        data: new Date().toISOString(),
        empresa,
        quantidade,
        valor_unitario,
        total,
        observacao
      });

      snapshotJsonStr = JSON.stringify(snap);
    } catch (e) {
      console.error("Erro ao atualizar snapshot_json no ajuste", e);
    }

    (await db.prepare(`
      UPDATE fechamentos_mensais SET
        ${qtdField} = @qtd_empresa,
        ${totalField} = @total_empresa,
        qtd_global = @qtd_global,
        total_global = @total_global,
        snapshot_json = @snapshot_json,
        atualizado_em = datetime('now', 'localtime')
      WHERE id = @id
    `).run({ ...novosValores, snapshot_json: snapshotJsonStr, id: fechamento_mensal_id }));

    // 5. Registrar em ajustes_retroativos
    const ajuste = (await db.prepare(`
      INSERT INTO ajustes_retroativos 
        (fechamento_mensal_id, referencia, empresa, quantidade, valor_unitario, total, observacao)
      VALUES 
        (@fechamento_mensal_id, @referencia, @empresa, @quantidade, @valor_unitario, @total, @observacao)
    `).run({
      fechamento_mensal_id,
      referencia: fechamento.referencia,
      empresa,
      quantidade,
      valor_unitario,
      total,
      observacao
    }));

    // 6. Registrar em auditoria
    (await registrarAuditoria(
      'ajuste_retroativo',
      `Ajuste ${empresa} no mês ${fechamento.referencia}: +${quantidade} × R$${valor_unitario}`,
      dadosAntes,
      novosValores
    ));

    return {
      sucesso: true,
      mensagem: `Ajuste retroativo de ${empresa} aplicado ao mês ${fechamento.referencia}.`,
      ajuste_id: ajuste.lastInsertRowid,
      referencia: fechamento.referencia,
      quantidade_adicionada: quantidade,
      valor_adicionado: total,
      novos_valores: novosValores
    };
  })());

  return resultado;
  });
}

export async function listarAjustesRetroativos(referencia = null) {
  return snapshot(async () => {
  const db = getDatabase();
  if (referencia) {
    return (await db.prepare(
      'SELECT * FROM ajustes_retroativos WHERE referencia = ? ORDER BY criado_em DESC'
    ).all(referencia));
  }
  return (await db.prepare('SELECT * FROM ajustes_retroativos ORDER BY criado_em DESC').all());
  });
}
