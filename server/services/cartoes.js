import { getDatabase } from '../database/connection.js';
import { registrarAuditoria } from './auditoria.js';

// ═══════════════════════════════════════
// FUNÇÕES AUXILIARES DE DATA
// ═══════════════════════════════════════

function formatarCompetencia(data) {
  var ano = data.getFullYear();
  var mes = String(data.getMonth() + 1).padStart(2, '0');
  return ano + '-' + mes;
}

function formatarDataIso(data) {
  var ano = data.getFullYear();
  var mes = String(data.getMonth() + 1).padStart(2, '0');
  var dia = String(data.getDate()).padStart(2, '0');
  return ano + '-' + mes + '-' + dia;
}

function calcularCompetenciaEVencimento(dataCompraIso, diaFechamento, diaVencimento, parcelaIndex) {
  var partes = dataCompraIso.split('-');
  var ano = Number(partes[0]);
  var mes = Number(partes[1]);
  var dia = Number(partes[2]);

  var mesAdicional = 0;
  if (dia > diaFechamento) {
    mesAdicional = 1;
  }

  var dataCompetencia = new Date(ano, mes - 1 + mesAdicional + parcelaIndex, 1);

  var compStr = formatarCompetencia(dataCompetencia);

  var compAno = dataCompetencia.getFullYear();
  var compMes = dataCompetencia.getMonth();

  var ultimoDia = new Date(compAno, compMes + 1, 0).getDate();
  var diaVencReal = diaVencimento > ultimoDia ? ultimoDia : diaVencimento;
  var dataVencimento = new Date(compAno, compMes, diaVencReal);

  return {
    competencia: compStr,
    vencimento: formatarDataIso(dataVencimento)
  };
}

// ═══════════════════════════════════════
// CARTÕES
// ═══════════════════════════════════════

export function listarCartoes() {
  var db = getDatabase();
  return db.prepare('SELECT * FROM cartoes ORDER BY ativo DESC, nome ASC').all();
}

export function criarCartao(dados) {
  var db = getDatabase();
  var nome = dados.nome;
  var banco = dados.banco || '';
  var limite = dados.limite || 0;
  var dia_fechamento = dados.dia_fechamento;
  var dia_vencimento = dados.dia_vencimento;
  var cor = dados.cor || '#14b8a6';
  var icone = dados.icone || 'credit-card';

  // Verificar duplicidade
  var existe = db.prepare('SELECT id FROM cartoes WHERE ativo = 1 AND nome = ? AND banco = ? AND dia_fechamento = ? AND dia_vencimento = ?').get(nome, banco, dia_fechamento, dia_vencimento);
  if (existe) {
    throw new Error('Já existe um cartão ativo com esses mesmos dados.');
  }

  var info = db.prepare(
    'INSERT INTO cartoes (nome, banco, limite, dia_fechamento, dia_vencimento, cor, icone) VALUES (@nome, @banco, @limite, @dia_fechamento, @dia_vencimento, @cor, @icone)'
  ).run({ nome: nome, banco: banco, limite: limite, dia_fechamento: dia_fechamento, dia_vencimento: dia_vencimento, cor: cor, icone: icone });

  registrarAuditoria('CARTAO_CRIAR', 'Cartao ' + nome + ' cadastrado');
  return { id: info.lastInsertRowid, sucesso: true };
}

export function atualizarCartao(id, dados) {
  var db = getDatabase();

  db.prepare(
    'UPDATE cartoes SET nome = COALESCE(@nome, nome), banco = COALESCE(@banco, banco), limite = COALESCE(@limite, limite), dia_fechamento = COALESCE(@dia_fechamento, dia_fechamento), dia_vencimento = COALESCE(@dia_vencimento, dia_vencimento), cor = COALESCE(@cor, cor), icone = COALESCE(@icone, icone), ativo = COALESCE(@ativo, ativo), atualizado_em = datetime(\'now\', \'localtime\') WHERE id = @id'
  ).run({
    id: id,
    nome: dados.nome || null,
    banco: dados.banco || null,
    limite: dados.limite != null ? dados.limite : null,
    dia_fechamento: dados.dia_fechamento || null,
    dia_vencimento: dados.dia_vencimento || null,
    cor: dados.cor || null,
    icone: dados.icone || null,
    ativo: dados.ativo != null ? dados.ativo : null
  });

  registrarAuditoria('CARTAO_ATUALIZAR', 'Cartao id=' + id + ' atualizado');
  return { sucesso: true };
}

