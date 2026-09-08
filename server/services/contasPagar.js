import { getDatabase } from '../database/connection.js';
import { registrarAuditoria } from './auditoria.js';
import crypto from 'crypto';

// ═══════════════════════════════════════
// FUNÇÕES AUXILIARES DE DATA
// ═══════════════════════════════════════

function formatarDataIso(data) {
  var ano = data.getFullYear();
  var mes = String(data.getMonth() + 1).padStart(2, '0');
  var dia = String(data.getDate()).padStart(2, '0');
  return ano + '-' + mes + '-' + dia;
}

function dataIsoHoje() {
  return formatarDataIso(new Date());
}

// ═══════════════════════════════════════
// SERVIÇOS DE CONTAS A PAGAR
// ═══════════════════════════════════════

export function listarContasPagar(filtros) {
  var db = getDatabase();
  var hoje = dataIsoHoje();

  // Atualizar visualmente (no banco) as atrasadas antes de retornar?
  // O usuário disse: "Pode atualizar automaticamente o status para atrasado ao listar"
  db.prepare(
    "UPDATE contas_pagar SET status = 'atrasado' WHERE status = 'pendente' AND vencimento < ?"
  ).run(hoje);

  var sql = 'SELECT * FROM contas_pagar WHERE 1=1';
  var params = [];

  if (filtros) {
    if (filtros.mes) {
      // mes vem como YYYY-MM
      sql += " AND vencimento LIKE ?";
      params.push(filtros.mes + '-%');
    }
    if (filtros.categoria && filtros.categoria !== 'todas') {
      sql += ' AND categoria_id = ?';
      params.push(filtros.categoria);
    }
    if (filtros.status && filtros.status !== 'todos') {
      sql += ' AND status = ?';
      params.push(filtros.status);
    }
    if (filtros.forma_pagamento && filtros.forma_pagamento !== 'todas') {
      sql += ' AND forma_pagamento = ?';
      params.push(filtros.forma_pagamento);
    }
    if (filtros.vencimento_inicio) {
      sql += ' AND vencimento >= ?';
      params.push(filtros.vencimento_inicio);
    }
    if (filtros.vencimento_fim) {
      sql += ' AND vencimento <= ?';
      params.push(filtros.vencimento_fim);
    }
  }

  sql += ' ORDER BY vencimento ASC';
  var stmt = db.prepare(sql);
  return stmt.all.apply(stmt, params);
}

export function criarContaPagar(dados) {
  var db = getDatabase();
  
  var nome = dados.nome;
  var descricao = dados.descricao || '';
  var valor = dados.valor;
  var vencimento = dados.vencimento;
  var categoria_id = dados.categoria_id;
  var forma_pagamento = dados.forma_pagamento || '';
  var recorrente = dados.recorrente ? 1 : 0;
  var frequencia = dados.frequencia || 'nenhuma';
  var observacao = dados.observacao || '';

  if (!nome || !valor || !vencimento || !categoria_id) {
    throw new Error('Campos obrigatorios faltando');
  }

  var categoria = db.prepare('SELECT nome FROM categorias WHERE id = ?').get(categoria_id);
  if (!categoria) throw new Error('Categoria nao encontrada');

  var transaction = db.transaction(function() {
    var insertStmt = db.prepare(
      'INSERT INTO contas_pagar (nome, descricao, valor, vencimento, categoria_id, categoria_nome, forma_pagamento, recorrente, frequencia, parcela_atual, total_parcelas, grupo_recorrencia_id, status, observacao) VALUES (@nome, @descricao, @valor, @vencimento, @categoria_id, @categoria_nome, @forma_pagamento, @recorrente, @frequencia, @parcela_atual, @total_parcelas, @grupo_recorrencia_id, @status, @observacao)'
    );

    if (recorrente === 0 || frequencia === 'nenhuma') {
      // Conta Única
      var info = insertStmt.run({
        nome: nome,
        descricao: descricao,
        valor: valor,
        vencimento: vencimento,
        categoria_id: categoria_id,
        categoria_nome: categoria.nome,
        forma_pagamento: forma_pagamento,
        recorrente: 0,
        frequencia: 'nenhuma',
        parcela_atual: 1,
        total_parcelas: 1,
        grupo_recorrencia_id: null,
        status: (vencimento < dataIsoHoje()) ? 'atrasado' : 'pendente',
        observacao: observacao
      });
      registrarAuditoria('CONTA_PAGAR_CRIAR', 'Conta ' + nome + ' cadastrada');
    } else {
      // Conta Recorrente
      var qtd = dados.quantidade || 12; // Usa o valor enviado ou 12 como fallback
      
      var grupoId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2);
      
      // Particiona vencimento original
      var partes = vencimento.split('-');
      var vAno = Number(partes[0]);
      var vMes = Number(partes[1]);
      var vDia = Number(partes[2]);
      var dataOriginal = new Date(vAno, vMes - 1, vDia);

      for (var i = 0; i < qtd; i++) {
        var novaData = new Date(dataOriginal.getTime());
        
        if (frequencia === 'mensal') {
          novaData.setMonth(novaData.getMonth() + i);
        } else if (frequencia === 'semanal') {
          novaData.setDate(novaData.getDate() + (i * 7));
        } else if (frequencia === 'anual') {
          novaData.setFullYear(novaData.getFullYear() + i);
        }

        var novaDataStr = formatarDataIso(novaData);
        var statusCalc = (novaDataStr < dataIsoHoje()) ? 'atrasado' : 'pendente';

        insertStmt.run({
          nome: nome + ' (' + (i + 1) + '/' + qtd + ')',
          descricao: descricao,
          valor: valor,
          vencimento: novaDataStr,
          categoria_id: categoria_id,
          categoria_nome: categoria.nome,
          forma_pagamento: forma_pagamento,
          recorrente: 1,
          frequencia: frequencia,
          parcela_atual: i + 1,
          total_parcelas: qtd,
          grupo_recorrencia_id: grupoId,
          status: statusCalc,
          observacao: observacao
        });
      }
      registrarAuditoria('CONTA_PAGAR_CRIAR_RECORRENTE', 'Conta recorrente ' + nome + ' gerada com ' + qtd + ' ocorrencias');
    }
  });

  transaction();
  return { sucesso: true };
}

