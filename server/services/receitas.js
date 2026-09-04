import { getDatabase } from '../database/connection.js';
import { registrarAuditoria } from './auditoria.js';

function dataIsoHoje() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function listarReceitas(filtros) {
  const db = getDatabase();
  let sql = 'SELECT * FROM receitas WHERE 1=1';
  const params = [];

  if (filtros) {
    if (filtros.mes) {
      sql += " AND data LIKE ?";
      params.push(filtros.mes + '-%');
    }
    if (filtros.categoria && filtros.categoria !== 'todas') {
      sql += " AND categoria_nome = ?";
      params.push(filtros.categoria);
    }
    if (filtros.status && filtros.status !== 'todos') {
      sql += " AND status = ?";
      params.push(filtros.status);
    }
    if (filtros.origem && filtros.origem !== 'todas') {
      sql += " AND origem = ?";
      params.push(filtros.origem);
    }
  }

  sql += ' ORDER BY data DESC';
  const stmt = db.prepare(sql);
  return stmt.all(...params);
}

export function criarReceita(dados) {
  const db = getDatabase();
  
  if (!dados.data || !dados.descricao || !dados.valor || !dados.origem || !dados.categoria_nome) {
    throw new Error('Campos obrigatórios faltando');
  }

  let status = dados.status || 'recebido';
  let recebidoEm = null;
  
  if (status === 'recebido') {
    recebidoEm = dataIsoHoje();
  }

  const stmt = db.prepare(`
    INSERT INTO receitas (data, descricao, valor, origem, categoria_nome, status, recebido_em, observacao)
    VALUES (@data, @descricao, @valor, @origem, @categoria_nome, @status, @recebido_em, @observacao)
  `);

  const info = stmt.run({
    data: dados.data,
    descricao: dados.descricao,
    valor: parseFloat(dados.valor),
    origem: dados.origem,
    categoria_nome: dados.categoria_nome,
    status: status,
    recebido_em: recebidoEm,
    observacao: dados.observacao || ''
  });

  registrarAuditoria('RECEITA_CRIADA', `Receita ${dados.descricao} de ${dados.valor} registrada`);
  return { sucesso: true, id: info.lastInsertRowid };
}

export function atualizarReceita(id, dados) {
  const db = getDatabase();
  const registro = db.prepare('SELECT id, status FROM receitas WHERE id = ?').get(id);
  
  if (!registro) throw new Error('Receita não encontrada');

  const stmt = db.prepare(`
    UPDATE receitas 
    SET data = @data, descricao = @descricao, valor = @valor, origem = @origem, 
        categoria_nome = @categoria_nome, status = @status, observacao = @observacao, atualizado_em = datetime('now', 'localtime')
    WHERE id = @id
  `);

  stmt.run({
    id: id,
    data: dados.data,
    descricao: dados.descricao,
    valor: parseFloat(dados.valor),
    origem: dados.origem,
    categoria_nome: dados.categoria_nome,
    status: dados.status || registro.status,
    observacao: dados.observacao || ''
  });

  registrarAuditoria('RECEITA_ATUALIZADA', `Receita ${id} atualizada`);
  return { sucesso: true };
}

export function marcarReceitaComoRecebida(id) {
  const db = getDatabase();
  const registro = db.prepare('SELECT id, status FROM receitas WHERE id = ?').get(id);
  
  if (!registro) throw new Error('Receita não encontrada');
  if (registro.status === 'recebido') throw new Error('Receita já está recebida');

  db.prepare(`
    UPDATE receitas 
    SET status = 'recebido', recebido_em = datetime('now', 'localtime'), atualizado_em = datetime('now', 'localtime')
    WHERE id = ?
  `).run(id);

  registrarAuditoria('RECEITA_RECEBIDA', `Receita ${id} marcada como recebida`);
  return { sucesso: true };
}

export function cancelarReceita(id) {
  const db = getDatabase();
  const registro = db.prepare('SELECT id, status FROM receitas WHERE id = ?').get(id);
  
  if (!registro) throw new Error('Receita não encontrada');
  if (registro.status === 'cancelado') throw new Error('Receita já está cancelada');

  db.prepare(`
    UPDATE receitas 
    SET status = 'cancelado', atualizado_em = datetime('now', 'localtime')
    WHERE id = ?
  `).run(id);

  registrarAuditoria('RECEITA_CANCELADA', `Receita ${id} cancelada`);
  return { sucesso: true };
}