export function removerCartao(id, forcar = false) {
  var db = getDatabase();
  var cartao = db.prepare('SELECT nome FROM cartoes WHERE id = ?').get(id);
  if (!cartao) throw new Error('Cartão não encontrado');

  var temCompras = db.prepare('SELECT 1 FROM compras_cartao WHERE cartao_id = ? LIMIT 1').get(id);
  var temParcelas = db.prepare('SELECT 1 FROM parcelas_cartao WHERE cartao_id = ? LIMIT 1').get(id);
  var temFaturas = db.prepare('SELECT 1 FROM faturas_cartao WHERE cartao_id = ? LIMIT 1').get(id);

  if ((temCompras || temParcelas || temFaturas) && !forcar) {
    db.prepare('UPDATE cartoes SET ativo = 0, atualizado_em = datetime(\'now\', \'localtime\') WHERE id = ?').run(id);
    registrarAuditoria('CARTAO_DESATIVAR', 'Cartão id=' + id + ' desativado por conter histórico');
    return { sucesso: true, mensagem: 'Este cartão possui histórico. Ele foi desativado em vez de excluído.' };
  }

  // Se forçado ou se não houver vínculos, apagar tudo
  var transaction = db.transaction(function() {
    if (forcar) {
      db.prepare('DELETE FROM parcelas_cartao WHERE cartao_id = ?').run(id);
      db.prepare('DELETE FROM compras_cartao WHERE cartao_id = ?').run(id);
      db.prepare('DELETE FROM faturas_cartao WHERE cartao_id = ?').run(id);
    }
    db.prepare('DELETE FROM cartoes WHERE id = ?').run(id);
    registrarAuditoria('CARTAO_EXCLUIR', 'Cartão id=' + id + ' (' + cartao.nome + ') excluído' + (forcar ? ' com limpeza de histórico' : ''));
  });

  transaction();
  return { sucesso: true, mensagem: forcar ? 'Cartão e todo seu histórico foram excluídos com sucesso.' : 'Cartão excluído com sucesso.' };
}

export function ativarCartao(id, ativo) {
  var db = getDatabase();
  db.prepare('UPDATE cartoes SET ativo = ?, atualizado_em = datetime(\'now\', \'localtime\') WHERE id = ?').run(ativo ? 1 : 0, id);
  registrarAuditoria('CARTAO_STATUS', 'Cartão id=' + id + ' alterado para ativo=' + ativo);
  return { sucesso: true };
}

// ═══════════════════════════════════════
// COMPRAS E PARCELAS
// ═══════════════════════════════════════

export function listarComprasCartao(cartaoId) {
  var db = getDatabase();
  if (cartaoId) {
    return db.prepare('SELECT * FROM compras_cartao WHERE cartao_id = ? ORDER BY data_compra DESC LIMIT 100').all(cartaoId);
  }
  return db.prepare('SELECT * FROM compras_cartao ORDER BY data_compra DESC LIMIT 100').all();
}

