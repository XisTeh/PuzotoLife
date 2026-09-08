/**
 * Serviço de Limpeza de Dados de Teste
 */

import fs from 'fs';
import path from 'path';
import { getDatabase, getDatabasePath, getLocalDatabase } from '../database/connection.js';
import { logEvent } from '../observability/logger.js';
import { garantirConfiguracoesPadrao } from './configuracoes.js';

function gerarNomeBackupAuto() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  return `puzoto_life_auto_before_clean_${ts}.db`;
}

async function criarBackupAntesLimpeza() {
  getLocalDatabase();
  const dbPath = getDatabasePath();
  if (!fs.existsSync(dbPath)) {
    throw new Error('Banco de dados não encontrado.');
  }

  const backupDir = path.join(process.cwd(), 'data', 'backups', 'database');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const nomeArquivo = gerarNomeBackupAuto();
  const destino = path.join(backupDir, nomeArquivo);

  await getDatabase().backup(destino);
  logEvent('info', 'cleanup_backup_created');
  return nomeArquivo;
}

async function garantirSeedsEssenciais(db) {
  // Garantir que as configurações padrão existam
  (await garantirConfiguracoesPadrao());

  // Garantir empresas básicas
  const empresas = ['Diagnóstico', 'Perfecta', 'E-Mail', 'Padrão', 'Dr. Ranon / RX'];
  const insertEmpresa = db.prepare('INSERT OR IGNORE INTO empresas (nome, tipo) VALUES (?, ?)');
  for (const emp of empresas) {
    const tipo = emp.includes('Ranon') ? 'ranon' : 'laudo';
    (await insertEmpresa.run(emp, tipo));
  }

  // Garantir categorias básicas - Gastos
  const catGastos = ['Alimentação', 'Mercado', 'Transporte', 'Casa', 'Saúde', 'Lazer', 'Trabalho', 'Assinaturas', 'Família', 'Educação', 'Outros'];
  const insertCategoriaGasto = db.prepare("INSERT OR IGNORE INTO categorias (nome, tipo, cor) VALUES (?, 'gasto', '#71717a')");
  for (const c of catGastos) {
    (await insertCategoriaGasto.run(c));
  }

  // Garantir categorias básicas - Receitas
  const catReceitas = ['Trabalho', 'Reembolso', 'Venda', 'Renda Extra', 'Salário', 'Presente', 'Devolução', 'Outros'];
  const insertCategoriaReceita = db.prepare("INSERT OR IGNORE INTO categorias (nome, tipo, cor) VALUES (?, 'receita', '#10b981')");
  for (const c of catReceitas) {
    (await insertCategoriaReceita.run(c));
  }
}

async function limparDadosOperacionais(db) {
  const tabelasParaLimpar = [
    'investimento_movimentos',
    'investimentos',
    'parcelas_cartao',
    'compras_cartao',
    'faturas_cartao',
    'cartoes',
    'gastos',
    'contas_pagar',
    'pessoas_dividas',
    'receitas',
    'lancamentos_trabalho',
    'lotes_trabalho_pendentes',
    'laudos_ranon_pendentes',
    'laudos_ranon',
    'laudos_ranon_historico',
    'ajustes_retroativos',
    'fechamentos_diarios',
    'fechamentos_mensais',
    'auditoria'
  ];

  let tabelasLimpas = 0;
  let registrosRemovidos = 0;

  for (const tabela of tabelasParaLimpar) {
    try {
      const exists = (await db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(tabela));
      if (exists) {
        const row = (await db.prepare(`SELECT COUNT(*) as count FROM ${tabela}`).get());
        if (row && row.count > 0) {
          (await db.prepare(`DELETE FROM ${tabela}`).run());
          registrosRemovidos += row.count;
          
          // Reset autoincrement if it exists
          try {
            (await db.prepare(`DELETE FROM sqlite_sequence WHERE name=?`).run(tabela));
          } catch (e) {
            // Ignora se não houver sqlite_sequence para essa tabela
          }
        }
        tabelasLimpas++;
      }
    } catch (err) {
      logEvent('warn', 'cleanup_table_error', { errorType: err?.constructor?.name || 'Error', errorCode: err?.code });
    }
  }

  return { tabelasLimpas, registrosRemovidos };
}

export async function executarLimpezaDadosTeste(confirmacao) {
  if (confirmacao !== 'LIMPAR TESTES') {
    throw new Error('Confirmação inválida. A limpeza foi cancelada.');
  }

  const backupNome = await criarBackupAntesLimpeza();
  const db = getDatabase();
  
  let resumo;
  
  // Executar limpeza em transação
  const executarTransacao = db.transaction(async () => {
    resumo = (await limparDadosOperacionais(db));
    (await garantirSeedsEssenciais(db));
    
    // Contabilizar o que sobrou
    const numEmpresas = (await db.prepare('SELECT COUNT(*) as c FROM empresas').get()).c;
    const numCategorias = (await db.prepare('SELECT COUNT(*) as c FROM categorias').get()).c;
    
    resumo.empresas_preservadas = numEmpresas;
    resumo.categorias_preservadas = numCategorias;
  });

  try {
    (await executarTransacao());
  } catch (err) {
    logEvent('error', 'cleanup_error', { errorType: err?.constructor?.name || 'Error', errorCode: err?.code });
    throw new Error(`Falha ao limpar dados: ${err.message}. A operação foi revertida.`);
  }

  return {
    success: true,
    message: 'Dados de teste limpos com sucesso.',
    backup_criado: backupNome,
    resumo: {
      tabelas_limpas: resumo.tabelasLimpas,
      registros_removidos: resumo.registrosRemovidos,
      empresas_preservadas: resumo.empresas_preservadas,
      categorias_preservadas: resumo.categorias_preservadas
    }
  };
}
