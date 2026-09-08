/**
 * Serviço de Exportação Excel — Dr. Ranon / RX
 * Gera um arquivo .xlsx profissional.
 * Função reutilizável para Exportar Excel (download) e Salvar Planilha (backup físico).
 */

import ExcelJS from 'exceljs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDatabase } from '../database/connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ═══════════════════════════════════════
// CORES DO TEMA
// ═══════════════════════════════════════
const COR_TITULO_BG    = '0D5E4E';
const COR_TITULO_FONT  = 'FFFFFF';
const COR_SUBTITULO_BG = '1A3A33';
const COR_SUBTITULO_FT = 'C8E6DF';
const COR_INFO_BG      = 'E8F5E9';
const COR_CABECALHO_BG = '14B8A6';
const COR_CABECALHO_FT = 'FFFFFF';
const COR_TOTAL_BG     = '0D5E4E';
const COR_TOTAL_FT     = 'FFFFFF';
const COR_BORDA        = 'B0BEC5';

const BORDA_FINA = {
  top:    { style: 'thin', color: { argb: COR_BORDA } },
  left:   { style: 'thin', color: { argb: COR_BORDA } },
  bottom: { style: 'thin', color: { argb: COR_BORDA } },
  right:  { style: 'thin', color: { argb: COR_BORDA } }
};

const TOTAL_COLUNAS = 5;

// ═══════════════════════════════════════
// FUNÇÃO REUTILIZÁVEL DE GERAÇÃO EXCEL
// ═══════════════════════════════════════

/**
 * Gera o buffer do Excel a partir de uma lista de laudos.
 * @param {Array} laudos - Lista de laudos (pode ser pendentes ou qualquer array com mesma estrutura)
 * @param {string} chavePix - Chave PIX para exibir na planilha
 * @returns {Promise<Buffer>} Buffer do arquivo .xlsx
 */