export function criarCompraCartao(dados) {
  var db = getDatabase();
  var cartao_id = dados.cartao_id;
  var descricao = dados.descricao;
  var valor_total = dados.valor_total;
  var categoria_id = dados.categoria_id;
  var data_compra = dados.data_compra;
  var quantidade_parcelas = dados.quantidade_parcelas || 1;
  var observacao = dados.observacao || '';

  var resultId;

  var transaction = db.transaction(function() {
    var cartao = db.prepare('SELECT * FROM cartoes WHERE id = ?').get(cartao_id);
    if (!cartao) throw new Error('Cartao nao encontrado');

    var categoria = db.prepare('SELECT * FROM categorias WHERE id = ?').get(categoria_id);
    if (!categoria) throw new Error('Categoria nao encontrada');

    // 1. Criar Compra
    var infoCompra = db.prepare(
      'INSERT INTO compras_cartao (cartao_id, cartao_nome, descricao, valor_total, categoria_id, categoria_nome, data_compra, quantidade_parcelas, observacao) VALUES (@cartao_id, @cartao_nome, @descricao, @valor_total, @categoria_id, @categoria_nome, @data_compra, @quantidade_parcelas, @observacao)'
    ).run({
      cartao_id: cartao_id,
      cartao_nome: cartao.nome,
      descricao: descricao,
      valor_total: valor_total,
      categoria_id: categoria_id,
      categoria_nome: categoria.nome,
      data_compra: data_compra,
      quantidade_parcelas: quantidade_parcelas,
      observacao: observacao
    });

    resultId = infoCompra.lastInsertRowid;

    // 2. Gerar Parcelas
    var valorParcela = Number((valor_total / quantidade_parcelas).toFixed(2));
    var competenciasAfetadas = [];

    for (var i = 0; i < quantidade_parcelas; i++) {
      var cv = calcularCompetenciaEVencimento(data_compra, cartao.dia_fechamento, cartao.dia_vencimento, i);

      var valorFinal = valorParcela;
      if (i === quantidade_parcelas - 1) {
        var somaAnteriores = valorParcela * (quantidade_parcelas - 1);
        valorFinal = Number((valor_total - somaAnteriores).toFixed(2));
      }

      var descParcela = quantidade_parcelas > 1 ? descricao + ' (' + (i + 1) + '/' + quantidade_parcelas + ')' : descricao;

      db.prepare(
        'INSERT INTO parcelas_cartao (compra_id, cartao_id, cartao_nome, numero_parcela, total_parcelas, valor_parcela, competencia, vencimento, categoria_nome, descricao) VALUES (@compra_id, @cartao_id, @cartao_nome, @numero_parcela, @total_parcelas, @valor_parcela, @competencia, @vencimento, @categoria_nome, @descricao)'
      ).run({
        compra_id: resultId,
        cartao_id: cartao_id,
        cartao_nome: cartao.nome,
        numero_parcela: i + 1,
        total_parcelas: quantidade_parcelas,
        valor_parcela: valorFinal,
        competencia: cv.competencia,
        vencimento: cv.vencimento,
        categoria_nome: categoria.nome,
        descricao: descParcela
      });

      if (competenciasAfetadas.indexOf(cv.competencia) === -1) {
        competenciasAfetadas.push(cv.competencia);
      }
    }

    // 3. Atualizar/Criar faturas
    for (var j = 0; j < competenciasAfetadas.length; j++) {
      garantirFatura(db, cartao, competenciasAfetadas[j]);
      recalcularFaturaTotal(db, cartao_id, competenciasAfetadas[j]);
    }

    registrarAuditoria('CARTAO_COMPRA', 'Compra ' + descricao + ' no cartao ' + cartao.nome);
  });

  transaction();
  return { id: resultId, sucesso: true };
}

// ═══════════════════════════════════════
// FATURAS
// ═══════════════════════════════════════

function garantirFatura(db, cartao, competencia) {
  var fatura = db.prepare('SELECT id FROM faturas_cartao WHERE cartao_id = ? AND competencia = ?').get(cartao.id, competencia);
  if (!fatura) {
    var partes = competencia.split('-');
    var ano = parseInt(partes[0], 10);
    var mes = parseInt(partes[1], 10) - 1;

    var ultimoDia = new Date(ano, mes + 1, 0).getDate();
    var diaVencReal = cartao.dia_vencimento > ultimoDia ? ultimoDia : cartao.dia_vencimento;

    var dataVenc = new Date(ano, mes, diaVencReal);
    var vencimentoFinal = formatarDataIso(dataVenc);

    db.prepare(
      "INSERT INTO faturas_cartao (cartao_id, cartao_nome, competencia, vencimento, total, status) VALUES (?, ?, ?, ?, 0, 'aberta')"
    ).run(cartao.id, cartao.nome, competencia, vencimentoFinal);
  }
}

function recalcularFaturaTotal(db, cartao_id, competencia) {
  var sumQuery = db.prepare(
    "SELECT SUM(valor_parcela) as total FROM parcelas_cartao WHERE cartao_id = ? AND competencia = ? AND status != 'cancelada'"
  ).get(cartao_id, competencia);

  var total = sumQuery.total || 0;

  db.prepare(
    'UPDATE faturas_cartao SET total = ? WHERE cartao_id = ? AND competencia = ?'
  ).run(total, cartao_id, competencia);
}

export function listarFaturasCartao(filtros) {
  var db = getDatabase();
  var query = 'SELECT * FROM faturas_cartao WHERE 1=1';
  var params = [];

  if (filtros && filtros.cartao_id) {
    query += ' AND cartao_id = ?';
    params.push(filtros.cartao_id);
  }
  if (filtros && filtros.status) {
    query += ' AND status = ?';
    params.push(filtros.status);
  }
  if (filtros && filtros.competencia) {
    query += ' AND competencia = ?';
    params.push(filtros.competencia);
  }

  query += ' ORDER BY competencia DESC';
  var stmt = db.prepare(query);
  return stmt.all.apply(stmt, params);
}

