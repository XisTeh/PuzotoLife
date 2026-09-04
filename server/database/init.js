/**
 * Inicialização do banco de dados.
 * Cria todas as tabelas e insere dados iniciais.
 * Seguro para rodar múltiplas vezes (IF NOT EXISTS).
 */

import { getDatabase } from './connection.js';

// ═══════════════════════════════════════
// SCHEMA — Criação de Tabelas
// ═══════════════════════════════════════

const SCHEMA = `

-- 1. Empresas
CREATE TABLE IF NOT EXISTS empresas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE,
  tipo TEXT,
  valor_padrao REAL DEFAULT 0,
  ativa INTEGER DEFAULT 1,
  cor TEXT,
  icone TEXT,
  observacao TEXT,
  criado_em TEXT DEFAULT (datetime('now', 'localtime')),
  atualizado_em TEXT DEFAULT (datetime('now', 'localtime'))
);

-- 2. Lote Temporário de Trabalho (pendente, antes de Fechar o Dia)
CREATE TABLE IF NOT EXISTS lotes_trabalho_pendentes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  empresa_nome TEXT NOT NULL,
  quantidade INTEGER NOT NULL,
  valor_unitario REAL NOT NULL,
  total REAL NOT NULL,
  data TEXT NOT NULL,
  horario TEXT,
  observacao TEXT,
  criado_em TEXT DEFAULT (datetime('now', 'localtime')),
  atualizado_em TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

-- 3. Lançamentos de Trabalho (histórico definitivo)
CREATE TABLE IF NOT EXISTS lancamentos_trabalho (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  empresa_nome TEXT NOT NULL,
  quantidade INTEGER NOT NULL,
  valor_unitario REAL NOT NULL,
  total REAL NOT NULL,
  data TEXT NOT NULL,
  horario TEXT,
  status TEXT NOT NULL DEFAULT 'produzido' CHECK(status IN ('produzido','fechado','recebido','cancelado')),
  recebido_em TEXT,
  observacao TEXT,
  origem_fechamento_dia_id INTEGER,
  criado_em TEXT DEFAULT (datetime('now', 'localtime')),
  atualizado_em TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (origem_fechamento_dia_id) REFERENCES fechamentos_diarios(id)
);

-- 4. Laudos Dr. Ranon Pendentes (lote temporário independente)
CREATE TABLE IF NOT EXISTS laudos_ranon_pendentes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  registro_paciente TEXT NOT NULL,
  quantidade INTEGER NOT NULL DEFAULT 1,
  valor_unitario REAL NOT NULL DEFAULT 2.00,
  total REAL NOT NULL,
  data TEXT NOT NULL,
  horario TEXT,
  observacao TEXT,
  criado_em TEXT DEFAULT (datetime('now', 'localtime')),
  atualizado_em TEXT DEFAULT (datetime('now', 'localtime'))
);

-- 5. Laudos Dr. Ranon (histórico definitivo)
CREATE TABLE IF NOT EXISTS laudos_ranon (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  registro_paciente TEXT NOT NULL,
  quantidade INTEGER NOT NULL DEFAULT 1,
  valor_unitario REAL NOT NULL,
  total REAL NOT NULL,
  data TEXT NOT NULL,
  horario TEXT,
  status TEXT NOT NULL DEFAULT 'produzido' CHECK(status IN ('produzido','fechado','recebido','cancelado')),
  recebido_em TEXT,
  arquivo_excel_backup TEXT,
  observacao TEXT,
  criado_em TEXT DEFAULT (datetime('now', 'localtime')),
  atualizado_em TEXT DEFAULT (datetime('now', 'localtime'))
);

-- 6. Fechamentos Diários
CREATE TABLE IF NOT EXISTS fechamentos_diarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  data TEXT NOT NULL,
  total_quantidade INTEGER NOT NULL DEFAULT 0,
  total_valor REAL NOT NULL DEFAULT 0,
  resumo_json TEXT,
  criado_em TEXT DEFAULT (datetime('now', 'localtime'))
);

-- 7. Fechamentos Mensais (snapshot vitalício)
CREATE TABLE IF NOT EXISTS fechamentos_mensais (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  referencia TEXT NOT NULL UNIQUE,
  qtd_diagnostico INTEGER DEFAULT 0,
  total_diagnostico REAL DEFAULT 0,
  qtd_perfecta INTEGER DEFAULT 0,
  total_perfecta REAL DEFAULT 0,
  qtd_email INTEGER DEFAULT 0,
  total_email REAL DEFAULT 0,
  qtd_padrao INTEGER DEFAULT 0,
  total_padrao REAL DEFAULT 0,
  qtd_ranon INTEGER DEFAULT 0,
  total_ranon REAL DEFAULT 0,
  qtd_global INTEGER DEFAULT 0,
  total_global REAL DEFAULT 0,
  fechado_em TEXT,
  snapshot_json TEXT,
  criado_em TEXT DEFAULT (datetime('now', 'localtime')),
  atualizado_em TEXT DEFAULT (datetime('now', 'localtime'))
);

-- 8. Ajustes Retroativos (inicialmente só para Padrão)
CREATE TABLE IF NOT EXISTS ajustes_retroativos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fechamento_mensal_id INTEGER NOT NULL,
  referencia TEXT NOT NULL,
  empresa TEXT NOT NULL DEFAULT 'Padrão',
  quantidade INTEGER NOT NULL,
  valor_unitario REAL NOT NULL,
  total REAL NOT NULL,
  observacao TEXT,
  criado_em TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (fechamento_mensal_id) REFERENCES fechamentos_mensais(id)
);

-- 9. Configurações (chave/valor)
CREATE TABLE IF NOT EXISTS configuracoes (
  chave TEXT PRIMARY KEY,
  valor TEXT,
  atualizado_em TEXT DEFAULT (datetime('now', 'localtime'))
);

-- 10. Auditoria
CREATE TABLE IF NOT EXISTS auditoria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL,
  descricao TEXT,
  dados_antes TEXT,
  dados_depois TEXT,
  criado_em TEXT DEFAULT (datetime('now', 'localtime'))
);

-- 11. Categorias Financeiras
CREATE TABLE IF NOT EXISTS categorias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE,
  tipo TEXT NOT NULL DEFAULT 'gasto',
  cor TEXT,
  icone TEXT,
  ativa INTEGER DEFAULT 1,
  criado_em TEXT DEFAULT (datetime('now', 'localtime')),
  atualizado_em TEXT DEFAULT (datetime('now', 'localtime'))
);

-- 12. Gastos (Finanças Pessoais)
CREATE TABLE IF NOT EXISTS gastos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  data TEXT NOT NULL,
  descricao TEXT NOT NULL,
  valor REAL NOT NULL,
  categoria_id INTEGER NOT NULL,
  categoria_nome TEXT NOT NULL,
  forma_pagamento TEXT NOT NULL,
  conta_carteira TEXT DEFAULT 'Principal',
  status TEXT NOT NULL DEFAULT 'pago' CHECK(status IN ('pago','pendente','cancelado')),
  observacao TEXT,
  criado_em TEXT DEFAULT (datetime('now', 'localtime')),
  atualizado_em TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (categoria_id) REFERENCES categorias(id)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_lancamentos_data ON lancamentos_trabalho(data);
CREATE INDEX IF NOT EXISTS idx_lancamentos_empresa ON lancamentos_trabalho(empresa_id);
CREATE INDEX IF NOT EXISTS idx_lancamentos_status ON lancamentos_trabalho(status);
CREATE INDEX IF NOT EXISTS idx_lotes_data ON lotes_trabalho_pendentes(data);
CREATE INDEX IF NOT EXISTS idx_ranon_data ON laudos_ranon(data);
CREATE INDEX IF NOT EXISTS idx_ranon_status ON laudos_ranon(status);
CREATE INDEX IF NOT EXISTS idx_ranon_pendentes_data ON laudos_ranon_pendentes(data);
CREATE INDEX IF NOT EXISTS idx_fechamentos_data ON fechamentos_diarios(data);
CREATE INDEX IF NOT EXISTS idx_fechamentos_mensais_ref ON fechamentos_mensais(referencia);
CREATE INDEX IF NOT EXISTS idx_auditoria_tipo ON auditoria(tipo);
CREATE INDEX IF NOT EXISTS idx_gastos_data ON gastos(data);
CREATE INDEX IF NOT EXISTS idx_gastos_status ON gastos(status);
CREATE INDEX IF NOT EXISTS idx_gastos_categoria ON gastos(categoria_id);

-- 13. Cartões de Crédito
CREATE TABLE IF NOT EXISTS cartoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  banco TEXT,
  limite REAL NOT NULL DEFAULT 0,
  dia_fechamento INTEGER NOT NULL,
  dia_vencimento INTEGER NOT NULL,
  cor TEXT,
  icone TEXT,
  ativo INTEGER DEFAULT 1,
  criado_em TEXT DEFAULT (datetime('now', 'localtime')),
  atualizado_em TEXT DEFAULT (datetime('now', 'localtime'))
);

-- 14. Compras no Cartão
CREATE TABLE IF NOT EXISTS compras_cartao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cartao_id INTEGER NOT NULL,
  cartao_nome TEXT NOT NULL,
  descricao TEXT NOT NULL,
  valor_total REAL NOT NULL,
  categoria_id INTEGER NOT NULL,
  categoria_nome TEXT NOT NULL,
  data_compra TEXT NOT NULL,
  quantidade_parcelas INTEGER NOT NULL DEFAULT 1,
  observacao TEXT,
  criado_em TEXT DEFAULT (datetime('now', 'localtime')),
  atualizado_em TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (cartao_id) REFERENCES cartoes(id),
  FOREIGN KEY (categoria_id) REFERENCES categorias(id)
);

-- 15. Parcelas de Cartão
CREATE TABLE IF NOT EXISTS parcelas_cartao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  compra_id INTEGER NOT NULL,
  cartao_id INTEGER NOT NULL,
  cartao_nome TEXT NOT NULL,
  numero_parcela INTEGER NOT NULL,
  total_parcelas INTEGER NOT NULL,
  valor_parcela REAL NOT NULL,
  competencia TEXT NOT NULL,  -- formato YYYY-MM ou MM/YYYY (usaremos MM/YYYY por padrão no front, mas no banco YYYY-MM é melhor pra ordenar)
  vencimento TEXT NOT NULL,   -- formato YYYY-MM-DD
  status TEXT NOT NULL DEFAULT 'aberta' CHECK(status IN ('aberta','fechada','paga','cancelada')),
  categoria_nome TEXT NOT NULL,
  descricao TEXT NOT NULL,
  criado_em TEXT DEFAULT (datetime('now', 'localtime')),
  atualizado_em TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (compra_id) REFERENCES compras_cartao(id),
  FOREIGN KEY (cartao_id) REFERENCES cartoes(id)
);

-- 16. Faturas de Cartão
CREATE TABLE IF NOT EXISTS faturas_cartao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cartao_id INTEGER NOT NULL,
  cartao_nome TEXT NOT NULL,
  competencia TEXT NOT NULL,
  vencimento TEXT NOT NULL,
  total REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'aberta' CHECK(status IN ('aberta','fechada','paga','cancelada')),
  pago_em TEXT,
  criado_em TEXT DEFAULT (datetime('now', 'localtime')),
  atualizado_em TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (cartao_id) REFERENCES cartoes(id)
);

-- Índices Cartões
CREATE INDEX IF NOT EXISTS idx_compras_cartao_cartao ON compras_cartao(cartao_id);
CREATE INDEX IF NOT EXISTS idx_parcelas_cartao_compra ON parcelas_cartao(compra_id);
CREATE INDEX IF NOT EXISTS idx_parcelas_cartao_cartao_comp ON parcelas_cartao(cartao_id, competencia);
CREATE INDEX IF NOT EXISTS idx_parcelas_cartao_status ON parcelas_cartao(status);
CREATE INDEX IF NOT EXISTS idx_faturas_cartao_cartao_comp ON faturas_cartao(cartao_id, competencia);
CREATE INDEX IF NOT EXISTS idx_faturas_cartao_status ON faturas_cartao(status);

-- 17. Contas a Pagar
CREATE TABLE IF NOT EXISTS contas_pagar (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  descricao TEXT,
  valor REAL NOT NULL,
  vencimento TEXT NOT NULL,
  categoria_id INTEGER NOT NULL,
  categoria_nome TEXT NOT NULL,
  forma_pagamento TEXT,
  recorrente INTEGER NOT NULL DEFAULT 0,
  frequencia TEXT DEFAULT 'nenhuma',
  parcela_atual INTEGER DEFAULT 1,
  total_parcelas INTEGER DEFAULT 1,
  grupo_recorrencia_id TEXT,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK(status IN ('pendente','pago','atrasado','cancelado')),
  pago_em TEXT,
  observacao TEXT,
  criado_em TEXT DEFAULT (datetime('now', 'localtime')),
  atualizado_em TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (categoria_id) REFERENCES categorias(id)
);

-- Índices Contas a Pagar
CREATE INDEX IF NOT EXISTS idx_contas_pagar_vencimento ON contas_pagar(vencimento);
CREATE INDEX IF NOT EXISTS idx_contas_pagar_status ON contas_pagar(status);
CREATE INDEX IF NOT EXISTS idx_contas_pagar_grupo ON contas_pagar(grupo_recorrencia_id);

-- 18. Pessoas e Dívidas
CREATE TABLE IF NOT EXISTS pessoas_dividas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome_pessoa TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK(tipo IN ('eu_devo', 'me_deve')),
  valor REAL NOT NULL,
  motivo TEXT NOT NULL,
  data_combinada TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK(status IN ('pendente', 'pago', 'recebido', 'cancelado')),
  pago_recebido_em TEXT,
  parcela_atual INTEGER DEFAULT 1,
  total_parcelas INTEGER DEFAULT 1,
  grupo_parcelas_id TEXT,
  observacao TEXT,
  criado_em TEXT DEFAULT (datetime('now', 'localtime')),
  atualizado_em TEXT DEFAULT (datetime('now', 'localtime'))
);

-- Índices Pessoas/Dívidas
CREATE INDEX IF NOT EXISTS idx_pessoas_dividas_nome ON pessoas_dividas(nome_pessoa);
CREATE INDEX IF NOT EXISTS idx_pessoas_dividas_tipo ON pessoas_dividas(tipo);
CREATE INDEX IF NOT EXISTS idx_pessoas_dividas_status ON pessoas_dividas(status);
CREATE INDEX IF NOT EXISTS idx_pessoas_dividas_data ON pessoas_dividas(data_combinada);

-- 18b. Dívidas Parceladas (Grupos)
CREATE TABLE IF NOT EXISTS dividas_parceladas_grupos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome_pessoa TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK(tipo IN ('eu_devo', 'me_deve')),
  motivo TEXT NOT NULL,
  valor_parcela REAL NOT NULL,
  valor_total_original REAL NOT NULL DEFAULT 0,
  total_parcelas INTEGER NOT NULL,
  parcelas_pagas INTEGER NOT NULL DEFAULT 0,
  parcelas_restantes INTEGER NOT NULL DEFAULT 0,
  dia_vencimento INTEGER NOT NULL DEFAULT 5,
  competencia_inicio TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ativa' CHECK(status IN ('ativa','encerrada','cancelada')),
  observacao TEXT,
  criado_em TEXT DEFAULT (datetime('now', 'localtime')),
  atualizado_em TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_dividas_parc_nome ON dividas_parceladas_grupos(nome_pessoa);
CREATE INDEX IF NOT EXISTS idx_dividas_parc_status ON dividas_parceladas_grupos(status);

-- 19. Receitas
CREATE TABLE IF NOT EXISTS receitas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  data TEXT NOT NULL,
  descricao TEXT NOT NULL,
  valor REAL NOT NULL,
  origem TEXT NOT NULL,
  categoria_id INTEGER,
  categoria_nome TEXT,
  status TEXT NOT NULL DEFAULT 'recebido' CHECK(status IN ('previsto', 'recebido', 'cancelado')),
  recebido_em TEXT,
  vinculado_trabalho BOOLEAN DEFAULT 0,
  referencia_trabalho_tipo TEXT,
  referencia_trabalho_id INTEGER,
  observacao TEXT,
  criado_em TEXT DEFAULT (datetime('now', 'localtime')),
  atualizado_em TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_receitas_data ON receitas(data);
CREATE INDEX IF NOT EXISTS idx_receitas_status ON receitas(status);
CREATE INDEX IF NOT EXISTS idx_receitas_origem ON receitas(origem);

-- 20. Pagadores (fontes reais de recebimento)
CREATE TABLE IF NOT EXISTS pagadores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE,
  tipo_pessoa TEXT DEFAULT 'Outro',
  documento TEXT,
  email TEXT,
  telefone TEXT,
  tipo_recebimento TEXT DEFAULT 'A definir',
  conta_destino TEXT DEFAULT 'A definir',
  observacao TEXT,
  ativo INTEGER DEFAULT 1,
  criado_em TEXT DEFAULT (datetime('now', 'localtime')),
  atualizado_em TEXT DEFAULT (datetime('now', 'localtime'))
);


`;

