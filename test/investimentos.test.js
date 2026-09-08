import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'puzoto-cofre-'));
const tempDb = path.join(tempDir, 'cofre-test.db');
process.env.PUZOTO_LIFE_DB_PATH = tempDb;
process.env.NODE_ENV = 'test';

let initializeDatabase;
let initializeInvestimentosSchema;
let getDatabase;
let closeDatabase;
let investimentos;
let obterDashboard;
let obterRelatorioFinancas;
let obterRelatorioGeral;
let obterComparativoMensal;
let criarContaPagar;
let hoje;
let mesAtual;

function totalPago(resumo) {
  return resumo.gastos_pagos + resumo.cartoes_pagos + resumo.contas_pagas;
}

before(async () => {
  const { initializeTestDatabase } = await import('./support/database.js');
  await initializeTestDatabase(process.env.TEST_DATABASE_ENGINE || 'sqlite');
  ({ initializeDatabase, initializeInvestimentosSchema } = await import('../server/database/init.js'));
  ({ getDatabase, closeDatabase } = await import('../server/database/connection.js'));
  investimentos = await import('../server/services/investimentos.js');
  ({ obterDashboard } = await import('../server/services/dashboard.js'));
  ({ obterRelatorioFinancas } = await import('../server/services/relatorioFinancas.js'));
  ({ obterRelatorioGeral } = await import('../server/services/relatorioGeral.js'));
  ({ obterComparativoMensal } = await import('../server/services/comparativoMensal.js'));
  ({ criarContaPagar } = await import('../server/services/contasPagar.js'));
  hoje = (await import('../server/utils/dataLocal.js')).dataHojeLocal();
  mesAtual = hoje.slice(0, 7);
});

after(async () => {
  (await closeDatabase());
  for (const arquivo of [tempDb, `${tempDb}-wal`, `${tempDb}-shm`]) {
    if (fs.existsSync(arquivo)) fs.unlinkSync(arquivo);
  }
  fs.rmdirSync(tempDir);
  delete process.env.PUZOTO_LIFE_DB_PATH;
});

