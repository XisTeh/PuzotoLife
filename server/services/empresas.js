import { snapshot, atomic } from '../database/connection.js';
/**
 * Serviço de Empresas
 */

import { getDatabase } from '../database/connection.js';

export async function listarEmpresas() {
  return snapshot(async () => {
  const db = getDatabase();
  return (await db.prepare('SELECT * FROM empresas WHERE ativa = 1 ORDER BY id').all());
  });
}

export async function listarTodasEmpresas() {
  return snapshot(async () => {
  const db = getDatabase();
  return (await db.prepare('SELECT * FROM empresas ORDER BY id').all());
  });
}

export async function obterEmpresaPorId(id) {
  return snapshot(async () => {
  const db = getDatabase();
  return (await db.prepare('SELECT * FROM empresas WHERE id = ?').get(id));
  });
}

export async function obterEmpresaPorNome(nome) {
  return snapshot(async () => {
  const db = getDatabase();
  return (await db.prepare('SELECT * FROM empresas WHERE nome = ?').get(nome));
  });
}

export async function criarEmpresasIniciaisSeNaoExistirem() {
  return snapshot(async () => {
  // Já é feito no init.js, mas pode ser chamado explicitamente
  const db = getDatabase();
  const count = (await db.prepare('SELECT COUNT(*) as total FROM empresas').get());
  return { total: count.total, mensagem: `${count.total} empresas no sistema.` };
  });
}

export async function atualizarEmpresa(id, dados) {
  return atomic(async () => {
  const db = getDatabase();
  const { nome, tipo, valor_padrao, ativa, cor, icone, observacao, pagador_id } = dados;
  
  const stmt = db.prepare(`
    UPDATE empresas 
    SET nome = COALESCE(@nome, nome),
        tipo = COALESCE(@tipo, tipo),
        valor_padrao = COALESCE(@valor_padrao, valor_padrao),
        ativa = COALESCE(@ativa, ativa),
        cor = COALESCE(@cor, cor),
        icone = COALESCE(@icone, icone),
        observacao = COALESCE(@observacao, observacao),
        pagador_id = @pagador_id,
        atualizado_em = datetime('now', 'localtime')
    WHERE id = @id
  `);

  const params = { id, nome, tipo, valor_padrao, ativa, cor, icone, observacao, pagador_id: pagador_id || null };
  // SQLite better-sqlite3 não aceita undefined nem booleans. 
  Object.keys(params).forEach(k => {
    if (params[k] === undefined) params[k] = null;
    if (typeof params[k] === 'boolean') params[k] = params[k] ? 1 : 0;
  });

  return (await stmt.run(params));
  });
}

export async function criarEmpresa(dados) {
  return atomic(async () => {
  const db = getDatabase();
  const { nome, tipo, valor_padrao, cor, icone, observacao, pagador_id } = dados;

  const stmt = db.prepare(`
    INSERT INTO empresas (nome, tipo, valor_padrao, cor, icone, observacao, pagador_id)
    VALUES (@nome, @tipo, @valor_padrao, @cor, @icone, @observacao, @pagador_id)
  `);

  const params = { nome, tipo, valor_padrao, cor, icone, observacao, pagador_id: pagador_id || null };
  Object.keys(params).forEach(k => {
    if (params[k] === undefined) params[k] = null;
    if (typeof params[k] === 'boolean') params[k] = params[k] ? 1 : 0;
  });

  const result = (await stmt.run(params));
  return result.lastInsertRowid;
  });
}

export async function desativarEmpresa(id) {
  return atomic(async () => {
  const db = getDatabase();
  return (await db.prepare('UPDATE empresas SET ativa = 0, atualizado_em = datetime("now", "localtime") WHERE id = ?').run(id));
  });
}

export async function ativarEmpresa(id) {
  return atomic(async () => {
  const db = getDatabase();
  return (await db.prepare('UPDATE empresas SET ativa = 1, atualizado_em = datetime("now", "localtime") WHERE id = ?').run(id));
  });
}