export function listarFaturasResumo() {
  var db = getDatabase();
  var hoje = new Date();
  var compAtual = formatarCompetencia(hoje);

  var atualRow = db.prepare("SELECT SUM(total) as val FROM faturas_cartao WHERE competencia = ? AND status != 'cancelada'").get(compAtual);
  var proxRow = db.prepare("SELECT SUM(total) as val FROM faturas_cartao WHERE competencia > ? AND status != 'cancelada'").get(compAtual);
  var abertasRow = db.prepare("SELECT SUM(total) as val FROM faturas_cartao WHERE status IN ('aberta','fechada')").get();
  var limiteRow = db.prepare("SELECT SUM(total) as val FROM faturas_cartao WHERE status IN ('aberta','fechada')").get();
  var proxVenc = db.prepare("SELECT cartao_nome, competencia, vencimento, total FROM faturas_cartao WHERE status IN ('aberta','fechada') ORDER BY vencimento ASC LIMIT 1").get();

  return {
    faturaAtual: atualRow && atualRow.val ? atualRow.val : 0,
    faturasProximas: proxRow && proxRow.val ? proxRow.val : 0,
    totalAberto: abertasRow && abertasRow.val ? abertasRow.val : 0,
    limiteUsado: limiteRow && limiteRow.val ? limiteRow.val : 0,
    proximoVencimento: proxVenc ? proxVenc : null
  };
}

export function obterFaturaComParcelas(faturaId) {
  var db = getDatabase();
  var fatura = db.prepare('SELECT * FROM faturas_cartao WHERE id = ?').get(faturaId);
  if (!fatura) throw new Error('Fatura nao encontrada');

  var parcelasCompletas = db.prepare(
    'SELECT p.*, c.data_compra FROM parcelas_cartao p JOIN compras_cartao c ON p.compra_id = c.id WHERE p.cartao_id = ? AND p.competencia = ? ORDER BY c.data_compra DESC, p.id DESC'
  ).all(fatura.cartao_id, fatura.competencia);

  fatura.parcelas = parcelasCompletas;
  return fatura;
}

export function marcarFaturaComoPaga(faturaId, opcoes) {
  var db = getDatabase();
  var opts = opcoes || {};
  var dataPagamento = opts.data_pagamento || formatarDataIso(new Date());
  var formaPagamento = opts.forma_pagamento || '';
  var observacao = opts.observacao || '';

  var resultado = {};

  var transaction = db.transaction(function() {
    var fatura = db.prepare('SELECT * FROM faturas_cartao WHERE id = ?').get(faturaId);
    if (!fatura) throw new Error('Fatura nao encontrada');
    if (fatura.status === 'paga') throw new Error('Esta fatura ja esta paga.');

    db.prepare(
      "UPDATE faturas_cartao SET status = 'paga', pago_em = ?, forma_pagamento = ?, observacao_pagamento = ?, atualizado_em = datetime('now', 'localtime') WHERE id = ?"
    ).run(dataPagamento, formaPagamento, observacao, faturaId);

    db.prepare(
      "UPDATE parcelas_cartao SET status = 'paga', atualizado_em = datetime('now', 'localtime') WHERE cartao_id = ? AND competencia = ? AND status != 'cancelada'"
    ).run(fatura.cartao_id, fatura.competencia);

    registrarAuditoria('CARTAO_FATURA_PAGAR', 'Fatura ' + fatura.cartao_nome + ' ' + fatura.competencia + ' paga em ' + dataPagamento + (formaPagamento ? ' via ' + formaPagamento : ''));

    resultado = {
      sucesso: true,
      cartao_nome: fatura.cartao_nome,
      competencia: fatura.competencia,
      total: fatura.total
    };
  });

  transaction();
  return resultado;
}

// ═══════════════════════════════════════
// COMPRA EM ANDAMENTO
// ═══════════════════════════════════════

