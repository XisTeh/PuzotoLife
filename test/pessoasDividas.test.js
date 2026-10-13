import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.NODE_ENV = 'test';
const { initializeTestDatabase } = await import('./support/database.js');
const { getDatabase, closeDatabase } = await import('../server/database/connection.js');
const { criarPessoaDivida, criarDividaParcelada, listarPessoasDividas, marcarPessoaDividaResolvida, calcularResumoPessoasDividas, atualizarDataEmprestimo, pagarProximaParcelaDivida } = await import('../server/services/pessoasDividas.js');

for (const engine of ['sqlite', 'postgres']) {
  test(`${engine}: empréstimo permanece visível e entra no total somente ao receber`, async t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `puzoto-loan-${engine}-`));
    process.env.PUZOTO_LIFE_DB_PATH = path.join(dir, 'test.db');
    await initializeTestDatabase(engine);
    t.after(async () => { await closeDatabase(); fs.rmSync(dir, { recursive: true, force: true }); });

    await criarPessoaDivida({ nome_pessoa: 'Pessoa sintética', tipo: 'me_deve', valor: 120, motivo: 'Teste sintético', data_emprestimo: '2026-01-10', data_combinada: '2026-02-10' });
    const banco = getDatabase();
    const id = (await banco.prepare("SELECT id FROM pessoas_dividas WHERE nome_pessoa = 'Pessoa sintética'").get()).id;
    assert.equal((await listarPessoasDividas({ mes: '2025-12', tipo: 'me_deve' })).length, 0);
    for (const mes of ['2026-01', '2026-02', '2026-03', '2026-10']) {
      const linhas = await listarPessoasDividas({ mes, tipo: 'me_deve' });
      assert.equal(linhas.filter(linha => linha.id === id).length, 1);
      assert.equal(linhas.find(linha => linha.id === id).data_emprestimo, '2026-01-10');
    }
    assert.equal((await calcularResumoPessoasDividas('2026-10')).meDevemPendenteTotalGeral, 120);
    assert.equal((await calcularResumoPessoasDividas('2026-10')).jaRecebiMes, 0);

    await marcarPessoaDividaResolvida(id);
    const recebidoEm = (await banco.prepare('SELECT pago_recebido_em FROM pessoas_dividas WHERE id = ?').get(id)).pago_recebido_em;
    const mesRecebido = recebidoEm.slice(0, 7);
    assert.equal((await calcularResumoPessoasDividas(mesRecebido)).jaRecebiMes, 120);
    assert.equal((await calcularResumoPessoasDividas('2026-02')).jaRecebiMes, mesRecebido === '2026-02' ? 120 : 0);
    assert.equal((await calcularResumoPessoasDividas(mesRecebido)).meDevemPendenteTotalGeral, 0);
    assert.equal((await listarPessoasDividas({ mes: mesRecebido, tipo: 'me_deve' })).filter(linha => linha.id === id).length, 1);
    await assert.rejects(() => marcarPessoaDividaResolvida(id), /já está recebido/);
    assert.equal((await calcularResumoPessoasDividas(mesRecebido)).jaRecebiMes, 120);

    await atualizarDataEmprestimo(id, '2026-01-09');
    assert.equal((await banco.prepare('SELECT data_emprestimo FROM pessoas_dividas WHERE id = ?').get(id)).data_emprestimo, '2026-01-09');
    await assert.rejects(() => atualizarDataEmprestimo(id, '2026-02-30'), /inválida/);
    await banco.prepare("INSERT INTO pessoas_dividas (nome_pessoa, tipo, valor, motivo, data_combinada) VALUES ('Legado sintético', 'me_deve', 10, 'Teste', '2026-01-01')").run();
    assert.equal((await listarPessoasDividas({ mes: '2026-10', pessoa: 'Legado sintético' }))[0].data_emprestimo, null);

    const grupo = await criarDividaParcelada({ nome_pessoa: 'Grupo sintético', tipo: 'me_deve', motivo: 'Teste', valor_parcela: 50, total_parcelas: 2, competencia_inicio: '2026-01', dia_vencimento: 10, data_emprestimo: '2026-01-01' });
    const antes = await listarPessoasDividas({ mes: mesRecebido, pessoa: 'Grupo sintético' });
    assert.equal(antes.filter(linha => linha.status === 'pendente').length, 2);
    assert.ok(antes.every(linha => linha.data_emprestimo === '2026-01-01'));
    assert.equal((await calcularResumoPessoasDividas(mesRecebido)).meDevemPendenteTotalGeral, 110);
    await pagarProximaParcelaDivida(grupo.id);
    const depois = await listarPessoasDividas({ mes: mesRecebido, pessoa: 'Grupo sintético' });
    assert.equal(depois.filter(linha => linha.status === 'pendente').length, 1);
    assert.equal(depois.filter(linha => linha.status === 'recebido').length, 1);
    assert.equal((await calcularResumoPessoasDividas(mesRecebido)).jaRecebiMes, 170);
    assert.equal((await calcularResumoPessoasDividas(mesRecebido)).meDevemPendenteTotalGeral, 60);
    await atualizarDataEmprestimo(`dp_${grupo.id}`, '2025-12-30');
    assert.equal((await banco.prepare('SELECT data_emprestimo FROM dividas_parceladas_grupos WHERE id = ?').get(grupo.id)).data_emprestimo, '2025-12-30');
  });
}
