/**
 * Serviço de Salvar Planilha — Dr. Ranon / RX
 * Fecha o lote pendente: salva no histórico definitivo, gera backup Excel e limpa pendentes.
 */

import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDatabase, getDatabasePath, atomic } from '../database/connection.js';
import { gerarBufferExcel } from './exportarExcelRanon.js';
import { registrarAuditoria } from './auditoria.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Pasta de backups
const backupFolder = () => path.join(path.dirname(getDatabasePath()), 'backups', 'laudos_ranon');

/**
 * Salvar Planilha: fecha o lote pendente do Dr. Ranon / RX.
 * @param {string} mesReferencia - Mês de referência no formato "MM/AAAA" (ex: "04/2026")
 */
export async function salvarPlanilhaRanon(mesReferencia) {
  if (!/^(0[1-9]|1[0-2])\/20\d{2}$/.test(String(mesReferencia))) throw new Error('Mês de referência inválido. Use MM/AAAA.');
  let createdFile;
  try {
    return await atomic(async () => {
  const db = getDatabase();

  // 1. Buscar laudos pendentes
  const laudos = (await db.prepare(`
    SELECT * FROM laudos_ranon_pendentes
    ORDER BY data ASC, criado_em ASC
  `).all());

  if (laudos.length === 0) {
    return { success: false, message: 'Não há laudos pendentes para salvar.' };
  }

  // 2. Buscar chave PIX
  const pixRow = (await db.prepare("SELECT valor FROM configuracoes WHERE chave = 'chave_pix'").get());
  const chavePix = pixRow ? pixRow.valor : 'ronnanpc@gmail.com';

  // 3. Gerar arquivo Excel de backup
  const buffer = await gerarBufferExcel(laudos, chavePix);

  // 4. Determinar nome do arquivo
  const partes = mesReferencia.split('/');
  const mes = partes[0];
  const ano = partes[1].slice(2);
  const nomeBase = `Laudos ${mes}-${ano}`;

  const folder = backupFolder();
  await fs.mkdir(folder, { recursive: true });
  const nomeArquivo = nomeBase + '_' + randomUUID() + '.xlsx';
  const caminhoCompleto = path.join(folder, nomeArquivo);
  await fs.writeFile(caminhoCompleto, Buffer.from(buffer), { flag: 'wx' });
  createdFile = caminhoCompleto;

  // 6. Transação: mover pendentes → histórico + limpar pendentes
  const totalQuantidade = laudos.reduce((acc, l) => acc + (l.quantidade || 1), 0);
  const totalValor = laudos.reduce((acc, l) => acc + l.total, 0);

  const inserirHistorico = db.prepare(`
    INSERT INTO laudos_ranon 
      (registro_paciente, quantidade, valor_unitario, total, data, horario, status, arquivo_excel_backup, observacao)
    VALUES 
      (@registro_paciente, @quantidade, @valor_unitario, @total, @data, @horario, @status, @arquivo_excel_backup, @observacao)
  `);

  const transacao = db.transaction(async () => {
    // Copiar cada laudo para histórico
    for (const laudo of laudos) {
      (await inserirHistorico.run({
        registro_paciente: laudo.registro_paciente,
        quantidade: laudo.quantidade || 1,
        valor_unitario: laudo.valor_unitario,
        total: laudo.total,
        data: laudo.data,
        horario: laudo.horario || null,
        status: 'fechado',
        arquivo_excel_backup: nomeArquivo,
        observacao: laudo.observacao || null
      }));
    }

    // Limpar pendentes
    (await db.prepare('DELETE FROM laudos_ranon_pendentes').run());

    // Registrar auditoria
    (await registrarAuditoria(
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
    ));
  });

  (await transacao());

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
    });
  } catch (error) {
    if (createdFile) await fs.unlink(createdFile).catch(() => {});
    throw error;
  }
}

/**
 * Listar últimas planilhas salvas (agrupadas por arquivo_excel_backup).
 */
export async function listarHistoricoPlanihas(limit = 5) {
  const db = getDatabase();
  return (await db.prepare(`
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
  `).all(limit));
}