export function marcarContaComoPaga(id) {
  var db = getDatabase();
  var conta = db.prepare('SELECT id, status FROM contas_pagar WHERE id = ?').get(id);
  if (!conta) throw new Error('Conta nao encontrada');
  if (conta.status === 'paga') throw new Error('Conta ja esta paga');

  db.prepare(
    "UPDATE contas_pagar SET status = 'pago', pago_em = datetime('now', 'localtime'), atualizado_em = datetime('now', 'localtime') WHERE id = ?"
  ).run(id);

  registrarAuditoria('CONTA_PAGAR_PAGA', 'Conta id=' + id + ' marcada como paga');
  return { sucesso: true };
}

export function cancelarContaPagar(id) {
  var db = getDatabase();
  var conta = db.prepare('SELECT id, status FROM contas_pagar WHERE id = ?').get(id);
  if (!conta) throw new Error('Conta nao encontrada');
  if (conta.status === 'cancelado') throw new Error('Conta ja esta cancelada');

  db.prepare(
    "UPDATE contas_pagar SET status = 'cancelado', atualizado_em = datetime('now', 'localtime') WHERE id = ?"
  ).run(id);

  registrarAuditoria('CONTA_PAGAR_CANCELAR', 'Conta id=' + id + ' cancelada');
  return { sucesso: true };
}

export function calcularResumoContasPagar(mes) {
  var db = getDatabase();
  var hoje = dataIsoHoje();

  // Primeiro atualiza possíveis atrasos
  db.prepare(
    "UPDATE contas_pagar SET status = 'atrasado' WHERE status = 'pendente' AND vencimento < ?"
  ).run(hoje);

  var params = [mes + '-%'];
  
  var pendenteQuery = db.prepare("SELECT SUM(valor) as val FROM contas_pagar WHERE status = 'pendente' AND vencimento LIKE ?").get(params);
  var atrasadoQuery = db.prepare("SELECT SUM(valor) as val FROM contas_pagar WHERE status = 'atrasado' AND vencimento LIKE ?").get(params);
  var pagoQuery = db.prepare("SELECT SUM(valor) as val FROM contas_pagar WHERE status = 'pago' AND vencimento LIKE ?").get(params);
  var qtdQuery = db.prepare("SELECT COUNT(*) as qtd FROM contas_pagar WHERE status != 'cancelado' AND vencimento LIKE ?").get(params);
  
  var proxRow = db.prepare("SELECT nome, valor, vencimento FROM contas_pagar WHERE status IN ('pendente', 'atrasado') AND vencimento >= ? ORDER BY vencimento ASC LIMIT 1").get(hoje);

  // Agrupado por categoria (para gráfico no frontend)
  var graficoCats = db.prepare(
    "SELECT categoria_nome, SUM(valor) as total FROM contas_pagar WHERE status IN ('pendente', 'atrasado', 'pago') AND vencimento LIKE ? GROUP BY categoria_nome ORDER BY total DESC"
  ).all(params);

  return {
    totalPendente: pendenteQuery.val || 0,
    totalVencido: atrasadoQuery.val || 0,
    totalPago: pagoQuery.val || 0,
    quantidadeContas: qtdQuery.qtd || 0,
    proximoVencimento: proxRow || null,
    categorias: graficoCats
  };
}

export function atualizarValorContaPagar(id, valor) {
  var db = getDatabase();
  var conta = db.prepare('SELECT id, nome, valor FROM contas_pagar WHERE id = ?').get(id);
  if (!conta) throw new Error('Conta nao encontrada');

  db.prepare(
    "UPDATE contas_pagar SET valor = ?, atualizado_em = datetime('now', 'localtime') WHERE id = ?"
  ).run(valor, id);

  registrarAuditoria('CONTA_PAGAR_VALOR_ATUALIZADO', 'Conta ' + conta.nome + ' (id=' + id + ') teve valor alterado de ' + conta.valor + ' para ' + valor);
  return { sucesso: true };
}
