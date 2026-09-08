/**
 * Puzoto Life - Servico de Importacao de Dados
 * Valida, previsualiza e importa arquivos JSON exportados pelo sistema.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDatabase, getDatabasePath, getLocalDatabase } from '../database/connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BACKUP_DIR = path.join(__dirname, '..', '..', 'data', 'backups', 'database');

// Garante que o diretorio de backups exista
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// Tabelas reconhecidas pelo Puzoto Life
const TABELAS_PERMITIDAS = [
  'empresas',
  'categorias',
  'configuracoes',
  'lancamentos_trabalho',
  'lotes_trabalho_pendentes',
  'laudos_ranon',
  'laudos_ranon_pendentes',
  'laudos_ranon_historico',
  'fechamentos_diarios',
  'fechamentos_mensais',
  'ajustes_retroativos',
  'gastos',
  'cartoes',
  'compras_cartao',
  'parcelas_cartao',
  'faturas_cartao',
  'contas_pagar',
  'pessoas_dividas',
  'receitas',
  'investimentos',
  'investimento_movimentos',
  'auditoria'
];

// Tamanho maximo de arquivo: 50MB
const MAX_FILE_SIZE = 50 * 1024 * 1024;

// ===========================================
// VALIDACAO DO ARQUIVO JSON
// ===========================================

export function validarArquivoJSON(conteudo) {
  if (!conteudo || typeof conteudo !== 'string') {
    return { valido: false, erro: 'Conteudo do arquivo esta vazio.' };
  }

  if (Buffer.byteLength(conteudo, 'utf8') > MAX_FILE_SIZE) {
    return { valido: false, erro: 'Arquivo excede o tamanho maximo permitido (50MB).' };
  }

  let json;
  try {
    json = JSON.parse(conteudo);
  } catch (e) {
    return { valido: false, erro: 'Arquivo nao e um JSON valido. Verifique a formatacao.' };
  }

  if (typeof json !== 'object' || Array.isArray(json)) {
    return { valido: false, erro: 'Estrutura do JSON invalida. Esperado um objeto com tabelas.' };
  }

  // Verificar se possui pelo menos uma tabela reconhecida
  const tabelasEncontradas = [];
  const tabelasIgnoradas = [];
  let totalRegistros = 0;
  let registrosTrabalho = 0;
  let registrosFinanceiros = 0;
  let configuracoesEncontradas = 0;

  const tabelasTrabalho = ['lancamentos_trabalho', 'lotes_trabalho_pendentes', 'laudos_ranon', 'laudos_ranon_pendentes', 'laudos_ranon_historico', 'fechamentos_diarios', 'fechamentos_mensais', 'ajustes_retroativos'];
  const tabelasFinanceiras = ['gastos', 'cartoes', 'compras_cartao', 'parcelas_cartao', 'faturas_cartao', 'contas_pagar', 'pessoas_dividas', 'receitas', 'investimentos', 'investimento_movimentos'];

  for (const [chave, valor] of Object.entries(json)) {
    // Ignorar metadados internos
    if (chave.startsWith('_')) continue;

    if (!Array.isArray(valor)) continue;

    if (TABELAS_PERMITIDAS.includes(chave)) {
      const qtd = valor.length;
      tabelasEncontradas.push({
        nome: chave,
        quantidade: qtd,
        status: 'reconhecida'
      });
      totalRegistros += qtd;

      if (tabelasTrabalho.includes(chave)) registrosTrabalho += qtd;
      if (tabelasFinanceiras.includes(chave)) registrosFinanceiros += qtd;
      if (chave === 'configuracoes') configuracoesEncontradas = qtd;
      if (chave === 'empresas' || chave === 'categorias') configuracoesEncontradas += qtd;
    } else {
      tabelasIgnoradas.push({
        nome: chave,
        quantidade: valor.length,
        status: 'ignorada'
      });
    }
  }

  if (tabelasEncontradas.length === 0) {
    return {
      valido: false,
      erro: 'Nenhuma tabela reconhecida encontrada no arquivo. Verifique se o arquivo foi exportado pelo Puzoto Life.'
    };
  }

  return {
    valido: true,
    preview: {
      meta: json._meta || null,
      tabelas_encontradas: tabelasEncontradas.length,
      total_registros: totalRegistros,
      registros_trabalho: registrosTrabalho,
      registros_financeiros: registrosFinanceiros,
      configuracoes_encontradas: configuracoesEncontradas,
      tabelas: [
        ...tabelasEncontradas,
        ...tabelasIgnoradas
      ]
    }
  };
}

// ===========================================
// GERAR PREVIEW
// ===========================================

export function gerarPreviewImportacao(conteudo) {
  const resultado = validarArquivoJSON(conteudo);
  if (!resultado.valido) {
    throw new Error(resultado.erro);
  }
  return resultado.preview;
}

// ===========================================
// BACKUP AUTOMATICO ANTES DA IMPORTACAO
// ===========================================

export async function criarBackupAntesImportacao() {
  getLocalDatabase();
  const dbPath = getDatabasePath();

  if (!fs.existsSync(dbPath)) {
    throw new Error('Banco de dados nao encontrado.');
  }

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const nomeArquivo = `puzoto_life_auto_before_import_${ts}.db`;
  const destino = path.join(BACKUP_DIR, nomeArquivo);

  await getDatabase().backup(destino);
  console.log(`[IMPORT] Backup de seguranca criado: ${nomeArquivo}`);

  const stats = fs.statSync(destino);
  return {
    nomeArquivo,
    caminho: destino,
    tamanho: stats.size,
    tamanhoFormatado: formatarTamanho(stats.size),
    criadoEm: stats.birthtime.toISOString()
  };
}

function formatarTamanho(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// ===========================================
// OBTER COLUNAS DA TABELA NO BANCO
// ===========================================

async function obterColunasTabela(db, nomeTabela) {
  try {
    const info = (await db.prepare(`PRAGMA table_info(${nomeTabela})`).all());
    return info.map(col => col.name);
  } catch (e) {
    return [];
  }
}

async function tabelaExisteNoBanco(db, nomeTabela) {
  const result = (await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(nomeTabela));
  return !!result;
}

// ===========================================
// NORMALIZAR DADOS PARA INSERCAO
// ===========================================

function normalizarRegistro(registro, colunasDestino, incluirId = false) {
  const normalizado = {};
  for (const col of colunasDestino) {
    if (col === 'id' && !incluirId) continue;
    if (registro.hasOwnProperty(col)) {
      const valor = registro[col];
      // Garantir que so bind tipos validos para SQLite
      if (valor === undefined) {
        normalizado[col] = null;
      } else if (typeof valor === 'object' && valor !== null) {
        normalizado[col] = JSON.stringify(valor);
      } else {
        normalizado[col] = valor;
      }
    }
  }
  return normalizado;
}

// ===========================================
// INSERIR REGISTROS NA TABELA
// ===========================================

async function inserirRegistrosTabela(db, nomeTabela, registros, opcoes = {}) {
  const { evitarDuplicados = true, modo = 'adicionar' } = opcoes;

  if (!registros || registros.length === 0) {
    return { importados: 0, ignorados: 0, erros: [] };
  }

  const colunasDestino = (await obterColunasTabela(db, nomeTabela));
  if (colunasDestino.length === 0) {
    return { importados: 0, ignorados: 0, erros: [`Tabela ${nomeTabela} nao encontrada no banco.`] };
  }

  // No modo substituir, apagar dados existentes da tabela
  if (modo === 'substituir') {
    (await db.prepare(`DELETE FROM ${nomeTabela}`).run());
    console.log(`[IMPORT] Dados da tabela ${nomeTabela} apagados (modo substituir).`);
  }

  let importados = 0;
  let ignorados = 0;
  const erros = [];

  // Para o modo substituir, inserir com ID original
  const incluirIdOriginal = (modo === 'substituir');

  for (let i = 0; i < registros.length; i++) {
    try {
      const reg = registros[i];

      // Verificar duplicidade por ID
      if (evitarDuplicados && reg.id && modo !== 'substituir') {
        const existe = (await db.prepare(`SELECT id FROM ${nomeTabela} WHERE id = ?`).get(reg.id));
        if (existe) {
          ignorados++;
          continue;
        }
      }

      const normalizado = normalizarRegistro(reg, colunasDestino, incluirIdOriginal);
      const colunas = Object.keys(normalizado);

      if (colunas.length === 0) {
        ignorados++;
        continue;
      }

      const placeholders = colunas.map(() => '?').join(', ');
      const valores = colunas.map(c => normalizado[c]);

      const sql = `INSERT INTO ${nomeTabela} (${colunas.join(', ')}) VALUES (${placeholders})`;
      (await db.prepare(sql).run(...valores));
      importados++;
    } catch (err) {
      // Se for duplicado (UNIQUE constraint), contabilizar como ignorado
      if (err.message && err.message.includes('UNIQUE constraint')) {
        ignorados++;
      } else {
        erros.push(`Registro ${i + 1} da tabela ${nomeTabela}: ${err.message}`);
        // Continuar importando os demais
      }
    }
  }

  return { importados, ignorados, erros };
}

// ===========================================
// IMPORTAR JSON COMPLETO
// ===========================================

export async function importarJSON(conteudo, opcoes = {}) {
  const { modo = 'adicionar', evitarDuplicados = true, confirmacao } = opcoes;

  // Validar confirmacao
  if (confirmacao !== 'IMPORTAR') {
    throw new Error('Confirmacao invalida. Digite exatamente: IMPORTAR');
  }

  // Validar JSON
  const validacao = validarArquivoJSON(conteudo);
  if (!validacao.valido) {
    throw new Error(validacao.erro);
  }

  let json;
  try {
    json = JSON.parse(conteudo);
  } catch (e) {
    throw new Error('Falha ao parsear JSON.');
  }

  // Criar backup automatico antes da importacao
  const backupCriado = await criarBackupAntesImportacao();
  console.log(`[IMPORT] Backup de seguranca criado: ${backupCriado.nomeArquivo}`);

  const db = getDatabase();

  // Usar transacao para garantir atomicidade
  let resultado = {
    tabelas_importadas: 0,
    registros_importados: 0,
    registros_ignorados: 0,
    detalhes: [],
    erros: []
  };

  const transacao = db.transaction(async () => {
    for (const [chave, valor] of Object.entries(json)) {
      // Ignorar metadados internos
      if (chave.startsWith('_')) continue;
      if (!Array.isArray(valor)) continue;
      if (!TABELAS_PERMITIDAS.includes(chave)) continue;

      // Verificar se tabela existe no banco
      if (!(await tabelaExisteNoBanco(db, chave))) {
        resultado.erros.push(`Tabela ${chave} nao existe no banco atual. Ignorada.`);
        resultado.detalhes.push({
          tabela: chave,
          importados: 0,
          ignorados: valor.length,
          status: 'tabela_inexistente'
        });
        continue;
      }

      const res = (await inserirRegistrosTabela(db, chave, valor, { evitarDuplicados, modo }));

      resultado.tabelas_importadas++;
      resultado.registros_importados += res.importados;
      resultado.registros_ignorados += res.ignorados;
      resultado.erros.push(...res.erros);

      resultado.detalhes.push({
        tabela: chave,
        importados: res.importados,
        ignorados: res.ignorados,
        status: res.importados > 0 ? 'importada' : (res.ignorados > 0 ? 'ignorada_duplicados' : 'vazia')
      });

      console.log(`[IMPORT] ${chave}: ${res.importados} importados, ${res.ignorados} ignorados.`);
    }
  });

  try {
    (await transacao());
  } catch (err) {
    console.error('[IMPORT] Erro durante importacao (rollback automatico):', err.message);
    throw new Error(`Importacao falhou e foi revertida: ${err.message}`);
  }

  return {
    success: true,
    message: 'Importacao concluida com sucesso.',
    backup_criado: backupCriado.nomeArquivo,
    resultado
  };
}
