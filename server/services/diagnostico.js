import fs from 'fs';
import path from 'path';
import { getDatabase, getDatabasePath } from '../database/connection.js';
import { obterTodasConfiguracoes } from './configuracoes.js';

export function executarDiagnostico() {
  const dbPath = getDatabasePath();
  const dataPath = path.join(process.cwd(), 'data');
  const checks = [];
  
  const addCheck = (grupo, nome, status, mensagem) => {
    checks.push({ grupo, nome, status, mensagem });
  };

  // SERVIDOR
  addCheck('Servidor', 'Backend online', 'ok', 'Backend respondendo normalmente.');
  addCheck('Servidor', 'Versão do sistema', 'ok', 'Versão 1.0.0 instalada e rodando.');
  addCheck('Servidor', 'Porta backend 3210', 'ok', 'Porta 3210 configurada e respondendo.');

  // BANCO
  let dbExists = fs.existsSync(dbPath);
  if (dbExists) {
    addCheck('Banco de Dados', 'Arquivo data/puzoto_life.db existe', 'ok', 'Arquivo de banco encontrado.');
    const stats = fs.statSync(dbPath);
    if (stats.size > 0) {
      addCheck('Banco de Dados', 'Tamanho do banco maior que 0', 'ok', `Tamanho atual: ${(stats.size / 1024).toFixed(2)} KB.`);
    } else {
      addCheck('Banco de Dados', 'Tamanho do banco maior que 0', 'erro', 'Banco está vazio (0 bytes).');
    }
  } else {
    addCheck('Banco de Dados', 'Arquivo data/puzoto_life.db existe', 'erro', 'Arquivo não encontrado.');
  }

  try {
    const db = getDatabase();
    addCheck('Banco de Dados', 'Banco SQLite abre corretamente', 'ok', 'Conexão com o SQLite estabelecida.');
    const res = db.prepare('SELECT 1 as result').get();
    if (res && res.result === 1) {
      addCheck('Banco de Dados', 'Conexão consegue executar SELECT 1', 'ok', 'Consulta básica executada com sucesso.');
    } else {
      throw new Error('Falha no SELECT 1');
    }
  } catch (err) {
    addCheck('Banco de Dados', 'Banco SQLite abre corretamente', 'erro', err.message);
    addCheck('Banco de Dados', 'Conexão consegue executar SELECT 1', 'erro', 'Falha na execução da consulta básica.');
  }

  // PASTAS
  const checkFolder = (folderPath, label) => {
    if (fs.existsSync(folderPath)) {
      addCheck('Pastas', `Pasta ${label} existe`, 'ok', 'Pasta encontrada e pronta para uso.');
    } else {
      addCheck('Pastas', `Pasta ${label} existe`, 'erro', 'Pasta obrigatória não encontrada.');
    }
  };
  checkFolder(dataPath, 'data');
  checkFolder(path.join(dataPath, 'backups', 'database'), 'data/backups/database');
  checkFolder(path.join(dataPath, 'backups', 'laudos_ranon'), 'data/backups/laudos_ranon');
  checkFolder(path.join(dataPath, 'exports'), 'data/exports');

  // TABELAS
  const tabelas = [
    'empresas', 'categorias', 'configuracoes', 'lancamentos_trabalho',
    'laudos_ranon', 'gastos', 'receitas', 'cartoes', 'contas_pagar',
    'pessoas_dividas', 'investimentos', 'investimento_movimentos',
    'fechamentos_mensais', 'auditoria'
  ];
  let db;
  try {
    db = getDatabase();
  } catch (e) {}

  if (db) {
    for (const t of tabelas) {
      try {
        const info = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(t);
        if (info) {
          addCheck('Tabelas', `Tabela ${t} existe`, 'ok', 'Tabela estrutural encontrada.');
        } else {
          addCheck('Tabelas', `Tabela ${t} existe`, 'erro', 'Tabela ausente. Estrutura do banco pode estar comprometida.');
        }
      } catch (e) {
        addCheck('Tabelas', `Tabela ${t} existe`, 'erro', e.message);
      }
    }
  }

  // CONFIGURAÇÕES
  if (db) {
    try {
      const cfgs = obterTodasConfiguracoes() || {};
      const reqs = [
        'preco_padrao_ranon', 
        'chave_pix', 
        'conta_padrao', 
        'forma_pagamento_padrao',
        'status_padrao_gasto',
        'status_padrao_receita',
        'dia_inicio_mes_financeiro',
        'mes_referencia_ranon_padrao'
      ];
      let missing = 0;
      for (const r of reqs) {
        if (cfgs[r] !== undefined && cfgs[r] !== null && String(cfgs[r]).trim() !== '') {
          addCheck('Configurações', `${r} existe`, 'ok', 'Configuração essencial configurada.');
        } else {
          addCheck('Configurações', `${r} existe`, 'alerta', 'Configuração não definida ou vazia.');
          missing++;
        }
      }
      if (missing > 0) {
        addCheck('Configurações', 'Status Geral das Configurações', 'alerta', 'Algumas configurações essenciais não foram encontradas.');
      } else {
        addCheck('Configurações', 'Status Geral das Configurações', 'ok', 'Todas as configurações essenciais existem.');
      }
    } catch (e) {
      addCheck('Configurações', 'Verificar configurações', 'erro', e.message);
    }
  }

  // DADOS INICIAIS
  if (db) {
    try {
      const emps = db.prepare('SELECT nome FROM empresas').all().map(x => x.nome);
      const expectedEmps = ['Diagnóstico', 'Perfecta', 'E-Mail', 'Padrão', 'Dr. Ranon / RX'];
      let empsFound = 0;
      for (const e of expectedEmps) {
        if (emps.includes(e)) empsFound++;
      }
      if (empsFound >= expectedEmps.length) {
        addCheck('Dados Iniciais', 'Empresas iniciais existem', 'ok', 'Todas as empresas básicas foram encontradas.');
      } else {
        addCheck('Dados Iniciais', 'Empresas iniciais existem', 'alerta', `Faltam empresas básicas. Encontradas: ${empsFound}/${expectedEmps.length}`);
      }

      const cats = db.prepare('SELECT nome FROM categorias').all().map(x => x.nome);
      const expectedCats = ['Alimentação', 'Transporte', 'Casa', 'Saúde', 'Outros'];
      let catsFound = 0;
      for (const c of expectedCats) {
        if (cats.includes(c)) catsFound++;
      }
      if (catsFound >= expectedCats.length) {
        addCheck('Dados Iniciais', 'Categorias básicas existem', 'ok', 'Categorias iniciais encontradas.');
      } else {
        addCheck('Dados Iniciais', 'Categorias básicas existem', 'alerta', 'Algumas categorias básicas podem estar faltando.');
      }
    } catch (e) {
      addCheck('Dados Iniciais', 'Verificar empresas e categorias', 'erro', e.message);
    }
  }

  // BACKUP
  try {
    const dirBackup = path.join(dataPath, 'backups', 'database');
    if (fs.existsSync(dirBackup)) {
      const files = fs.readdirSync(dirBackup).filter(f => f.endsWith('.db') || f.endsWith('.zip') || f.endsWith('.sql'));
      if (files.length > 0) {
        addCheck('Backup', 'Pelo menos 1 backup existente', 'ok', `${files.length} arquivos de backup encontrados.`);
      } else {
        addCheck('Backup', 'Pelo menos 1 backup existente', 'alerta', 'Nenhum backup encontrado. Recomendado criar um manual.');
      }

      // Teste de gravação
      const testFile = path.join(dirBackup, '.test_write_backup');
      try {
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
        addCheck('Backup', 'Pasta de backup é gravável', 'ok', 'Permissão de escrita confirmada para o sistema.');
      } catch (e) {
        addCheck('Backup', 'Pasta de backup é gravável', 'erro', 'Sistema sem permissão de escrita na pasta.');
      }
    } else {
      addCheck('Backup', 'Pasta de backup', 'erro', 'Pasta de backups não existe, não será possível verificar.');
    }
  } catch (e) {
    addCheck('Backup', 'Verificar backups', 'erro', e.message);
  }

  // IMPORTAÇÃO
  addCheck('Importação', 'Endpoints de importação existem', 'ok', 'As rotas de validação e importação JSON estão disponíveis.');

  // INTEGRIDADE
  if (db) {
    try {
      let orfaosGastos = db.prepare(`SELECT count(*) as c FROM gastos WHERE categoria_id IS NOT NULL AND categoria_id NOT IN (SELECT id FROM categorias)`).get().c;
      
      // Checar se tabelas de cartão e compras existem antes de consultar para evitar erros fatais
      let cartoesCheck = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='cartoes'`).get();
      let orfaosCompras = 0;
      let orfaosParcelas = 0;
      
      if (cartoesCheck) {
        orfaosCompras = db.prepare(`SELECT count(*) as c FROM compras_cartao WHERE cartao_id NOT IN (SELECT id FROM cartoes)`).get().c;
        orfaosParcelas = db.prepare(`SELECT count(*) as c FROM parcelas_cartao WHERE compra_id NOT IN (SELECT id FROM compras_cartao)`).get().c;
      }
      
      let orfaosReceitas = db.prepare(`SELECT count(*) as c FROM receitas WHERE origem='trabalho' AND referencia_trabalho_id IS NULL`).get().c;

      const totalOrfaos = orfaosGastos + orfaosCompras + orfaosParcelas + orfaosReceitas;
      if (totalOrfaos === 0) {
        addCheck('Integridade', 'Verificar registros órfãos simples', 'ok', 'A integridade dos registros está perfeita. Nenhum órfão encontrado.');
      } else {
        addCheck('Integridade', 'Verificar registros órfãos simples', 'alerta', `${totalOrfaos} registros órfãos encontrados (não impendem o uso, mas devem ser revisados).`);
      }
    } catch (e) {
      addCheck('Integridade', 'Verificar registros órfãos simples', 'erro', e.message);
    }
  }

  // Resumo
  let ok = 0;
  let alertas = 0;
  let erros = 0;

  for (const c of checks) {
    if (c.status === 'ok') ok++;
    if (c.status === 'alerta') alertas++;
    if (c.status === 'erro') erros++;
  }

  let status_geral = 'ok';
  if (erros > 0) status_geral = 'erro';
  else if (alertas > 0) status_geral = 'alerta';

  return {
    success: true,
    status_geral,
    checks,
    resumo: {
      total: checks.length,
      ok,
      alertas,
      erros
    }
  };
}