// ═══════════════════════════════════════
// SEED — Dados Iniciais
// ═══════════════════════════════════════

const INVESTIMENTOS_SCHEMA = `
CREATE TABLE IF NOT EXISTS investimentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  instituicao TEXT NOT NULL,
  conta_titular TEXT NOT NULL,
  ativo INTEGER NOT NULL DEFAULT 1 CHECK(ativo IN (0, 1)),
  criado_em TEXT DEFAULT (datetime('now', 'localtime')),
  atualizado_em TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS investimento_movimentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  investimento_id INTEGER NOT NULL,
  tipo TEXT NOT NULL CHECK(tipo IN ('aporte', 'resgate', 'rendimento', 'ajuste')),
  valor REAL NOT NULL CHECK(valor != 0),
  data TEXT NOT NULL,
  observacao TEXT,
  criado_em TEXT DEFAULT (datetime('now', 'localtime')),
  atualizado_em TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (investimento_id) REFERENCES investimentos(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_investimentos_ativo ON investimentos(ativo);
CREATE INDEX IF NOT EXISTS idx_invest_mov_investimento_data
  ON investimento_movimentos(investimento_id, data, id);
CREATE INDEX IF NOT EXISTS idx_invest_mov_data ON investimento_movimentos(data);
`;

export function initializeInvestimentosSchema(db = getDatabase()) {
  db.exec(INVESTIMENTOS_SCHEMA);
  return { success: true };
}

