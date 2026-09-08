/**
 * Serviço de Backup
 * Gerencia backup, restauração e exportação de dados.
 */

import fs from 'fs';
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDatabase, getDatabasePath, getLocalDatabase, reopenLocalDatabase, snapshot } from '../database/connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BACKUP_DIR = path.join(path.dirname(getDatabasePath()), 'backups', 'database');

// Garante que o diretório de backups exista
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// ═══════════════════════════════════════
// SEGURANÇA — Anti Path Traversal
// ═══════════════════════════════════════

function validarNomeArquivo(filename) {
  if (!filename || typeof filename !== 'string') {
    throw new Error('Nome de arquivo inválido.');
  }
  // Bloquear path traversal
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    throw new Error('Nome de arquivo contém caracteres proibidos.');
  }
  // Bloquear caminhos absolutos
  if (path.isAbsolute(filename)) {
    throw new Error('Caminhos absolutos não são permitidos.');
  }
  // Validar extensão
  if (!filename.endsWith('.db')) {
    throw new Error('Apenas arquivos .db são permitidos.');
  }
  // Verificar se o arquivo resolvido está dentro da pasta de backup
  const resolved = path.resolve(BACKUP_DIR, filename);
  if (!resolved.startsWith(path.resolve(BACKUP_DIR))) {
    throw new Error('Acesso negado: arquivo fora da pasta de backup.');
  }
  return resolved;
}

function formatarTamanho(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function gerarNomeBackup() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  return `puzoto_life_backup_${ts}_${randomUUID()}.db`;
}

// ═══════════════════════════════════════
// INFORMAÇÕES DO BANCO
// ═══════════════════════════════════════

export function obterInfoBanco() {
  if (getDatabase().dialect === 'postgres') return { provider: 'postgres', caminho: 'Supabase PostgreSQL', tamanho: null, tamanhoFormatado: 'Gerenciado no Supabase', ultimaModificacao: null, ultimoBackup: null, totalBackups: 0, status: 'Verifique backups no painel Supabase' };
  const dbPath = getDatabasePath();
  const stats = fs.statSync(dbPath);
  const backups = listarBackups();

  const ultimoBackup = backups.length > 0 ? backups[0] : null;

  return {
    caminho: dbPath,
    tamanho: stats.size,
    tamanhoFormatado: formatarTamanho(stats.size),
    ultimaModificacao: stats.mtime.toISOString(),
    ultimoBackup: ultimoBackup ? ultimoBackup.criadoEm : null,
    totalBackups: backups.length,
    status: backups.length > 0 ? 'Protegido' : 'Sem backup ainda'
  };
}

// ═══════════════════════════════════════
// CRIAR BACKUP
// ═══════════════════════════════════════

export async function criarBackupManual() {
  getLocalDatabase();
  const dbPath = getDatabasePath();

  if (!fs.existsSync(dbPath)) {
    throw new Error('Banco de dados não encontrado.');
  }

  // Usar backup API do better-sqlite3 para cópia segura (WAL-safe)
  const db = getDatabase();
  const nomeArquivo = gerarNomeBackup();
  const destino = path.join(BACKUP_DIR, nomeArquivo);

  await db.backup(destino);

  const stats = fs.statSync(destino);

  return {
    nomeArquivo,
    caminho: destino,
    tamanho: stats.size,
    tamanhoFormatado: formatarTamanho(stats.size),
    criadoEm: stats.birthtime.toISOString()
  };
}

// ═══════════════════════════════════════
// LISTAR BACKUPS
// ═══════════════════════════════════════

export function listarBackups() {
  if (getDatabase().dialect === 'postgres') return [];
  getLocalDatabase();
  if (!fs.existsSync(BACKUP_DIR)) {
    return [];
  }

  const arquivos = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.db'))
    .map(f => {
      const filePath = path.join(BACKUP_DIR, f);
      const stats = fs.statSync(filePath);
      return {
        nomeArquivo: f,
        tipo: (f.includes('auto_before_restore') || f.includes('auto_before_import')) ? 'auto' : 'manual',
        tamanho: stats.size,
        tamanhoFormatado: formatarTamanho(stats.size),
        criadoEm: stats.birthtime.toISOString(),
        modificadoEm: stats.mtime.toISOString()
      };
    })
    .sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm)); // Mais recente primeiro

  return arquivos;
}

// ═══════════════════════════════════════
// OBTER CAMINHO DE BACKUP PARA DOWNLOAD
// ═══════════════════════════════════════

export function obterCaminhoBackup(filename) {
  getLocalDatabase();
  const filePath = validarNomeArquivo(filename);

  if (!fs.existsSync(filePath)) {
    throw new Error('Arquivo de backup não encontrado.');
  }

  return filePath;
}

// ═══════════════════════════════════════
// RESTAURAR BACKUP
// ═══════════════════════════════════════

