/**
 * Serviço de Configurações (chave/valor)
 */

import { getDatabase } from '../database/connection.js';

export function obterConfiguracao(chave) {
  const db = getDatabase();
  const row = db.prepare('SELECT valor FROM configuracoes WHERE chave = ?').get(chave);
  return row ? row.valor : null;
}

export function obterTodasConfiguracoes() {
  const db = getDatabase();
  const rows = db.prepare('SELECT * FROM configuracoes ORDER BY chave').all();
  
  // Transforma em objeto { chave: valor }
  const obj = {};
  for (const row of rows) {
    obj[row.chave] = row.valor;
  }
  return obj;
}

export function salvarConfiguracao(chave, valor) {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO configuracoes (chave, valor, atualizado_em)
    VALUES (@chave, @valor, datetime('now', 'localtime'))
    ON CONFLICT(chave) DO UPDATE SET
      valor = @valor,
      atualizado_em = datetime('now', 'localtime')
  `);
  return stmt.run({ chave, valor: String(valor) });
}

export function criarConfiguracoesIniciaisSeNaoExistirem() {
  // Já é feito no init.js, mas pode ser chamado explicitamente
  const db = getDatabase();
  const count = db.prepare('SELECT COUNT(*) as total FROM configuracoes').get();
  return { total: count.total };
}

export function garantirConfiguracoesPadrao() {
  const defaults = {
    preco_padrao_ranon: '2.00',
    chave_pix: 'ronnanpc@gmail.com',
    conta_padrao: 'Principal',
    forma_pagamento_padrao: 'Pix',
    status_padrao_gasto: 'pago',
    status_padrao_receita: 'recebido',
    dia_inicio_mes_financeiro: '1',
    mes_referencia_ranon_padrao: 'mes_anterior',

  };

  const cfgs = obterTodasConfiguracoes();
  for (const [chave, valor] of Object.entries(defaults)) {
    if (cfgs[chave] === undefined || cfgs[chave] === null || String(cfgs[chave]).trim() === '') {
      salvarConfiguracao(chave, valor);
    }
  }
}
