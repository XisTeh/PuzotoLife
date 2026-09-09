import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.NODE_ENV = 'test';
process.env.PUZOTO_LIFE_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'puzoto-parity-')), 'test.db');
const { initializeTestDatabase } = await import('./support/database.js');
const { getDatabase, closeDatabase } = await import('../server/database/connection.js');
const cards = await import('../server/services/cartoes.js');
const lote = await import('../server/services/loteTrabalho.js');
const closing = await import('../server/services/fechamentoDia.js');
const monthly = await import('../server/services/fechamentoMensal.js');
const work = await import('../server/services/lancamentosTrabalho.js');
const debt = await import('../server/services/pessoasDividas.js');
const savings = await import('../server/services/investimentos.js');
const finances = await import('../server/services/financas.js');
const accounts = await import('../server/services/contasPagar.js');
const income = await import('../server/services/receitas.js');
const ranon = await import('../server/services/laudosRanon.js');
const panels = await import('../server/services/pageData.js');
const { salvarPlanilhaRanon } = await import('../server/services/salvarPlanilhaRanon.js');
const { obterRecebimentosPendentes } = await import('../server/services/pagadores.js');
const { exportarJSON } = await import('../server/services/backup.js');
const { dataHojeLocal } = await import('../server/utils/dataLocal.js');
const today = dataHojeLocal();
const month = today.slice(0, 7);
let sqliteTotals;

