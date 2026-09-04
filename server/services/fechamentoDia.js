import { atomic, snapshot } from '../database/connection.js';
/**
 * Serviço de Fechamento do Dia
 * 
 * Fluxo:
 * 1. Lê todos os itens de lotes_trabalho_pendentes
 * 2. Se vazio, retorna aviso
 * 3. Cria registro em fechamentos_diarios
 * 4. Copia itens para lancamentos_trabalho com status 'fechado'
 * 5. Zera lotes_trabalho_pendentes
 * 6. Retorna resumo do fechamento
 */

import { getDatabase } from '../database/connection.js';
import { registrarAuditoria } from './auditoria.js';
import { dataHojeLocal } from '../utils/dataLocal.js';

export async function fecharDiaTrabalho(dataFechamento = null) {
  return atomic(async () => {
  const db = getDatabase();

  // Data do fechamento (padrão: hoje)
  const data = dataFechamento || dataHojeLocal();

  // 1. Ler todos os itens pendentes
  const itensPendentes = (await db.prepare(
    'SELECT * FROM lotes_trabalho_pendentes ORDER BY empresa_nome, criado_em'
  ).all());

  // 2. Se vazio, retorna aviso
  if (itensPendentes.length === 0) {
    return {
      sucesso: false,
      mensagem: 'Não há itens no lote pendente para fechar.',
      data
    };
  }

  // 3. Nota: permite múltiplos fechamentos no mesmo dia
  //    (o usuário pode lançar novos itens e fechar novamente)

  // Executar tudo em transação
  const resultado = (await db.transaction(async () => {
    // Calcular totais
    let totalQuantidade = 0;
    let totalValor = 0;
    const resumoPorEmpresa = {};

    for (const item of itensPendentes) {
      totalQuantidade += item.quantidade;
      totalValor += item.total;

      if (!resumoPorEmpresa[item.empresa_nome]) {
        resumoPorEmpresa[item.empresa_nome] = { quantidade: 0, valor: 0 };
      }
      resumoPorEmpresa[item.empresa_nome].quantidade += item.quantidade;
      resumoPorEmpresa[item.empresa_nome].valor += item.total;
    }

    // 4. Criar registro em fechamentos_diarios
    const fechamento = (await db.prepare(`
      INSERT INTO fechamentos_diarios (data, total_quantidade, total_valor, resumo_json)
      VALUES (@data, @total_quantidade, @total_valor, @resumo_json)
    `).run({
      data,
      total_quantidade: totalQuantidade,
      total_valor: totalValor,
      resumo_json: JSON.stringify(resumoPorEmpresa)
    }));

    const fechamentoId = fechamento.lastInsertRowid;

    // 5. Copiar itens para lancamentos_trabalho
    const insertLancamento = db.prepare(`
      INSERT INTO lancamentos_trabalho 
        (empresa_id, empresa_nome, quantidade, valor_unitario, total, data, horario, status, observacao, origem_fechamento_dia_id)
      VALUES 
        (@empresa_id, @empresa_nome, @quantidade, @valor_unitario, @total, @data, @horario, 'fechado', @observacao, @fechamento_id)
    `);

    for (const item of itensPendentes) {
      (await insertLancamento.run({
        empresa_id: item.empresa_id,
        empresa_nome: item.empresa_nome,
        quantidade: item.quantidade,
        valor_unitario: item.valor_unitario,
        total: item.total,
        data: item.data,
        horario: item.horario,
        observacao: item.observacao,
        fechamento_id: fechamentoId
      }));
    }

    // 6. Zerar lotes_trabalho_pendentes
    (await db.prepare('DELETE FROM lotes_trabalho_pendentes').run());

    // 7. Registrar auditoria
    (await registrarAuditoria('fechamento_dia', `Fechamento do dia ${data}`, null, {
      data,
      fechamento_id: fechamentoId,
      total_itens: itensPendentes.length,
      total_quantidade: totalQuantidade,
      total_valor: totalValor,
      resumo: resumoPorEmpresa
    }));

    return {
      sucesso: true,
      mensagem: `Dia ${data} fechado com sucesso.`,
      data,
      fechamento_id: fechamentoId,
      total_itens: itensPendentes.length,
      total_quantidade: totalQuantidade,
      total_valor: totalValor,
      resumo: resumoPorEmpresa
    };
  })());

  return resultado;
  });
}

export async function listarFechamentosDiarios() {
  return snapshot(async () => {
  const db = getDatabase();
  return (await db.prepare('SELECT * FROM fechamentos_diarios ORDER BY data DESC').all());
  });
}

export async function obterFechamentoDiario(data) {
  return snapshot(async () => {
  const db = getDatabase();
  return (await db.prepare('SELECT * FROM fechamentos_diarios WHERE data = ?').get(data));
  });
}

export async function desfazerFechamentoDia(fechamentoId) {
  return atomic(async () => {
  const db = getDatabase();
  
  // Verifica se o fechamento existe
  const fechamento = (await db.prepare('SELECT * FROM fechamentos_diarios WHERE id = ?').get(fechamentoId));
  if (!fechamento) {
    return { sucesso: false, mensagem: 'Fechamento não encontrado.' };
  }
  
  // Transação para desfazer
  const resultado = (await db.transaction(async () => {
    // 1. Move os lançamentos definitivos de volta para o lote temporário
    const lancamentos = (await db.prepare('SELECT * FROM lancamentos_trabalho WHERE origem_fechamento_dia_id = ?').all(fechamentoId));
    
    const insertLote = db.prepare(`
      INSERT INTO lotes_trabalho_pendentes 
        (empresa_id, empresa_nome, quantidade, valor_unitario, total, data, horario, observacao)
      VALUES 
        (@empresa_id, @empresa_nome, @quantidade, @valor_unitario, @total, @data, @horario, @observacao)
    `);
    
    for (const item of lancamentos) {
      (await insertLote.run({
        empresa_id: item.empresa_id,
        empresa_nome: item.empresa_nome,
        quantidade: item.quantidade,
        valor_unitario: item.valor_unitario,
        total: item.total,
        data: item.data,
        horario: item.horario,
        observacao: item.observacao
      }));
    }
    
    // 2. Apaga os lançamentos definitivos atrelados a este fechamento
    (await db.prepare('DELETE FROM lancamentos_trabalho WHERE origem_fechamento_dia_id = ?').run(fechamentoId));
    
    // 3. Apaga o registro de fechamento diário
    (await db.prepare('DELETE FROM fechamentos_diarios WHERE id = ?').run(fechamentoId));
    
    // 4. Registra na auditoria
    (await registrarAuditoria('desfazer_fechamento_dia', `Desfeito fechamento do dia ${fechamento.data}`, fechamento, null));
    
    return {
      sucesso: true,
      mensagem: `Fechamento do dia ${fechamento.data} foi desfeito com sucesso. Os itens retornaram ao lote temporário.`
    };
  })());
  
  return resultado;
  });
}