export function criarCompraCartaoEmAndamento(dados) {
  var db = getDatabase();
  var cartao_id = dados.cartao_id;
  var descricao = dados.descricao;
  var categoria_id = dados.categoria_id;
  var valor_parcela = dados.valor_parcela;
  var valor_total_original = dados.valor_total_original;
  var total_parcelas_original = dados.total_parcelas_original;
  var parcela_inicial = dados.parcela_inicial;
  var quantidade_parcelas = dados.quantidade_parcelas;
  var competencia_inicial = dados.competencia_inicial; // formato "YYYY-MM"
  var dia_vencimento_fatura = dados.dia_vencimento_fatura;
  var observacao = dados.observacao || '';

  var resultId;

  var transaction = db.transaction(function() {
    var cartao = db.prepare('SELECT * FROM cartoes WHERE id = ?').get(cartao_id);
    if (!cartao) throw new Error('Cartão não encontrado');

    var categoria = db.prepare('SELECT * FROM categorias WHERE id = ?').get(categoria_id);
    if (!categoria) throw new Error('Categoria não encontrada');

    // Calcular data_compra fictícia baseada na competência inicial
    var partesComp = competencia_inicial.split('-');
    var anoComp = parseInt(partesComp[0], 10);
    var mesComp = parseInt(partesComp[1], 10);
    var dataCompra = anoComp + '-' + String(mesComp).padStart(2, '0') + '-01';

    // 1. Criar registro de compra
    var infoCompra = db.prepare(
      'INSERT INTO compras_cartao (cartao_id, cartao_nome, descricao, valor_total, categoria_id, categoria_nome, data_compra, quantidade_parcelas, observacao) VALUES (@cartao_id, @cartao_nome, @descricao, @valor_total, @categoria_id, @categoria_nome, @data_compra, @quantidade_parcelas, @observacao)'
    ).run({
      cartao_id: cartao_id,
      cartao_nome: cartao.nome,
      descricao: descricao,
      valor_total: valor_total_original,
      categoria_id: categoria_id,
      categoria_nome: categoria.nome,
      data_compra: dataCompra,
      quantidade_parcelas: quantidade_parcelas,
      observacao: observacao ? ('Em andamento: ' + observacao) : 'Compra em andamento (parcelas ' + parcela_inicial + '-' + (parcela_inicial + quantidade_parcelas - 1) + '/' + total_parcelas_original + ')'
    });

    resultId = infoCompra.lastInsertRowid;

    // 2. Gerar parcelas com valor fixo (NÃO divide)
    var competenciasAfetadas = [];
    var diaVenc = dia_vencimento_fatura || cartao.dia_vencimento;

    for (var i = 0; i < quantidade_parcelas; i++) {
      var numParcela = parcela_inicial + i;
      var mesOffset = mesComp - 1 + i; // zero-indexed
      var dataComp = new Date(anoComp, mesOffset, 1);
      var compStr = formatarCompetencia(dataComp);

      var compAno = dataComp.getFullYear();
      var compMesIdx = dataComp.getMonth();
      var ultimoDia = new Date(compAno, compMesIdx + 1, 0).getDate();
      var diaVencReal = diaVenc > ultimoDia ? ultimoDia : diaVenc;
      var dataVencimento = new Date(compAno, compMesIdx, diaVencReal);
      var vencimentoStr = formatarDataIso(dataVencimento);

      var descParcela = descricao + ' (' + numParcela + '/' + total_parcelas_original + ')';

      db.prepare(
        'INSERT INTO parcelas_cartao (compra_id, cartao_id, cartao_nome, numero_parcela, total_parcelas, valor_parcela, competencia, vencimento, categoria_nome, descricao) VALUES (@compra_id, @cartao_id, @cartao_nome, @numero_parcela, @total_parcelas, @valor_parcela, @competencia, @vencimento, @categoria_nome, @descricao)'
      ).run({
        compra_id: resultId,
        cartao_id: cartao_id,
        cartao_nome: cartao.nome,
        numero_parcela: numParcela,
        total_parcelas: total_parcelas_original,
        valor_parcela: valor_parcela,
        competencia: compStr,
        vencimento: vencimentoStr,
        categoria_nome: categoria.nome,
        descricao: descParcela
      });

      if (competenciasAfetadas.indexOf(compStr) === -1) {
        competenciasAfetadas.push(compStr);
      }
    }

    // 3. Atualizar/Criar faturas
    for (var j = 0; j < competenciasAfetadas.length; j++) {
      garantirFatura(db, cartao, competenciasAfetadas[j]);
      recalcularFaturaTotal(db, cartao_id, competenciasAfetadas[j]);
    }

    registrarAuditoria('CARTAO_COMPRA_ANDAMENTO', 'Compra em andamento ' + descricao + ' parcelas ' + parcela_inicial + '-' + (parcela_inicial + quantidade_parcelas - 1) + '/' + total_parcelas_original);
  });

  transaction();
  return { id: resultId, sucesso: true };
}

// ═══════════════════════════════════════
// CRUD COMPRAS PARCELADAS
// ═══════════════════════════════════════

export function obterCompraCartao(compraId) {
  var db = getDatabase();
  var compra = db.prepare('SELECT * FROM compras_cartao WHERE id = ?').get(compraId);
  if (!compra) throw new Error('Compra não encontrada');

  var parcelas = db.prepare('SELECT * FROM parcelas_cartao WHERE compra_id = ? ORDER BY numero_parcela ASC').all(compraId);
  compra.parcelas = parcelas;

  var temParcPaga = parcelas.some(function(p) { return p.status === 'paga'; });
  compra.temParcelasPagas = temParcPaga;

  return compra;
}

