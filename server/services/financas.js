import { getDatabase } from '../database/connection.js';
import { registrarAuditoria } from './auditoria.js';

// ═══════════════════════════════════════
// CATEGORIAS
// ═══════════════════════════════════════

export function listarCategorias(filtros = {}) {
  const db = getDatabase();
  let query = "SELECT * FROM categorias WHERE 1=1";
  const params = {};

  if (!filtros.todas) {
    query += " AND ativa = 1";
  }

  if (filtros.tipo) {
    query += " AND tipo = @tipo";
    params.tipo = filtros.tipo;
  }

  query += " ORDER BY nome ASC";
  return db.prepare(query).all(params);
}

export function criarCategoria(dados) {
  const db = getDatabase();
  const insert = db.prepare(`
    INSERT INTO categorias (nome, tipo, cor, icone)
    VALUES (@nome, @tipo, @cor, @icone)
  `);

  const result = insert.run(dados);
  registrarAuditoria('CATEGORIA_CRIADA', `Categoria "${dados.nome}" criada.`, null, { ...dados, id: result.lastInsertRowid });
  return result.lastInsertRowid;
}

export function atualizarCategoria(id, dados) {
  const db = getDatabase();
  const categoriaAntiga = db.prepare('SELECT * FROM categorias WHERE id = ?').get(id);
  if (!categoriaAntiga) throw new Error('Categoria não encontrada');

  const update = db.prepare(`
    UPDATE categorias 
    SET nome = COALESCE(@nome, nome),
        tipo = COALESCE(@tipo, tipo),
        cor = COALESCE(@cor, cor),
        icone = COALESCE(@icone, icone),
        atualizado_em = datetime('now', 'localtime')
    WHERE id = @id
  `);

  const params = { id, ...dados };
  update.run(params);

  const categoriaAtualizada = db.prepare('SELECT * FROM categorias WHERE id = ?').get(id);
  registrarAuditoria('CATEGORIA_ATUALIZADA', `Categoria "${categoriaAntiga.nome}" atualizada.`, categoriaAntiga, categoriaAtualizada);
  
  // Atualiza nome da categoria nos gastos vinculados
  if (dados.nome && dados.nome !== categoriaAntiga.nome) {
    db.prepare('UPDATE gastos SET categoria_nome = @nome WHERE categoria_id = @id').run({ nome: dados.nome, id });
  }

  return categoriaAtualizada;
}

export function desativarCategoria(id) {
  const db = getDatabase();
  const categoria = db.prepare('SELECT * FROM categorias WHERE id = ?').get(id);
  if (!categoria) throw new Error('Categoria não encontrada');

  db.prepare('UPDATE categorias SET ativa = 0, atualizado_em = datetime("now", "localtime") WHERE id = ?').run(id);
  registrarAuditoria('CATEGORIA_DESATIVADA', `Categoria "${categoria.nome}" desativada.`, categoria, { ...categoria, ativa: 0 });
}

export function ativarCategoria(id) {
  const db = getDatabase();
  const categoria = db.prepare('SELECT * FROM categorias WHERE id = ?').get(id);
  if (!categoria) throw new Error('Categoria não encontrada');

  db.prepare('UPDATE categorias SET ativa = 1, atualizado_em = datetime("now", "localtime") WHERE id = ?').run(id);
  registrarAuditoria('CATEGORIA_ATIVADA', `Categoria "${categoria.nome}" ativada.`, categoria, { ...categoria, ativa: 1 });
}

// ═══════════════════════════════════════
// GASTOS
// ═══════════════════════════════════════

export function listarGastos(filtros = {}) {
  const db = getDatabase();
  let query = "SELECT * FROM gastos WHERE 1=1";
  const params = {};

  if (filtros.mes) {
    query += " AND data LIKE @mes";
    params.mes = `${filtros.mes}%`;
  }
  
  if (filtros.categoria && filtros.categoria !== 'todas') {
    query += " AND categoria_id = @categoria";
    params.categoria = filtros.categoria;
  }
  
  if (filtros.status && filtros.status !== 'todos') {
    if (filtros.status === 'nao_cancelado') {
      query += " AND status != 'cancelado'";
    } else {
      query += " AND status = @status";
      params.status = filtros.status;
    }
  }

  if (filtros.forma_pagamento && filtros.forma_pagamento !== 'todas') {
    query += " AND forma_pagamento = @forma_pagamento";
    params.forma_pagamento = filtros.forma_pagamento;
  }

  query += " ORDER BY data DESC, id DESC";
  return db.prepare(query).all(params);
}

export function criarGasto(dados) {
  const db = getDatabase();
  
  const insert = db.prepare(`
    INSERT INTO gastos (data, descricao, valor, categoria_id, categoria_nome, forma_pagamento, conta_carteira, status, observacao)
    VALUES (@data, @descricao, @valor, @categoria_id, @categoria_nome, @forma_pagamento, @conta_carteira, @status, @observacao)
  `);

  const result = insert.run({
    data: dados.data,
    descricao: dados.descricao,
    valor: dados.valor,
    categoria_id: dados.categoria_id,
    categoria_nome: dados.categoria_nome,
    forma_pagamento: dados.forma_pagamento,
    conta_carteira: dados.conta_carteira || 'Principal',
    status: dados.status || 'pago',
    observacao: dados.observacao || null
  });

  const gastoCriado = db.prepare('SELECT * FROM gastos WHERE id = ?').get(result.lastInsertRowid);
  registrarAuditoria('GASTO_CRIADO', `Gasto "${dados.descricao}" criado.`, null, gastoCriado);
  
  return gastoCriado;
}

