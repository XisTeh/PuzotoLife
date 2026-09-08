/**
 * Serviço de Salvar Planilha — Dr. Ranon / RX
 * Fecha o lote pendente: salva no histórico definitivo, gera backup Excel e limpa pendentes.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDatabase } from '../database/connection.js';
import { gerarBufferExcel } from './exportarExcelRanon.js';
import { registrarAuditoria } from './auditoria.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Pasta de backups
const PASTA_BACKUPS = path.resolve(__dirname, '../../data/backups/laudos_ranon');

/**
 * Salvar Planilha: fecha o lote pendente do Dr. Ranon / RX.
 * @param {string} mesReferencia - Mês de referência no formato "MM/AAAA" (ex: "04/2026")
 */
export async function salvarPlanilhaRanon(mesReferencia) {
  const db = getDatabase();

  // 1. Buscar laudos pendentes
  const laudos = db.prepare(`
    SELECT * FROM laudos_ranon_pendentes
    ORDER BY data ASC, criado_em ASC
  `).all();

  if (laudos.length === 0) {
    return { success: false, message: 'Não há laudos pendentes para salvar.' };
  }

  // 2. Buscar chave PIX
  const pixRow = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'chave_pix'").get();
  const chavePix = pixRow ? pixRow.valor : 'ronnanpc@gmail.com';

  // 3. Gerar arquivo Excel de backup
  const buffer = await gerarBufferExcel(laudos, chavePix);

  // 4. Determinar nome do arquivo
  const partes = mesReferencia.split('/');
  const mes = partes[0];
  const ano = partes[1].slice(2);
  const nomeBase = `Laudos ${mes}-${ano}`;

  // Garantir que a pasta exista
  if (!fs.existsSync(PASTA_BACKUPS)) {
    fs.mkdirSync(PASTA_BACKUPS, { recursive: true });
  }

  // Evitar sobrescrever: adicionar timestamp se já existir
  let nomeArquivo = `${nomeBase}.xlsx`;
  let caminhoCompleto = path.join(PASTA_BACKUPS, nomeArquivo);

  if (fs.existsSync(caminhoCompleto)) {
    const agora = new Date();
    const ts = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}_${String(agora.getHours()).padStart(2, '0')}-${String(agora.getMinutes()).padStart(2, '0')}`;
    nomeArquivo = `${nomeBase}_${ts}.xlsx`;
    caminhoCompleto = path.join(PASTA_BACKUPS, nomeArquivo);
  }

  // 5. Salvar arquivo no disco
  fs.writeFileSync(caminhoCompleto, Buffer.from(buffer));

  // 6. Transação: mover pendentes → histórico + limpar pendentes
  const totalQuantidade = laudos.reduce((acc, l) => acc + (l.quantidade || 1), 0);
  const totalValor = laudos.reduce((acc, l) => acc + l.total, 0);

  const inserirHistorico = db.prepare(`
    INSERT INTO laudos_ranon 
      (registro_paciente, quantidade, valor_unitario, total, data, horario, status, arquivo_excel_backup, observacao)
    VALUES 
      (@registro_paciente, @quantidade, @valor_unitario, @total, @data, @horario, @status, @arquivo_excel_backup, @observacao)
  `);

  const transacao = db.transaction(() => {
    // Copiar cada laudo para histórico
    for (const laudo of laudos) {
      inserirHistorico.run({
        registro_paciente: laudo.registro_paciente,
        quantidade: laudo.quantidade || 1,
        valor_unitario: laudo.valor_unitario,
        total: laudo.total,
        data: laudo.data,
        horario: laudo.horario || null,
        status: 'fechado',
        arquivo_excel_backup: nomeArquivo,
        observacao: laudo.observacao || null
      });
    }

    // Limpar pendentes
    db.prepare('DELETE FROM laudos_ranon_pendentes').run();

    // Registrar auditoria
    registrarAuditoria(
      'salvar_planilha_ranon',
      'Planilha do Dr. Ranon / RX salva com sucesso',
      laudos,
      {
        quantidade: totalQuantidade,
        total: totalValor,
        arquivo_excel_backup: nomeArquivo,
        mes_referencia: mesReferencia,
        salvo_em: new Date().toISOString()
      }
    );
  });

  transacao();

  return {
    success: true,
    message: 'Planilha salva com sucesso.',
    arquivo: nomeArquivo,
    resumo: {
      quantidade: totalQuantidade,
      total: totalValor,
      mes_referencia: mesReferencia
    }
  };
}

/**
 * Listar últimas planilhas salvas (agrupadas por arquivo_excel_backup).
 */
export function listarHistoricoPlanihas(limit = 5) {
  const db = getDatabase();
  return db.prepare(`
    SELECT 
      arquivo_excel_backup,
      COUNT(*) as quantidade,
      SUM(total) as total_valor,
      MIN(data) as data_inicio,
      MAX(data) as data_fim,
      MAX(criado_em) as salvo_em
    FROM laudos_ranon
    WHERE arquivo_excel_backup IS NOT NULL
    GROUP BY arquivo_excel_backup
    ORDER BY MAX(criado_em) DESC
    LIMIT ?
  `).all(limit);
}