export function atualizarCompraCartao(compraId, dados) {
  var db = getDatabase();

  var transaction = db.transaction(function() {
    var compra = db.prepare('SELECT * FROM compras_cartao WHERE id = ?').get(compraId);
    if (!compra) throw new Error('Compra não encontrada');

    var cartao = db.prepare('SELECT * FROM cartoes WHERE id = ?').get(compra.cartao_id);
    if (!cartao) throw new Error('Cartão não encontrado');

    var categoria = null;
    if (dados.categoria_id) {
      categoria = db.prepare('SELECT * FROM categorias WHERE id = ?').get(dados.categoria_id);
      if (!categoria) throw new Error('Categoria não encontrada');
    }

    // Atualizar registro de compra
    db.prepare(
      'UPDATE compras_cartao SET descricao = COALESCE(@descricao, descricao), valor_total = COALESCE(@valor_total, valor_total), categoria_id = COALESCE(@categoria_id, categoria_id), categoria_nome = COALESCE(@categoria_nome, categoria_nome), observacao = COALESCE(@observacao, observacao), atualizado_em = datetime(\'now\', \'localtime\') WHERE id = @id'
    ).run({
      id: compraId,
      descricao: dados.descricao || null,
      valor_total: dados.valor_total != null ? dados.valor_total : null,
      categoria_id: dados.categoria_id || null,
      categoria_nome: categoria ? categoria.nome : null,
      observacao: dados.observacao !== undefined ? dados.observacao : null
    });

    // Se valor_parcela fornecido, atualizar parcelas NÃO pagas
    if (dados.valor_parcela != null) {
      var parcelas = db.prepare('SELECT * FROM parcelas_cartao WHERE compra_id = ?').all(compraId);
      var competenciasAfetadas = [];

      for (var i = 0; i < parcelas.length; i++) {
        var p = parcelas[i];
        if (p.status !== 'paga') {
          var novaDesc = (dados.descricao || compra.descricao) + ' (' + p.numero_parcela + '/' + p.total_parcelas + ')';
          db.prepare(
            'UPDATE parcelas_cartao SET valor_parcela = ?, descricao = ?, categoria_nome = COALESCE(?, categoria_nome), atualizado_em = datetime(\'now\', \'localtime\') WHERE id = ?'
          ).run(dados.valor_parcela, novaDesc, categoria ? categoria.nome : null, p.id);
        }
        if (competenciasAfetadas.indexOf(p.competencia) === -1) {
          competenciasAfetadas.push(p.competencia);
        }
      }

      // Recalcular faturas afetadas
      for (var j = 0; j < competenciasAfetadas.length; j++) {
        recalcularFaturaTotal(db, compra.cartao_id, competenciasAfetadas[j]);
      }
    } else if (dados.descricao || categoria) {
      // Atualizar apenas descrição/categoria nas parcelas não pagas
      var parcelas2 = db.prepare("SELECT * FROM parcelas_cartao WHERE compra_id = ? AND status != 'paga'").all(compraId);
      for (var k = 0; k < parcelas2.length; k++) {
        var p2 = parcelas2[k];
        var novaDesc2 = (dados.descricao || compra.descricao) + ' (' + p2.numero_parcela + '/' + p2.total_parcelas + ')';
        db.prepare(
          'UPDATE parcelas_cartao SET descricao = ?, categoria_nome = COALESCE(?, categoria_nome), atualizado_em = datetime(\'now\', \'localtime\') WHERE id = ?'
        ).run(novaDesc2, categoria ? categoria.nome : null, p2.id);
      }
    }

    registrarAuditoria('CARTAO_COMPRA_EDITAR', 'Compra id=' + compraId + ' (' + (dados.descricao || compra.descricao) + ') atualizada');
  });

  transaction();
  return { sucesso: true };
}