export async function gerarBufferExcel(laudos, chavePix) {
  const valoresUnicos = [...new Set(laudos.map(l => l.valor_unitario))];
  const valorUnicoTexto = valoresUnicos.length === 1
    ? `RX - R$ ${valoresUnicos[0].toFixed(2).replace('.', ',')} por laudo`
    : 'RX - Valores unitários conforme lançamentos';

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Puzoto LTDA';
  workbook.created = new Date();

  const ws = workbook.addWorksheet('Laudos RX', {
    properties: { defaultRowHeight: 20 }
  });

  ws.columns = [
    { key: 'data',      width: 13 },
    { key: 'registro',  width: 28 },
    { key: 'valor',     width: 18 },
    { key: 'quantidade',width: 15 },
    { key: 'exame',     width: 35 }
  ];

  // Logo
  const logoPath = path.resolve(__dirname, '../../assets/images/PuzotoLife.png');
  const logoId = workbook.addImage({ filename: logoPath, extension: 'png' });
  ws.getRow(1).height = 36;
  ws.getRow(2).height = 36;
  ws.addImage(logoId, { tl: { col: 0, row: 0 }, br: { col: 1, row: 2 } });

  // Título
  ws.mergeCells('B1:E1');
  const celTitulo = ws.getCell('B1');
  celTitulo.value = 'CONTROLE DE LAUDOS - DR. RANON / RX';
  celTitulo.font = { name: 'Calibri', size: 16, bold: true, color: { argb: COR_TITULO_FONT } };
  celTitulo.alignment = { horizontal: 'center', vertical: 'middle' };
  celTitulo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_TITULO_BG } };
  ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_TITULO_BG } };

  // Subtítulo
  ws.mergeCells('B2:E2');
  const celSub = ws.getCell('B2');
  celSub.value = 'Puzoto LTDA - Controle de Digitação';
  celSub.font = { name: 'Calibri', size: 11, italic: true, color: { argb: COR_SUBTITULO_FT } };
  celSub.alignment = { horizontal: 'center', vertical: 'middle' };
  celSub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_SUBTITULO_BG } };
  ws.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_SUBTITULO_BG } };

  // Data de geração
  const agora = new Date();
  const dataGeracaoStr = `${String(agora.getDate()).padStart(2, '0')}/${String(agora.getMonth() + 1).padStart(2, '0')}/${agora.getFullYear()} ${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`;
  ws.mergeCells('A3:E3');
  const celData = ws.getCell('A3');
  celData.value = `Gerado em: ${dataGeracaoStr}`;
  celData.font = { name: 'Calibri', size: 10, bold: true };
  celData.alignment = { horizontal: 'left', vertical: 'middle' };
  celData.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_INFO_BG } };
  ws.getRow(3).height = 22;

  // PIX
  ws.mergeCells('A4:E4');
  const celPix = ws.getCell('A4');
  celPix.value = `PIX: ${chavePix}`;
  celPix.font = { name: 'Calibri', size: 10, bold: true };
  celPix.alignment = { horizontal: 'left', vertical: 'middle' };
  celPix.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_INFO_BG } };
  ws.getRow(4).height = 22;

  // Resumo
  ws.mergeCells('A5:E5');
  const celResumo = ws.getCell('A5');
  celResumo.value = valorUnicoTexto;
  celResumo.font = { name: 'Calibri', size: 10, bold: true };
  celResumo.alignment = { horizontal: 'left', vertical: 'middle' };
  celResumo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_INFO_BG } };
  ws.getRow(5).height = 22;

  ws.getRow(6).height = 8;

  // Cabeçalhos
  const cabecalhos = ['Data', 'Registro do Paciente', 'Valor Unitário', 'Qtd. Exames', 'Exame'];
  const rowCab = ws.getRow(7);
  cabecalhos.forEach((titulo, i) => {
    const cel = rowCab.getCell(i + 1);
    cel.value = titulo;
    cel.font = { name: 'Calibri', size: 11, bold: true, color: { argb: COR_CABECALHO_FT } };
    cel.alignment = { horizontal: 'center', vertical: 'middle' };
    cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_CABECALHO_BG } };
    cel.border = BORDA_FINA;
  });
  ws.getRow(7).height = 26;

  // Dados
  let linhaAtual = 8;
  let somaTotal = 0;

  laudos.forEach((laudo, idx) => {
    const row = ws.getRow(linhaAtual);
    let dataFormatada = laudo.data;
    if (laudo.data && laudo.data.includes('-')) {
      const partes = laudo.data.split('-');
      dataFormatada = `${partes[2]}/${partes[1]}/${partes[0]}`;
    }

    row.getCell(1).value = dataFormatada;
    row.getCell(1).alignment = { horizontal: 'center' };
    row.getCell(1).font = { name: 'Calibri', size: 10 };

    row.getCell(2).value = laudo.registro_paciente;
    row.getCell(2).alignment = { horizontal: 'center' };
    row.getCell(2).font = { name: 'Calibri', size: 11, bold: true };

    row.getCell(3).value = laudo.valor_unitario;
    row.getCell(3).numFmt = 'R$ #,##0.00';
    row.getCell(3).alignment = { horizontal: 'center' };
    row.getCell(3).font = { name: 'Calibri', size: 10 };

    row.getCell(4).value = laudo.quantidade || 1;
    row.getCell(4).alignment = { horizontal: 'center' };
    row.getCell(4).font = { name: 'Calibri', size: 10 };

    row.getCell(5).value = laudo.observacao || '';
    row.getCell(5).alignment = { horizontal: 'left' };
    row.getCell(5).font = { name: 'Calibri', size: 10 };

    const bgColor = idx % 2 === 0 ? 'FFFFFF' : 'F5F5F5';
    for (let c = 1; c <= TOTAL_COLUNAS; c++) {
      row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
      row.getCell(c).border = BORDA_FINA;
    }

    somaTotal += laudo.total;
    linhaAtual++;
  });

  // Linhas vazias
  const minimoLinhas = 15;
  const linhasRestantes = minimoLinhas - laudos.length;
  if (linhasRestantes > 0) {
    for (let i = 0; i < linhasRestantes; i++) {
      const row = ws.getRow(linhaAtual);
      const bgColor = (laudos.length + i) % 2 === 0 ? 'FFFFFF' : 'F5F5F5';
      for (let c = 1; c <= TOTAL_COLUNAS; c++) {
        row.getCell(c).value = '';
        row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
        row.getCell(c).border = BORDA_FINA;
      }
      linhaAtual++;
    }
  }

  // Total
  const totalLaudos = laudos.reduce((acc, l) => acc + (l.quantidade || 1), 0);
  const rowTotal = ws.getRow(linhaAtual);
  ws.mergeCells(`A${linhaAtual}:B${linhaAtual}`);
  rowTotal.getCell(1).value = `Total de laudos: ${totalLaudos}`;
  rowTotal.getCell(1).font = { name: 'Calibri', size: 12, bold: true, color: { argb: COR_TOTAL_FT } };
  rowTotal.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  rowTotal.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_TOTAL_BG } };
  rowTotal.getCell(1).border = BORDA_FINA;

  rowTotal.getCell(3).value = somaTotal;
  rowTotal.getCell(3).numFmt = 'R$ #,##0.00';
  rowTotal.getCell(3).font = { name: 'Calibri', size: 12, bold: true, color: { argb: COR_TOTAL_FT } };
  rowTotal.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
  rowTotal.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_TOTAL_BG } };
  rowTotal.getCell(3).border = BORDA_FINA;

  rowTotal.getCell(4).value = totalLaudos;
  rowTotal.getCell(4).font = { name: 'Calibri', size: 12, bold: true, color: { argb: COR_TOTAL_FT } };
  rowTotal.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
  rowTotal.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_TOTAL_BG } };
  rowTotal.getCell(4).border = BORDA_FINA;

  rowTotal.getCell(5).value = '';
  rowTotal.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_TOTAL_BG } };
  rowTotal.getCell(5).border = BORDA_FINA;

  ws.getRow(linhaAtual).height = 28;

  return await workbook.xlsx.writeBuffer();
}

// ═══════════════════════════════════════
// EXPORTAR EXCEL (download sem alterar dados)
// ═══════════════════════════════════════

export async function gerarExcelRanon() {
  const db = getDatabase();

  const laudos = (await db.prepare(`
    SELECT * FROM laudos_ranon_pendentes
    ORDER BY data ASC, criado_em ASC
  `).all());

  if (laudos.length === 0) {
    throw new Error('Não há laudos pendentes para exportar.');
  }

  const pixRow = (await db.prepare("SELECT valor FROM configuracoes WHERE chave = 'chave_pix'").get());
  const chavePix = pixRow ? pixRow.valor : 'ronnanpc@gmail.com';

  const buffer = await gerarBufferExcel(laudos, chavePix);

  // Nome: mês anterior ao atual
  const agora = new Date();
  const mesAnterior = agora.getMonth();
  let anoRef = agora.getFullYear();
  let mesRef = mesAnterior;
  if (mesRef === 0) { mesRef = 12; anoRef -= 1; }
  const nomeArquivo = `Laudos ${String(mesRef).padStart(2, '0')}-${String(anoRef).slice(2)}.xlsx`;

  return { buffer, nomeArquivo };
}