test('migration de investimentos permanece idempotente', async () => {
  if (process.env.TEST_DATABASE_ENGINE !== 'postgres') {
    initializeDatabase();
    initializeInvestimentosSchema();
    initializeInvestimentosSchema();
  }

  const db = getDatabase();
  const tabelas = (await db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name IN ('investimentos', 'investimento_movimentos')
    ORDER BY name
  `).all());
  assert.deepEqual(tabelas.map(item => item.name), ['investimento_movimentos', 'investimentos']);
});

test('fluxo financeiro do Cofre preserva indicadores e recorrências', async (t) => {
  const db = getDatabase();
  const categoria = (await db.prepare("SELECT id FROM categorias WHERE tipo IN ('gasto', 'ambos') LIMIT 1").get());
  (await criarContaPagar({
    nome: 'Conta recorrente de controle', valor: 80, vencimento: `${mesAtual}-08`,
    categoria_id: categoria.id, recorrente: true, frequencia: 'mensal', quantidade: 3
  }));
  const recorrenciasAntes = (await db.prepare(`
    SELECT id, nome, valor, vencimento, status, grupo_recorrencia_id
    FROM contas_pagar ORDER BY id
  `).all());

  const base = (await obterDashboard(mesAtual)).resumo;
  const baseRelatorioFinancas = (await obterRelatorioFinancas(mesAtual)).resumo;
  const baseRelatorioGeral = (await obterRelatorioGeral(mesAtual)).resumo;
  const baseComparativo = (await obterComparativoMensal(mesAtual, mesAtual)).meses[0];
  const investimento = (await investimentos.criarInvestimento({
    nome: 'Porquinho Inter', instituicao: 'Banco Inter', conta_titular: 'conta da esposa'
  }));
  assert.equal(investimento.saldo_atual, 0);

  await t.test('metadados continuam editáveis e Cofre inativo bloqueia movimentos', async () => {
    const editado = (await investimentos.atualizarInvestimento(investimento.id, {
      nome: 'Porquinho Inter', instituicao: 'Banco Inter', conta_titular: 'conta da esposa'
    }));
    assert.equal(editado.conta_titular, 'conta da esposa');
    (await investimentos.definirInvestimentoAtivo(investimento.id, false));
    await assert.rejects(async () => (await investimentos.registrarMovimentoInvestimento(investimento.id, {
      tipo: 'aporte', valor: 1, data: hoje
    })), /inativo/);
    (await investimentos.definirInvestimentoAtivo(investimento.id, true));
  });

  await t.test('guardar R$ 669 reduz Saldo Real uma vez sem alterar os demais indicadores', async () => {
    (await investimentos.registrarMovimentoInvestimento(investimento.id, {
      tipo: 'aporte', valor: 669, data: hoje, observacao: 'Dinheiro guardado'
    }));
    const atual = (await obterDashboard(mesAtual)).resumo;
    assert.equal(atual.saldo_investido_atual, 669);
    assert.equal(atual.saldo_atual, base.saldo_atual - 669);
    assert.equal(atual.saldo_previsto, base.saldo_previsto - 669);
    assert.equal(atual.receitas_recebidas, base.receitas_recebidas);
    assert.equal(atual.trabalho_produzido, base.trabalho_produzido);
    assert.equal(totalPago(atual), totalPago(base));
    assert.equal(atual.comprometido, base.comprometido);
  });

  await t.test('correção vazia ou para zero não grava sem confirmação explícita', async () => {
    const quantidadeAntes = (await investimentos.listarMovimentosInvestimento(investimento.id)).length;
    await assert.rejects(async () => (await investimentos.ajustarSaldoInvestimento(investimento.id, {
      saldo_correto: '', data: hoje
    })), /explicitamente|Informe/);
    await assert.rejects(async () => (await investimentos.ajustarSaldoInvestimento(investimento.id, {
      saldo_correto: 0, data: hoje
    })), /Confirme explicitamente/);
    assert.equal((await investimentos.listarMovimentosInvestimento(investimento.id)).length, quantidadeAntes);
    assert.equal((await investimentos.obterInvestimento(investimento.id)).saldo_atual, 669);
  });

  await t.test('retirar R$ 200 devolve ao Saldo Real sem alterar Recebido ou Total Pago', async () => {
    const antes = (await obterDashboard(mesAtual)).resumo;
    (await investimentos.registrarMovimentoInvestimento(investimento.id, {
      tipo: 'resgate', valor: 200, data: hoje, observacao: 'Dinheiro retirado'
    }));
    const atual = (await obterDashboard(mesAtual)).resumo;
    assert.equal(atual.saldo_investido_atual, 469);
    assert.equal(atual.saldo_atual, antes.saldo_atual + 200);
    assert.equal(atual.saldo_previsto, antes.saldo_previsto + 200);
    assert.equal(atual.receitas_recebidas, antes.receitas_recebidas);
    assert.equal(atual.trabalho_produzido, antes.trabalho_produzido);
    assert.equal(totalPago(atual), totalPago(antes));
    assert.equal(atual.comprometido, antes.comprometido);
  });

  await t.test('rendimento interno legado continua sem alterar caixa ou Recebido', async () => {
    const antes = (await obterDashboard(mesAtual)).resumo;
    (await investimentos.registrarMovimentoInvestimento(investimento.id, {
      tipo: 'rendimento', valor: 10, data: hoje, observacao: 'Rendimento legado'
    }));
    const atual = (await obterDashboard(mesAtual)).resumo;
    assert.equal(atual.saldo_investido_atual, 479);
    assert.equal(atual.saldo_atual, antes.saldo_atual);
    assert.equal(atual.receitas_recebidas, antes.receitas_recebidas);
    assert.equal(totalPago(atual), totalPago(antes));
  });

  await t.test('retirada superior ao saldo é rejeitada sem gravar movimento', async () => {
    const quantidadeAntes = (await investimentos.listarMovimentosInvestimento(investimento.id)).length;
    await assert.rejects(async () => (await investimentos.registrarMovimentoInvestimento(investimento.id, {
      tipo: 'resgate', valor: 999, data: hoje
    })), /superior ao saldo|saldo investido negativo/);
    assert.equal((await investimentos.listarMovimentosInvestimento(investimento.id)).length, quantidadeAntes);
  });

  await t.test('correção confirmada registra a diferença sem alterar o caixa', async () => {
    const antes = (await obterDashboard(mesAtual)).resumo;
    const ajuste = (await investimentos.ajustarSaldoInvestimento(investimento.id, {
      saldo_correto: 484, data: hoje, confirmar_correcao: true
    }));
    const atual = (await obterDashboard(mesAtual)).resumo;
    assert.equal(ajuste.tipo, 'ajuste');
    assert.equal(ajuste.valor, 5);
    assert.equal(atual.saldo_investido_atual, 484);
    assert.equal(atual.saldo_atual, antes.saldo_atual);
  });

  await t.test('correção menor registra diferença negativa e saldo idêntico não duplica', async () => {
    const ajuste = (await investimentos.ajustarSaldoInvestimento(investimento.id, {
      saldo_correto: 469, data: hoje, confirmar_correcao: true
    }));
    assert.equal(ajuste.valor, -15);
    const quantidadeAntes = (await investimentos.listarMovimentosInvestimento(investimento.id)).length;
    const semMudanca = (await investimentos.ajustarSaldoInvestimento(investimento.id, {
      saldo_correto: 469, data: hoje
    }));
    assert.equal(semMudanca.movimento_criado, false);
    assert.equal((await investimentos.listarMovimentosInvestimento(investimento.id)).length, quantidadeAntes);
  });

  await t.test('Dashboard mostra visualmente o saldo atual e ignora a competência no Cofre', async () => {
    const historico = (await investimentos.listarMovimentosInvestimento(investimento.id));
    assert.equal(historico.length, 5);
    assert.equal(historico[0].saldo_resultante, 469);
    const dashboardAtual = (await obterDashboard(mesAtual)).resumo;
    const dashboardHistorico = (await obterDashboard('2026-01')).resumo;
    assert.equal(dashboardAtual.saldo_investido_atual, 469);
    assert.equal(dashboardHistorico.saldo_investido_atual, 469);
    assert.equal(dashboardHistorico.saldo_investido_na_competencia, 0);

    const dashboardFrontend = fs.readFileSync(path.resolve('src/pages/dashboard.js'), 'utf8');
    assert.match(dashboardFrontend, /id="hero-cofre"/);
    assert.match(dashboardFrontend, /Guardado no Inter/);
    assert.match(dashboardFrontend, /resumo\.saldo_investido_atual/);
    assert.doesNotMatch(dashboardFrontend, /id="card-investido"/);

    const cofreFrontend = fs.readFileSync(path.resolve('src/pages/investimentos.js'), 'utf8');
    assert.match(cofreFrontend, /Guardar dinheiro/);
    assert.match(cofreFrontend, /Retirar dinheiro/);
    assert.match(cofreFrontend, /Corrigir saldo/);
    assert.match(cofreFrontend, /id="cofre-aporte-valor"/);
    assert.match(cofreFrontend, /id="cofre-resgate-valor"/);
    assert.match(cofreFrontend, /confirmarOperacaoCofre\('aporte'\)/);
    assert.match(cofreFrontend, /confirmarOperacaoCofre\('resgate'\)/);
    assert.doesNotMatch(cofreFrontend, /cofre-modal-operacao/);
    assert.match(cofreFrontend, /cofre-correcao-preview-diferenca/);
    assert.match(cofreFrontend, /confirmar_correcao: true/);
    assert.match(cofreFrontend, /O valor mudou\. Revise novamente antes de confirmar\./);
    assert.doesNotMatch(cofreFrontend, /<option value="rendimento"/);
  });

  await t.test('Saldo Real permanece consistente nos relatórios existentes', async () => {
    const relatorioFinancas = (await obterRelatorioFinancas(mesAtual)).resumo;
    const relatorioGeral = (await obterRelatorioGeral(mesAtual)).resumo;
    const comparativo = (await obterComparativoMensal(mesAtual, mesAtual)).meses[0];
    assert.equal(relatorioFinancas.saldo_real, baseRelatorioFinancas.saldo_real - 469);
    assert.equal(relatorioGeral.saldo_real, baseRelatorioGeral.saldo_real - 469);
    assert.equal(comparativo.saldo_real, baseComparativo.saldo_real - 469);
  });

  await t.test('recorrências de contas a pagar permanecem intactas', async () => {
    const recorrenciasDepois = (await db.prepare(`
      SELECT id, nome, valor, vencimento, status, grupo_recorrencia_id
      FROM contas_pagar ORDER BY id
    `).all());
    assert.deepEqual(recorrenciasDepois, recorrenciasAntes);
  });
});

test('cartão escolhido permanece selecionado depois de registrar compra', () => {
  const cartoesFrontend = fs.readFileSync(path.resolve('src/pages/cartoes.js'), 'utf8');
  assert.match(cartoesFrontend, /export function restaurarCartaoSelecionado\(selectElement, cartaoId\)/);
  assert.match(cartoesFrontend, /await initCartoes\(\);\s*restaurarCartaoSelecionado\(document\.getElementById\('form-compra-cartao'\), cartao_id\)/);
  const helper = cartoesFrontend.match(/export function restaurarCartaoSelecionado[\s\S]*?\n}/)?.[0] || '';
  assert.doesNotMatch(helper, /Inter|Caixa/);
});