const EMPRESAS_INICIAIS = [
  { nome: 'Diagnóstico', tipo: 'clinica', valor_padrao: 0, cor: '#14b8a6', icone: 'scan-line' },
  { nome: 'Perfecta',    tipo: 'clinica', valor_padrao: 0, cor: '#3b82f6', icone: 'heart-pulse' },
  { nome: 'E-Mail',      tipo: 'remoto',  valor_padrao: 0, cor: '#8b5cf6', icone: 'mail' },
  { nome: 'Padrão',      tipo: 'padrao',  valor_padrao: 0, cor: '#f59e0b', icone: 'shield' },
  { nome: 'Dr. Ranon / RX', tipo: 'ranon', valor_padrao: 2.00, cor: '#06b6d4', icone: 'stethoscope' }
];

const CONFIGURACOES_INICIAIS = [
  { chave: 'chave_pix',                    valor: 'ronnanpc@gmail.com' },
  { chave: 'preco_padrao_ranon',            valor: '2.00' },
  { chave: 'ultima_empresa_selecionada',    valor: 'Diagnóstico' }
];

const CATEGORIAS_INICIAIS = [
  { nome: 'Alimentação', tipo: 'gasto', cor: '#ef4444', icone: 'pizza' },
  { nome: 'Mercado',     tipo: 'gasto', cor: '#f97316', icone: 'shopping-cart' },
  { nome: 'Transporte',  tipo: 'gasto', cor: '#eab308', icone: 'car' },
  { nome: 'Casa',        tipo: 'gasto', cor: '#22c55e', icone: 'home' },
  { nome: 'Saúde',       tipo: 'gasto', cor: '#14b8a6', icone: 'activity' },
  { nome: 'Lazer',       tipo: 'gasto', cor: '#0ea5e9', icone: 'ticket' },
  { nome: 'Trabalho',    tipo: 'ambos', cor: '#3b82f6', icone: 'briefcase' },
  { nome: 'Assinaturas', tipo: 'gasto', cor: '#8b5cf6', icone: 'credit-card' },
  { nome: 'Família',     tipo: 'gasto', cor: '#d946ef', icone: 'users' },
  { nome: 'Educação',    tipo: 'gasto', cor: '#f43f5e', icone: 'book-open' },
  { nome: 'Empréstimo',  tipo: 'ambos', cor: '#fb923c', icone: 'banknote' },
  { nome: 'Outros',      tipo: 'ambos', cor: '#64748b', icone: 'more-horizontal' },
  { nome: 'Reembolso',   tipo: 'receita', cor: '#10b981', icone: 'refresh-ccw' },
  { nome: 'Venda',       tipo: 'receita', cor: '#f59e0b', icone: 'tag' },
  { nome: 'Renda Extra', tipo: 'receita', cor: '#8b5cf6', icone: 'trending-up' },
  { nome: 'Salário',     tipo: 'receita', cor: '#2563eb', icone: 'wallet' },
  { nome: 'Presente',    tipo: 'receita', cor: '#ec4899', icone: 'gift' },
  { nome: 'Devolução',   tipo: 'receita', cor: '#6366f1', icone: 'corner-down-left' }
];

