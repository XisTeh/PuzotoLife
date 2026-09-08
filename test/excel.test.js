import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';

test('exportação Excel preserva valores e formatação após atualização de uuid', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Dados sintéticos');
  sheet.addRow(['Registro', 'Valor']);
  sheet.addRow(['SINTETICO', 123.45]);
  sheet.addConditionalFormatting({ ref: 'B2', rules: [{ type: 'dataBar', cfvo: [{ type: 'min' }, { type: 'max' }], color: { argb: 'FF81CDB4' } }] });
  const restored = new ExcelJS.Workbook();
  await restored.xlsx.load(await workbook.xlsx.writeBuffer());
  assert.equal(restored.getWorksheet(1).getCell('B2').value, 123.45);
  assert.equal(restored.getWorksheet(1).getCell('A2').value, 'SINTETICO');
});