export function atualizarGasto(id, dados) {
  const db = getDatabase();
  const gastoAntigo = db.prepare('SELECT * FROM gastos WHERE id = ?').get(id);
  if (!gastoAntigo) throw new Error('Gasto não encontrado');

  const update = db.prepare(`
    UPDATE gastos 
    SET data = COALESCE(@data, data),
        descricao = COALESCE(@descricao, descricao),
        valor = COALESCE(@valor, valor),
        categoria_id = COALESCE(@categoria_id, categoria_id),
        categoria_nome = COALESCE(@categoria_nome, categoria_nome),
        forma_pagamento = COALESCE(@forma_pagamento, forma_pagamento),
        conta_carteira = COALESCE(@conta_carteira, conta_carteira),
        status = COALESCE(@status, status),
        observacao = COALESCE(@observacao, observacao),
        atualizado_em = datetime('now', 'localtime')
    WHERE id = @id
  `);

  const params = {
    id: Number(id),
    data: dados.data !== undefined ? dados.data : null,
    descricao: dados.descricao !== undefined ? dados.descricao : null,
    valor: dados.valor !== undefined ? dados.valor : null,
    categoria_id: dados.categoria_id !== undefined ? dados.categoria_id : null,
    categoria_nome: dados.categoria_nome !== undefined ? dados.categoria_nome : null,
    forma_pagamento: dados.forma_pagamento !== undefined ? dados.forma_pagamento : null,
    conta_carteira: dados.conta_carteira !== undefined ? dados.conta_carteira : null,
    status: dados.status !== undefined ? dados.status : null,
    observacao: dados.observacao !== undefined ? dados.observacao : null
  };

  update.run(params);

  const gastoAtualizado = db.prepare('SELECT * FROM gastos WHERE id = ?').get(id);
  registrarAuditoria('GASTO_ATUALIZADO', `Gasto "${gastoAntigo.descricao}" atualizado.`, gastoAntigo, gastoAtualizado);
  
  return gastoAtualizado;
}

export function removerGasto(id) {
  const db = getDatabase();
  const gasto = db.prepare('SELECT * FROM gastos WHERE id = ?').get(id);
  if (!gasto) throw new Error('Gasto não encontrado');

  db.prepare('DELETE FROM gastos WHERE id = ?').run(id);
  registrarAuditoria('GASTO_EXCLUIDO', `Gasto "${gasto.descricao}" excluído.`, gasto, null);
}

export function calcularResumoGastos(filtros = {}) {
  const db = getDatabase();
  let queryBase = "SELECT * FROM gastos WHERE 1=1";
  const params = {};

  if (filtros.mes) {
    queryBase += " AND data LIKE @mes";
    params.mes = `${filtros.mes}%`;
  }

  const gastos = db.prepare(queryBase).all(params);

  let totalPago = 0;
  let totalPendente = 0;
  let qtdLancamentos = 0;
  const porCategoria = {};

  gastos.forEach(g => {
    if (g.status === 'cancelado') return; // Ignora cancelados
    
    qtdLancamentos++;

    if (g.status === 'pago') {
      totalPago += g.valor;
      
      // Soma para o agrupamento por categoria (somente pagos ou todos nao cancelados? O comum é sumarizar o que de fato gastou)
      if (!porCategoria[g.categoria_nome]) porCategoria[g.categoria_nome] = 0;
      porCategoria[g.categoria_nome] += g.valor;
    } else if (g.status === 'pendente') {
      totalPendente += g.valor;
    }
  });

  let maiorCategoria = { nome: '-', valor: 0 };
  const arrCategorias = Object.keys(porCategoria).map(k => ({ nome: k, valor: porCategoria[k] }));
  if (arrCategorias.length > 0) {
    arrCategorias.sort((a, b) => b.valor - a.valor);
    maiorCategoria = arrCategorias[0];
  }

  // Calculo de Média por Dia
  let mediaPorDia = 0;
  if (filtros.mes && totalPago > 0) {
    const hoje = new Date();
    const isMesAtual = (hoje.getFullYear() + '-' + String(hoje.getMonth() + 1).padStart(2, '0')) === filtros.mes;
    
    let diasDivisor = 1;
    if (isMesAtual) {
      diasDivisor = hoje.getDate();
    } else {
      const [ano, mes] = filtros.mes.split('-');
      diasDivisor = new Date(ano, mes, 0).getDate(); // ultimo dia do mes
    }
    mediaPorDia = totalPago / diasDivisor;
  }

  return {
    totalPago,
    totalPendente,
    qtdLancamentos,
    maiorCategoria,
    mediaPorDia,
    gastosPorCategoria: arrCategorias
  };
}