export function excluirCompraCartao(compraId, confirmacao) {
  var db = getDatabase();

  var transaction = db.transaction(function() {
    var compra = db.prepare('SELECT * FROM compras_cartao WHERE id = ?').get(compraId);
    if (!compra) throw new Error('Compra não encontrada');

    var parcelas = db.prepare('SELECT * FROM parcelas_cartao WHERE compra_id = ?').all(compraId);
    var temPagas = parcelas.some(function(p) { return p.status === 'paga'; });

    if (temPagas && confirmacao !== 'EXCLUIR MESMO ASSIM') {
      throw new Error('PARCELAS_PAGAS:Esta compra possui parcelas já pagas. Para excluir, confirme com "EXCLUIR MESMO ASSIM".');
    }

    if (!temPagas && confirmacao !== 'EXCLUIR') {
      throw new Error('Confirmação inválida.');
    }

    // Coletar competências afetadas
    var competenciasAfetadas = [];
    for (var i = 0; i < parcelas.length; i++) {
      if (competenciasAfetadas.indexOf(parcelas[i].competencia) === -1) {
        competenciasAfetadas.push(parcelas[i].competencia);
      }
    }

    // Excluir parcelas
    db.prepare('DELETE FROM parcelas_cartao WHERE compra_id = ?').run(compraId);

    // Excluir compra
    db.prepare('DELETE FROM compras_cartao WHERE id = ?').run(compraId);

    // Recalcular faturas afetadas
    for (var j = 0; j < competenciasAfetadas.length; j++) {
      recalcularFaturaTotal(db, compra.cartao_id, competenciasAfetadas[j]);

      // Se fatura ficou zerada e não tem mais parcelas, remover
      var restante = db.prepare(
        "SELECT COUNT(*) as count FROM parcelas_cartao WHERE cartao_id = ? AND competencia = ? AND status != 'cancelada'"
      ).get(compra.cartao_id, competenciasAfetadas[j]);

      if (restante.count === 0) {
        var faturaAtual = db.prepare(
          "SELECT * FROM faturas_cartao WHERE cartao_id = ? AND competencia = ? AND status != 'paga'"
        ).get(compra.cartao_id, competenciasAfetadas[j]);
        if (faturaAtual) {
          db.prepare('DELETE FROM faturas_cartao WHERE id = ?').run(faturaAtual.id);
        }
      }
    }

    registrarAuditoria('CARTAO_COMPRA_EXCLUIR', 'Compra id=' + compraId + ' (' + compra.descricao + ') e ' + parcelas.length + ' parcelas excluídas');
  });

  transaction();
  return { sucesso: true, mensagem: 'Compra e parcelas excluídas com sucesso. Faturas recalculadas.' };
}

// ═══════════════════════════════════════
// EXTRAS
// ═══════════════════════════════════════

export function listarParcelasRecentes() {
  var db = getDatabase();
  return db.prepare(
    'SELECT p.*, c.data_compra FROM parcelas_cartao p JOIN compras_cartao c ON p.compra_id = c.id ORDER BY c.data_compra DESC, p.id DESC LIMIT 100'
  ).all();
}

export function listarComprasParceladas() {
  var db = getDatabase();
  var compras = db.prepare('SELECT * FROM compras_cartao ORDER BY data_compra DESC LIMIT 100').all();
  
  for (var i = 0; i < compras.length; i++) {
    var c = compras[i];
    var stats = db.prepare(
      "SELECT COUNT(*) as total, SUM(CASE WHEN status = 'paga' THEN 1 ELSE 0 END) as pagas, SUM(CASE WHEN status != 'cancelada' THEN valor_parcela ELSE 0 END) as valor_total_parcelas, SUM(CASE WHEN status = 'aberta' THEN valor_parcela ELSE 0 END) as valor_restante FROM parcelas_cartao WHERE compra_id = ?"
    ).get(c.id);
    
    var prox = db.prepare("SELECT valor_parcela, competencia FROM parcelas_cartao WHERE compra_id = ? AND status = 'aberta' ORDER BY numero_parcela ASC LIMIT 1").get(c.id);
    
    c.total_parcelas_geradas = stats.total;
    c.parcelas_pagas = stats.pagas;
    c.valor_total_parcelas = stats.valor_total_parcelas || 0;
    c.valor_restante = stats.valor_restante || 0;
    c.prox_valor = prox ? prox.valor_parcela : 0;
    c.prox_competencia = prox ? prox.competencia : null;
  }
  
  return compras;
}

// ═══════════════════════════════════════
// ANTECIPAÇÃO DE PARCELAS
// ═══════════════════════════════════════

function obterCompetenciaAlvoAntecipacao(db, cartaoId) {
  var faturaAberta = db.prepare(
    "SELECT competencia FROM faturas_cartao WHERE cartao_id = ? AND status = 'aberta' ORDER BY competencia ASC LIMIT 1"
  ).get(cartaoId);
  
  if (faturaAberta) {
    return faturaAberta.competencia;
  }
  
  var cartao = db.prepare('SELECT * FROM cartoes WHERE id = ?').get(cartaoId);
  if (!cartao) throw new Error('Cartão não encontrado');
  
  var hoje = new Date();
  var ano = hoje.getFullYear();
  var mes = hoje.getMonth() + 1;
  var dia = hoje.getDate();
  
  var mesAdicional = 0;
  if (dia > cartao.dia_fechamento) {
    mesAdicional = 1;
  }
  
  var dataCompetencia = new Date(ano, mes - 1 + mesAdicional, 1);
  return formatarCompetencia(dataCompetencia);
}