export async function restaurarBackup(filename, confirmacao) {
  getLocalDatabase();
  return getDatabase().exclusive(async () => {
  if (confirmacao !== 'RESTAURAR') {
    throw new Error('Confirmação inválida. Digite exatamente: RESTAURAR');
  }

  const backupPath = validarNomeArquivo(filename);

  if (!fs.existsSync(backupPath)) {
    throw new Error('Arquivo de backup não encontrado.');
  }

  const dbPath = getDatabasePath();

  // 1. Criar backup de segurança automático do banco atual
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const nomeSeguranca = `puzoto_life_auto_before_restore_${ts}.db`;
  const caminhoSeguranca = path.join(BACKUP_DIR, nomeSeguranca);
  const candidate = new Database(backupPath, { readonly: true });
  try {
    if (candidate.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('Backup inválido.');
    const required = ['empresas', 'configuracoes', 'gastos', 'investimentos'];
    const tables = (await candidate.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()).map(row => row.name);
    if (!required.every(name => tables.includes(name))) throw new Error('Backup incompatível com esta versão.');
  } finally { candidate.close(); }
  const checkpoint = getLocalDatabase().pragma('wal_checkpoint(TRUNCATE)')[0];
  if (checkpoint.busy) throw new Error('Banco ocupado. Feche outros processos antes de restaurar.');
  fs.copyFileSync(dbPath, caminhoSeguranca);
  console.log(`[RESTORE] Backup de segurança criado: ${nomeSeguranca}`);

  // 2. Fechar conexão ativa
  getLocalDatabase().close();
  console.log('[RESTORE] Conexão com banco fechada.');

  // 3. Substituir banco atual pelo backup selecionado
  fs.copyFileSync(backupPath, dbPath);
  console.log(`[RESTORE] Banco restaurado a partir de: ${filename}`);

  // 4. Remover arquivos WAL/SHM residuais para evitar conflito
  const walPath = dbPath + '-wal';
  const shmPath = dbPath + '-shm';
  if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
  if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);

  // 5. Reconectar — o getDatabase() vai recriar a conexão automaticamente
  reopenLocalDatabase();
  console.log('[RESTORE] Conexão reestabelecida.');

  return {
    restaurado: true,
    arquivo: filename,
    backupSeguranca: nomeSeguranca,
    mensagem: 'Backup restaurado com sucesso. Reinicie o servidor ou recarregue a página para garantir que os dados atualizados sejam carregados.'
  };
  });
}

// ═══════════════════════════════════════
// EXCLUIR BACKUP
// ═══════════════════════════════════════

export function excluirBackup(filename) {
  getLocalDatabase();
  const filePath = validarNomeArquivo(filename);

  if (!fs.existsSync(filePath)) {
    throw new Error('Arquivo de backup não encontrado.');
  }

  // Proteção: não permitir excluir o banco atual
  const dbPath = getDatabasePath();
  if (path.resolve(filePath) === path.resolve(dbPath)) {
    throw new Error('Não é possível excluir o banco de dados atual.');
  }

  fs.unlinkSync(filePath);
  console.log(`[BACKUP] Backup excluído: ${filename}`);

  return { excluido: true, arquivo: filename };
}

// ═══════════════════════════════════════
// EXPORTAR JSON
// ═══════════════════════════════════════

export async function exportarJSON() {
  return snapshot(async () => {
    const db = getDatabase();
    const tables = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
    const data = { _meta: { app: 'Puzoto Life', versao: '1.0.0', exportadoEm: new Date().toISOString(), totalTabelas: tables.length, totalRegistros: 0 } };
    for (const { name } of tables) {
      if (!/^[a-z_]+$/.test(name)) throw new Error('Tabela inesperada na exportação.');
      data[name] = await db.prepare('SELECT * FROM "' + name + '"').all();
      data._meta.totalRegistros += data[name].length;
    }
    return data;
  });
}

// ═══════════════════════════════════════
// EXPORTAR CSV (TRABALHO)
// ═══════════════════════════════════════

function arrayToCSV(data, columns) {
  if (!data || data.length === 0) return '';
  const cols = columns || Object.keys(data[0]);
  const header = cols.join(';');
  const rows = data.map(row => cols.map(c => {
    const val = row[c];
    if (val === null || val === undefined) return '';
    const str = String(val).replace(/"/g, '""');
    return str.includes(';') || str.includes('"') || str.includes('\n') ? `"${str}"` : str;
  }).join(';'));
  return [header, ...rows].join('\n');
}

export async function exportarCSVTrabalho() {
  const db = getDatabase();
  const sections = {};

    const lancamentos = (await db.prepare('SELECT * FROM lancamentos_trabalho ORDER BY data DESC').all());
    sections['lancamentos_trabalho'] = arrayToCSV(lancamentos);
  

  
    const laudos = (await db.prepare('SELECT * FROM laudos_ranon ORDER BY id DESC').all());
    sections['laudos_ranon'] = arrayToCSV(laudos);
  

  
    const fechamentos = (await db.prepare('SELECT * FROM fechamentos_mensais ORDER BY referencia DESC').all());
    sections['fechamentos_mensais'] = arrayToCSV(fechamentos);
  

  return sections;
}

// ═══════════════════════════════════════
// EXPORTAR CSV (FINANÇAS)
// ═══════════════════════════════════════

export async function exportarCSVFinancas() {
  const db = getDatabase();
  const sections = {};

  
    sections['receitas'] = arrayToCSV((await db.prepare('SELECT * FROM receitas ORDER BY data DESC').all()));
  

  
    sections['gastos'] = arrayToCSV((await db.prepare('SELECT * FROM gastos ORDER BY data DESC').all()));
  

  
    sections['faturas_cartao'] = arrayToCSV((await db.prepare('SELECT * FROM faturas_cartao ORDER BY id DESC').all()));
  

  
    sections['contas_pagar'] = arrayToCSV((await db.prepare('SELECT * FROM contas_pagar ORDER BY vencimento DESC').all()));
  

  
    sections['pessoas_dividas'] = arrayToCSV((await db.prepare('SELECT * FROM pessoas_dividas ORDER BY id DESC').all()));
  

  
    sections['investimentos'] = arrayToCSV((await db.prepare('SELECT * FROM investimentos ORDER BY nome ASC').all()));
  

  
    sections['investimento_movimentos'] = arrayToCSV((await db.prepare('SELECT * FROM investimento_movimentos ORDER BY data DESC, id DESC').all()));
  

  return sections;
}
