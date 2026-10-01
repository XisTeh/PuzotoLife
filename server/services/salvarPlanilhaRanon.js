/**
 * Serviço de Salvar Planilha — Dr. Ranon / RX
 * Fecha o lote pendente: salva no histórico definitivo, gera backup Excel e limpa pendentes.
 */

import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDatabase, getDatabasePath, atomic, snapshot, databaseDialect } from '../database/connection.js';
import { gerarBufferExcel } from './exportarExcelRanon.js';
import { registrarAuditoria } from './auditoria.js';
import { removePrivateFile, uploadPrivateFile } from '../storage/privateFiles.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Pasta de backups
const backupFolder = () => path.join(path.dirname(getDatabasePath()), 'backups', 'laudos_ranon');
const CAMPOS_PENDENTES = ['id', 'registro_paciente', 'quantidade', 'valor_unitario', 'total', 'data', 'horario', 'observacao', 'criado_em', 'atualizado_em'];
const TAMANHO_LOTE_INSERCAO = 500;

function compararLote(atual, original) {
  return atual.length === original.length && atual.every((laudo, index) =>
    CAMPOS_PENDENTES.every(campo => (laudo[campo] ?? null) === (original[index][campo] ?? null))
  );
}

function conflitoDeLote() {
  const error = new Error('Os laudos pendentes mudaram enquanto a planilha era preparada. Atualize a lista e tente novamente.');
  error.code = 'RANON_PENDING_BATCH_CHANGED';
  return error;
}

/**
 * Salvar Planilha: fecha o lote pendente do Dr. Ranon / RX.
 * @param {string} mesReferencia - Mês de referência no formato "MM/AAAA" (ex: "04/2026")
 */
export async function salvarPlanilhaRanon(mesReferencia) {
  if (!/^(0[1-9]|1[0-2])\/20\d{2}$/.test(String(mesReferencia))) throw new Error('Mês de referência inválido. Use MM/AAAA.');
  const cloudFiles = databaseDialect() === 'postgres' && process.env.NODE_ENV !== 'test';
  let createdFile;
  try {
    // Capture a consistent input, then generate and upload the workbook without
    // holding PostgreSQL's owner lock or an open transaction during network IO.
    const lote = await snapshot(async () => {
      const db = getDatabase();
      const laudos = await db.prepare(`
        SELECT * FROM laudos_ranon_pendentes
        ORDER BY data ASC, criado_em ASC, id ASC
      `).all();
      const pixRow = await db.prepare("SELECT valor FROM configuracoes WHERE chave = 'chave_pix'").get();
      return { laudos, chavePix: pixRow ? pixRow.valor : 'ronnanpc@gmail.com' };
    });
    const { laudos, chavePix } = lote;

    if (laudos.length === 0) return { success: false, message: 'Não há laudos pendentes para salvar.' };

    const buffer = await gerarBufferExcel(laudos, chavePix);
    const [mes, ano] = mesReferencia.split('/');
    const nomeArquivo = `Laudos ${mes}-${ano.slice(2)}_${randomUUID()}.xlsx`;
    if (cloudFiles) {
      createdFile = `laudos_ranon/${nomeArquivo}`;
      await uploadPrivateFile(createdFile, Buffer.from(buffer), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    } else {
      const folder = backupFolder();
      await fs.mkdir(folder, { recursive: true });
      createdFile = path.join(folder, nomeArquivo);
      await fs.writeFile(createdFile, Buffer.from(buffer), { flag: 'wx' });
    }

    const totalQuantidade = laudos.reduce((acc, laudo) => acc + (laudo.quantidade || 1), 0);
    const totalValor = laudos.reduce((acc, laudo) => acc + laudo.total, 0);
    const resultado = await atomic(async () => {
      const db = getDatabase();
      const atuais = await db.prepare(`
        SELECT * FROM laudos_ranon_pendentes
        ORDER BY data ASC, criado_em ASC, id ASC
      `).all();
      if (atuais.length === 0) return { success: false, message: 'Não há laudos pendentes para salvar.' };
      if (!compararLote(atuais, laudos)) throw conflitoDeLote();

      for (let inicio = 0; inicio < laudos.length; inicio += TAMANHO_LOTE_INSERCAO) {
        const parte = laudos.slice(inicio, inicio + TAMANHO_LOTE_INSERCAO);
        const values = parte.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
        const params = parte.flatMap(laudo => [
          laudo.registro_paciente, laudo.quantidade || 1, laudo.valor_unitario, laudo.total,
          laudo.data, laudo.horario || null, 'fechado', nomeArquivo, laudo.observacao || null,
        ]);
        const inseridos = await db.prepare(`
          INSERT INTO laudos_ranon
            (registro_paciente, quantidade, valor_unitario, total, data, horario, status, arquivo_excel_backup, observacao)
          VALUES ${values}
        `).run(...params);
        if (inseridos.changes !== parte.length) throw new Error('Não foi possível transferir todos os laudos para o histórico.');
      }

      const removidos = await db.prepare('DELETE FROM laudos_ranon_pendentes').run();
      if (removidos.changes !== laudos.length) throw conflitoDeLote();

      await registrarAuditoria(
        'salvar_planilha_ranon',
        'Planilha do Dr. Ranon / RX salva com sucesso',
        laudos,
        {
          quantidade: totalQuantidade,
          total: totalValor,
          arquivo_excel_backup: nomeArquivo,
          mes_referencia: mesReferencia,
          salvo_em: new Date().toISOString(),
        },
      );

      return {
        success: true,
        message: 'Planilha salva com sucesso.',
        arquivo: nomeArquivo,
        resumo: { quantidade: totalQuantidade, total: totalValor, mes_referencia: mesReferencia },
      };
    });
    if (!resultado.success && createdFile) {
      if (cloudFiles) await removePrivateFile(createdFile).catch(() => {});
      else await fs.unlink(createdFile).catch(() => {});
    }
    createdFile = undefined;
    return resultado;
  } catch (error) {
    if (createdFile) {
      if (cloudFiles) await removePrivateFile(createdFile).catch(() => {});
      else await fs.unlink(createdFile).catch(() => {});
    }
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