export function removerReceita(id) {
  const db = getDatabase();
  db.prepare('DELETE FROM receitas WHERE id = ?').run(id);
  registrarAuditoria('RECEITA_EXCLUIDA', `Receita ${id} excluída fisicamente`);
  return { sucesso: true };
}

export function calcularResumoReceitas(mes) {
  const db = getDatabase();
  const mesParams = mes ? [mes + '-%'] : ['%'];
  
  const resumo = {
    totalRecebido: 0,
    totalPrevisto: 0,
    quantidadeEntradas: 0,
    maiorOrigem: { nome: '-', valor: 0 },
    mediaDiaria: 0,
    saldoEntradas: 0,
    origens: [] // para o grafico
  };

  const registros = db.prepare(`SELECT * FROM receitas WHERE data LIKE ? AND status != 'cancelado'`).all(mesParams[0]);
  
  let origensMap = {};

  registros.forEach(r => {
    resumo.quantidadeEntradas++;
    if (r.status === 'recebido') resumo.totalRecebido += r.valor;
    if (r.status === 'previsto') resumo.totalPrevisto += r.valor;
    
    if (!origensMap[r.origem]) origensMap[r.origem] = 0;
    origensMap[r.origem] += r.valor;
  });

  resumo.saldoEntradas = resumo.totalRecebido + resumo.totalPrevisto;

  for (let o in origensMap) {
    resumo.origens.push({ origem: o, valor: origensMap[o] });
    if (origensMap[o] > resumo.maiorOrigem.valor) {
      resumo.maiorOrigem = { nome: o, valor: origensMap[o] };
    }
  }

  // Média Diária (baseada no recebido)
  if (mes && resumo.totalRecebido > 0) {
    const hoje = new Date();
    const [ano, mesStr] = mes.split('-');
    
    let diasDivisao = 1;
    if (hoje.getFullYear() === parseInt(ano) && (hoje.getMonth() + 1) === parseInt(mesStr)) {
      diasDivisao = hoje.getDate();
    } else {
      diasDivisao = new Date(parseInt(ano), parseInt(mesStr), 0).getDate();
    }
    
    resumo.mediaDiaria = resumo.totalRecebido / diasDivisao;
  }

  return resumo;
}

export function listarOrigensReceitaUnicas() {
  const db = getDatabase();
  const rows = db.prepare("SELECT DISTINCT origem FROM receitas WHERE origem IS NOT NULL AND origem != '' ORDER BY origem ASC").all();
  return rows.map(r => r.origem);
}

export function verificarReceitaVinculada(tipo, id) {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT id, status FROM receitas 
    WHERE vinculado_trabalho = 1 AND referencia_trabalho_tipo = ? AND referencia_trabalho_id = ? AND status != 'cancelado'
  `);
  return stmt.get(tipo, id);
}

export function criarReceitaAutomaticaTrabalho(dados) {
  const db = getDatabase();
  
  const stmt = db.prepare(`
    INSERT INTO receitas (data, descricao, valor, origem, categoria_nome, status, recebido_em, vinculado_trabalho, referencia_trabalho_tipo, referencia_trabalho_id, observacao)
    VALUES (@data, @descricao, @valor, @origem, @categoria_nome, @status, @recebido_em, 1, @referencia_trabalho_tipo, @referencia_trabalho_id, @observacao)
  `);

  const info = stmt.run({
    data: dados.data,
    descricao: dados.descricao,
    valor: parseFloat(dados.valor),
    origem: 'Trabalho',
    categoria_nome: 'Trabalho',
    status: 'recebido',
    recebido_em: dataIsoHoje(),
    referencia_trabalho_tipo: dados.referencia_trabalho_tipo,
    referencia_trabalho_id: dados.referencia_trabalho_id,
    observacao: dados.observacao || ''
  });

  registrarAuditoria('RECEITA_AUTOMATICA_CRIADA', `Receita gerada a partir do Trabalho: ${dados.descricao}`);
  return { id: info.lastInsertRowid };
}