for (const engine of ['sqlite', 'postgres']) {
  test(`${engine}: paridade de cartões, fechamentos, recebimentos e rollback`, async t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `puzoto-${engine}-`));
    process.env.PUZOTO_LIFE_DB_PATH = path.join(dir, 'test.db');
    await initializeTestDatabase(engine);
    t.after(async () => { await closeDatabase(); fs.rmSync(dir, { recursive: true, force: true }); });
    const db = getDatabase();
    if (engine === 'postgres') {
      const { initializeStorage } = await import('../server/database/initialize.js');
      await initializeStorage();
      await assert.rejects(() => db.prepare('CREATE TABLE puzoto.forbidden (id integer)').run(), /permission denied/);
      // Role cannot turn off RLS or grant itself another owner's identity.
      await assert.rejects(() => db.prepare('ALTER TABLE puzoto.gastos DISABLE ROW LEVEL SECURITY').run(), /must be owner/);
    }
    const category = await db.prepare('SELECT id FROM categorias ORDER BY id LIMIT 1').get();
    await cards.criarCartao({ nome: 'Cartão sintético', dia_fechamento: 25, dia_vencimento: 5, limite: 3000 });
    const card = (await cards.listarCartoes())[0];
    await cards.criarCompraCartao({ cartao_id: card.id, descricao: 'Compra sintética', valor_total: 300, categoria_id: category.id, data_compra: today, quantidade_parcelas: 3 });
    const installments = await db.prepare('SELECT * FROM parcelas_cartao ORDER BY id').all();
    assert.equal(installments.length, 3);
    assert.equal(installments.reduce((sum, row) => sum + row.valor_parcela, 0), 300);
    const invoice = (await cards.listarFaturasCartao({ cartao_id: card.id }))[0];
    const payments = await Promise.allSettled([cards.marcarFaturaComoPaga(invoice.id), cards.marcarFaturaComoPaga(invoice.id)]);
    assert.equal(payments.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE tipo='CARTAO_FATURA_PAGAR'").get()).n, 1);

    const company = await db.prepare("SELECT * FROM empresas WHERE nome='Diagnóstico'").get();
    const draft = { empresa_id: company.id, empresa_nome: company.nome, quantidade: 1, valor_unitario: 3, data: today };
    const inserted = await lote.adicionarItemLoteTrabalho(draft);
    const edited = await panels.executarComPainel(
      () => lote.atualizarItemLoteTrabalho(inserted.id, { ...draft, quantidade: 4 }),
      panels.obterPainelLancamentos,
    );
    assert.equal(edited.painel.lote.find(row => row.id === inserted.id).total, 12);
    await lote.removerItemLoteTrabalho(inserted.id);
    const workPanel = await panels.obterPainelLancamentos();
    assert.deepEqual(workPanel.lote, await lote.listarLoteTrabalhoPendente());
    assert.deepEqual(workPanel.resumo, await lote.calcularResumoLoteTrabalho());
    assert.deepEqual(workPanel.historico, await closing.listarFechamentosDiarios());
    const saved = await panels.executarComPainel(
      () => ranon.adicionarLaudoRanonPendente({ registro_paciente: '123456', quantidade: 3, valor_unitario: 2, data: today }),
      panels.obterPainelRanon,
    );
    assert.equal(saved.painel.lote.find(row => row.id === saved.id).total, 6);
    assert.deepEqual(saved.painel.lote, await ranon.listarLaudosRanonPendentes());
    await ranon.removerLaudoRanonPendente(saved.id);
    await assert.rejects(() => panels.executarComPainel(
      () => ranon.adicionarLaudoRanonPendente({ registro_paciente: '654321', quantidade: 1, valor_unitario: 2, data: today }),
      async () => { throw new Error('painel indisponível'); },
    ), /painel indisponível/);
    assert.equal((await ranon.listarLaudosRanonPendentes()).length, 0);
    await lote.adicionarItemLoteTrabalho({ empresa_id: company.id, empresa_nome: company.nome, quantidade: 2, valor_unitario: 12.5, data: today, horario: '10:00', observacao: '' });
    const closed = await Promise.all([closing.fecharDiaTrabalho(), closing.fecharDiaTrabalho()]);
    assert.equal(closed.filter(result => result.sucesso).length, 1);
    assert.equal((await lote.listarLoteTrabalhoPendente()).length, 0);
    const entries = await work.listarLancamentosTrabalho({});
    assert.equal(entries.length, 1);
    assert.equal(entries[0].total, 25);
    await Promise.all([work.marcarLancamentoTrabalhoComoRecebido(entries[0].id), work.marcarLancamentoTrabalhoComoRecebido(entries[0].id)]);
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM receitas WHERE vinculado_trabalho=1').get()).n, 1);
    const months = await Promise.all([monthly.fecharMesTrabalho(month, month), monthly.fecharMesTrabalho(month, month)]);
    assert.equal(months.filter(result => result.sucesso).length, 1);
    assert.ok(Array.isArray(await obterRecebimentosPendentes(month)));
    await db.prepare('INSERT INTO laudos_ranon_pendentes (registro_paciente,quantidade,valor_unitario,total,data) VALUES (?,1,2,2,?)').run('SINTETICO', today);
    const reference = `${month.slice(5)}/${month.slice(0, 4)}`;
    const sheets = await Promise.all([salvarPlanilhaRanon(reference), salvarPlanilhaRanon(reference)]);
    assert.equal(sheets.filter(result => result.success).length, 1);
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM laudos_ranon').get()).n, 1);
    assert.equal(fs.readdirSync(path.join(dir, 'backups/laudos_ranon')).length, 1);

    const investment = await savings.criarInvestimento({ nome: 'Teste de concorrência', instituicao: 'Sintética', conta_titular: 'Teste' });
    await savings.registrarMovimentoInvestimento(investment.id, { tipo: 'aporte', valor: 100, data: today });
    const withdrawals = await Promise.allSettled([60, 60].map(valor => savings.registrarMovimentoInvestimento(investment.id, { tipo: 'resgate', valor, data: today })));
    assert.equal(withdrawals.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal((await savings.obterInvestimento(investment.id)).saldo_atual, 40);
    await assert.rejects(() => db.atomic(async () => {
      await db.prepare("INSERT INTO investimentos (nome,instituicao,conta_titular) VALUES ('Reverter','Teste','Teste')").run();
      await db.prepare('INSERT INTO investimento_movimentos (investimento_id,tipo,valor,data) VALUES (?, ?, ?, ?)').run(-999, 'aporte', 1, today);
    }), /foreign key|FOREIGN KEY/);
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM investimentos WHERE nome='Reverter'").get()).n, 0);
    await debt.criarDividaParcelada({ nome_pessoa: 'Pessoa sintética', tipo: 'eu_devo', motivo: 'Teste', valor_parcela: 50, total_parcelas: 1, competencia_inicio: month });
    const group = await db.prepare('SELECT id FROM dividas_parceladas_grupos ORDER BY id LIMIT 1').get();
    const debtPayments = await Promise.allSettled([debt.pagarProximaParcelaDivida(group.id), debt.pagarProximaParcelaDivida(group.id)]);
    assert.equal(debtPayments.filter(result => result.status === 'fulfilled').length, 1);

    const filters = { mes: month, categoria: 'todas', status: 'todos' };
    const expensePanel = await panels.obterPainelGastos(filters);
    assert.deepEqual(expensePanel.gastos, await finances.listarGastos(filters));
    assert.deepEqual(expensePanel.resumo, await finances.calcularResumoGastos(filters));
    const accountsPanel = await panels.obterPainelContasPagar(filters);
    assert.deepEqual(accountsPanel.contas, await accounts.listarContasPagar(filters));
    assert.deepEqual(accountsPanel.resumo, await accounts.calcularResumoContasPagar(month));
    const incomePanel = await panels.obterPainelReceitas({ ...filters, origem: 'todas' });
    assert.deepEqual(incomePanel.receitas, await income.listarReceitas(filters));
    assert.deepEqual(incomePanel.resumo, await income.calcularResumoReceitas(month));
    const savingsPanel = await panels.obterPainelInvestimentos(true);
    assert.deepEqual(savingsPanel.investimentos, await savings.listarInvestimentos(true));
    assert.deepEqual(savingsPanel.movimentos, await savings.listarMovimentosInvestimento(savingsPanel.investimentos[0].id));

    const exported = await exportarJSON();
    assert.equal(exported._meta.totalTabelas, 23);
    const totals = {
      invoices: exported.faturas_cartao.map(row => [row.competencia, row.total, row.status]),
      work: exported.lancamentos_trabalho.map(row => [row.total, row.status]),
      income: exported.receitas.reduce((sum, row) => sum + row.valor, 0),
      debt: exported.pessoas_dividas.reduce((sum, row) => sum + row.valor, 0),
      savings: (await savings.obterInvestimento(investment.id)).saldo_atual,
    };
    if (engine === 'sqlite') sqliteTotals = totals;
    else assert.deepEqual(totals, sqliteTotals);
  });
}