// ═══════════════════════════════════════
// INICIALIZADOR
// ═══════════════════════════════════════

export function initializeDatabase() {
  const db = getDatabase();

  // Executa o schema completo (IF NOT EXISTS garante idempotência)
  db.exec(SCHEMA);
  initializeInvestimentosSchema(db);

  // --- MIGRAÇÃO: Adiciona colunas novas se a tabela já existia antes da Etapa 14
  try { db.exec("ALTER TABLE pessoas_dividas ADD COLUMN parcela_atual INTEGER DEFAULT 1;"); } catch (e) { /* ignora se já existir */ }
  try { db.exec("ALTER TABLE pessoas_dividas ADD COLUMN total_parcelas INTEGER DEFAULT 1;"); } catch (e) { /* ignora se já existir */ }
  try { db.exec("ALTER TABLE pessoas_dividas ADD COLUMN grupo_parcelas_id TEXT;"); } catch (e) { /* ignora se já existir */ }

  // --- MIGRAÇÃO: Adiciona colunas da Etapa 16
  try { db.exec("ALTER TABLE laudos_ranon ADD COLUMN recebido_em TEXT;"); } catch (e) { /* ignora se já existir */ }

  // --- MIGRAÇÃO: Adiciona pagador_id em empresas
  try { db.exec("ALTER TABLE empresas ADD COLUMN pagador_id INTEGER REFERENCES pagadores(id);"); } catch (e) { /* ignora se já existir */ }

  // --- MIGRAÇÃO: Pagadores novos campos
  try { db.exec("ALTER TABLE pagadores RENAME COLUMN tipo TO tipo_pessoa;"); } catch (e) { /* ignora */ }
  try { db.exec("ALTER TABLE pagadores ADD COLUMN tipo_pessoa TEXT DEFAULT 'Outro';"); } catch (e) { /* ignora */ }
  try { db.exec("ALTER TABLE pagadores ADD COLUMN tipo_recebimento TEXT DEFAULT 'A definir';"); } catch (e) { /* ignora */ }
  try { db.exec("ALTER TABLE pagadores ADD COLUMN conta_destino TEXT DEFAULT 'A definir';"); } catch (e) { /* ignora */ }

  // --- MIGRAÇÃO: Faturas de cartão - campos de pagamento
  try { db.exec("ALTER TABLE faturas_cartao ADD COLUMN forma_pagamento TEXT DEFAULT '';"); } catch (e) { /* ignora */ }
  try { db.exec("ALTER TABLE faturas_cartao ADD COLUMN observacao_pagamento TEXT DEFAULT '';"); } catch (e) { /* ignora */ }


  // Insere empresas iniciais se não existirem
  const insertEmpresa = db.prepare(`
    INSERT OR IGNORE INTO empresas (nome, tipo, valor_padrao, cor, icone)
    VALUES (@nome, @tipo, @valor_padrao, @cor, @icone)
  `);

  const inserirEmpresas = db.transaction(() => {
    for (const emp of EMPRESAS_INICIAIS) {
      insertEmpresa.run(emp);
    }
  });
  inserirEmpresas();

  // Insere configurações iniciais se não existirem
  const insertConfig = db.prepare(`
    INSERT OR IGNORE INTO configuracoes (chave, valor)
    VALUES (@chave, @valor)
  `);

  const inserirConfigs = db.transaction(() => {
    for (const cfg of CONFIGURACOES_INICIAIS) {
      insertConfig.run(cfg);
    }
  });
  inserirConfigs();

  // Insere categorias iniciais se não existirem
  const insertCategoria = db.prepare(`
    INSERT OR IGNORE INTO categorias (nome, tipo, cor, icone)
    VALUES (@nome, @tipo, @cor, @icone)
  `);

  const inserirCategorias = db.transaction(() => {
    for (const cat of CATEGORIAS_INICIAIS) {
      insertCategoria.run(cat);
    }
  });
  inserirCategorias();

  // ═══════════════════════════════════════
  // SEED — Pagadores Iniciais
  // ═══════════════════════════════════════
  const PAGADORES_INICIAIS = [
    { 
      nome: 'Dr. Alexandre', 
      tipo_pessoa: 'PF', 
      tipo_recebimento: 'PF sem nota', 
      conta_destino: 'Conta PF', 
      observacao: 'Pagador responsável pelos recebimentos de Diagnóstico, Perfecta e E-Mail. Recebimento atual em Conta PF.'
    },
    { 
      nome: 'Dr. Ranon / RX', 
      tipo_pessoa: 'PJ', 
      tipo_recebimento: 'PJ com nota', 
      conta_destino: 'Conta PJ Puzoto', 
      observacao: 'Recebimento ideal em Conta PJ Puzoto.'
    },
    { 
      nome: 'Padrão', 
      tipo_pessoa: 'Outro', 
      tipo_recebimento: 'A definir', 
      conta_destino: 'A definir', 
      observacao: 'Pagador separado. Ajustar regra de recebimento conforme combinado.'
    }
  ];

  const insertPagador = db.prepare(`
    INSERT INTO pagadores (nome, tipo_pessoa, tipo_recebimento, conta_destino, observacao)
    VALUES (@nome, @tipo_pessoa, @tipo_recebimento, @conta_destino, @observacao)
    ON CONFLICT(nome) DO UPDATE SET 
      tipo_pessoa = @tipo_pessoa,
      tipo_recebimento = @tipo_recebimento,
      conta_destino = @conta_destino,
      observacao = CASE WHEN observacao IS NULL OR observacao = '' THEN @observacao ELSE observacao END
  `);
  const inserirPagadores = db.transaction(() => {
    for (const p of PAGADORES_INICIAIS) insertPagador.run(p);
  });
  inserirPagadores();

  // Vincular empresas a pagadores (apenas se pagador_id for NULL)
  const VINCULOS = [
    { empresa: 'Diagnóstico', pagador: 'Dr. Alexandre' },
    { empresa: 'Perfecta', pagador: 'Dr. Alexandre' },
    { empresa: 'E-Mail', pagador: 'Dr. Alexandre' },
    { empresa: 'Padrão', pagador: 'Padrão' },
    { empresa: 'Dr. Ranon / RX', pagador: 'Dr. Ranon / RX' }
  ];

  for (const v of VINCULOS) {
    const pagador = db.prepare('SELECT id FROM pagadores WHERE nome = ?').get(v.pagador);
    if (pagador) {
      db.prepare('UPDATE empresas SET pagador_id = ? WHERE nome = ? AND (pagador_id IS NULL OR pagador_id = 0)').run(pagador.id, v.empresa);
    }
  }



  // Log
  const empresaCount = db.prepare('SELECT COUNT(*) as total FROM empresas').get();
  const configCount = db.prepare('SELECT COUNT(*) as total FROM configuracoes').get();
  const categoriaCount = db.prepare('SELECT COUNT(*) as total FROM categorias').get();
  const pagadorCount = db.prepare('SELECT COUNT(*) as total FROM pagadores').get();

  console.log(`  ✓ Tabelas criadas com sucesso`);
  console.log(`  ✓ ${empresaCount.total} empresas registradas`);
  console.log(`  ✓ ${configCount.total} configurações registradas`);
  console.log(`  ✓ ${categoriaCount.total} categorias registradas`);
  console.log(`  ✓ ${pagadorCount.total} pagadores registrados`);

  return { 
    empresas: empresaCount.total, 
    configuracoes: configCount.total,
    categorias: categoriaCount.total,
    pagadores: pagadorCount.total
  };
}