export function anteciparParcelas(dados) {
  var db = getDatabase();
  var ids = dados.ids;
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    throw new Error('Nenhuma parcela selecionada para antecipar.');
  }

  var resultado = { sucesso: true, atualizados: 0 };

  var transaction = db.transaction(function() {
    var placeholders = ids.map(function() { return '?'; }).join(',');
    var parcelas = db.prepare('SELECT * FROM parcelas_cartao WHERE id IN (' + placeholders + ')').all(ids);

    if (parcelas.length === 0) {
      throw new Error('Nenhuma parcela encontrada para os IDs fornecidos.');
    }

    var parcelasPorCartao = {};
    for (var i = 0; i < parcelas.length; i++) {
      var p = parcelas[i];
      if (p.status !== 'aberta') {
        throw new Error('A parcela "' + p.descricao + '" não está aberta e não pode ser antecipada.');
      }
      if (!parcelasPorCartao[p.cartao_id]) {
        parcelasPorCartao[p.cartao_id] = [];
      }
      parcelasPorCartao[p.cartao_id].push(p);
    }

    var cartaoIds = Object.keys(parcelasPorCartao);
    for (var c = 0; c < cartaoIds.length; c++) {
      var cartaoId = Number(cartaoIds[c]);
      var cartao = db.prepare('SELECT * FROM cartoes WHERE id = ?').get(cartaoId);
      if (!cartao) throw new Error('Cartão não encontrado.');

      var compAlvo = obterCompetenciaAlvoAntecipacao(db, cartaoId);
      
      var partes = compAlvo.split('-');
      var compAno = Number(partes[0]);
      var compMes = Number(partes[1]) - 1;
      var ultimoDia = new Date(compAno, compMes + 1, 0).getDate();
      var diaVencReal = cartao.dia_vencimento > ultimoDia ? ultimoDia : cartao.dia_vencimento;
      var dataVencimento = new Date(compAno, compMes, diaVencReal);
      var vencimentoAlvo = formatarDataIso(dataVencimento);

      garantirFatura(db, cartao, compAlvo);

      var compsOriginal = [];
      var parcelasDoCartao = parcelasPorCartao[cartaoId];

      for (var pIdx = 0; pIdx < parcelasDoCartao.length; pIdx++) {
        var parcela = parcelasDoCartao[pIdx];
        
        if (parcela.competencia <= compAlvo) {
          throw new Error('A parcela "' + parcela.descricao + '" já está na competência atual ou passada (' + parcela.competencia + ') e não pode ser antecipada.');
        }

        if (compsOriginal.indexOf(parcela.competencia) === -1) {
          compsOriginal.push(parcela.competencia);
        }

        db.prepare(
          "UPDATE parcelas_cartao SET competencia = ?, vencimento = ?, descricao = '[Antecipada] ' || descricao, atualizado_em = datetime('now', 'localtime') WHERE id = ?"
        ).run(compAlvo, vencimentoAlvo, parcela.id);
        
        resultado.atualizados++;
      }

      recalcularFaturaTotal(db, cartaoId, compAlvo);

      for (var o = 0; o < compsOriginal.length; o++) {
        var compOrig = compsOriginal[o];
        recalcularFaturaTotal(db, cartaoId, compOrig);

        var restante = db.prepare(
          "SELECT COUNT(*) as count FROM parcelas_cartao WHERE cartao_id = ? AND competencia = ? AND status != 'cancelada'"
        ).get(cartaoId, compOrig);

        if (restante.count === 0) {
          var faturaOrig = db.prepare(
            "SELECT * FROM faturas_cartao WHERE cartao_id = ? AND competencia = ? AND status != 'paga'"
          ).get(cartaoId, compOrig);
          if (faturaOrig) {
            db.prepare('DELETE FROM faturas_cartao WHERE id = ?').run(faturaOrig.id);
          }
        }
      }

      registrarAuditoria('CARTAO_PARCELAS_ANTECIPAR', 'Antecipadas ' + parcelasDoCartao.length + ' parcelas do cartao ' + cartao.nome + ' para a competencia ' + compAlvo);
    }
  });

  transaction();
  return resultado;
}
