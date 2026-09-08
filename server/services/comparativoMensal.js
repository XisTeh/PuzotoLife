import { snapshot } from '../database/connection.js';
import { getDatabase } from '../database/connection.js';
import { obterResumoInvestimentosDashboard } from './investimentos.js';

export async function obterComparativoMensal(inicio, fim) {
  return snapshot(async () => {
  const db = getDatabase();

  // Helper para gerar os últimos N meses se início e fim não forem fornecidos
  let mesesQuery = [];
  if (inicio && fim) {
    let atual = new Date(`${inicio}-01T00:00:00`);
    const dataFim = new Date(`${fim}-01T00:00:00`);
    while (atual <= dataFim) {
      const mesStr = `${atual.getFullYear()}-${String(atual.getMonth() + 1).padStart(2, '0')}`;
      mesesQuery.push(mesStr);
      atual.setMonth(atual.getMonth() + 1);
    }
  } else {
    // Últimos 6 meses
    const hoje = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      mesesQuery.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
  }

  // Formatador para os labels (Ex: Mai/2026)
  const mesesNomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

  const meses = [];

  for (const mes of mesesQuery) {
    const [ano, mesNum] = mes.split('-');
    const label = `${mesesNomes[parseInt(mesNum, 10) - 1]}/${ano}`;
    const investimentos = (await obterResumoInvestimentosDashboard(mes));

    // 1. Trabalho produzido
    const trabalhoProd = (await db.prepare(`
      SELECT COALESCE(SUM(total), 0) as total 
      FROM lancamentos_trabalho
      WHERE data LIKE ? AND status != 'cancelado'
    `).get(`${mes}%`)).total;

    const ranonProdClosed = (await db.prepare(`
      SELECT COALESCE(SUM(total), 0) as total FROM laudos_ranon WHERE data LIKE ? AND status != 'cancelado'
    `).get(`${mes}%`)).total;

    const ranonProdPend = (await db.prepare(`
      SELECT COALESCE(SUM(total), 0) as total FROM laudos_ranon_pendentes WHERE data LIKE ?
    `).get(`${mes}%`)).total;

    const ranonProd = ranonProdClosed + ranonProdPend;

    const trabalho_produzido = trabalhoProd + ranonProd;

    // 2. Trabalho recebido
    const trabalhoRec = (await db.prepare(`
      SELECT COALESCE(SUM(total), 0) as total 
      FROM lancamentos_trabalho
      WHERE data LIKE ? AND status = 'recebido'
    `).get(`${mes}%`)).total;

    const ranonRec = (await db.prepare(`
      SELECT COALESCE(SUM(total), 0) as total FROM laudos_ranon WHERE data LIKE ? AND status = 'recebido'
    `).get(`${mes}%`)).total;

    const trabalho_recebido = trabalhoRec + ranonRec;

    // 3. Trabalho a receber
    const trabalho_a_receber = trabalho_produzido - trabalho_recebido;

    // 4. Receitas recebidas
    const receitas_recebidas = (await db.prepare(`
      SELECT COALESCE(SUM(valor), 0) as total FROM receitas WHERE data LIKE ? AND status = 'recebido'
    `).get(`${mes}%`)).total;

    // 5. Receitas previstas
    const receitas_previstas = (await db.prepare(`
      SELECT COALESCE(SUM(valor), 0) as total FROM receitas WHERE data LIKE ? AND status = 'previsto'
    `).get(`${mes}%`)).total;

    // 6. Gastos pagos
    const gastos_pagos = (await db.prepare(`
      SELECT COALESCE(SUM(valor), 0) as total FROM gastos WHERE data LIKE ? AND status = 'pago'
    `).get(`${mes}%`)).total;

    // Gastos pendentes (para comprometido)
    const gastos_pendentes = (await db.prepare(`
      SELECT COALESCE(SUM(valor), 0) as total FROM gastos WHERE data LIKE ? AND status = 'pendente'
    `).get(`${mes}%`)).total;

    // 7. Cartões total
    const cartoes_total = (await db.prepare(`
      SELECT COALESCE(SUM(total), 0) as total FROM faturas_cartao WHERE competencia = ? AND status != 'cancelada'
    `).get(mes)).total;

    // Cartões não pagos (para comprometido)
    const faturas_nao_pagas = (await db.prepare(`
      SELECT COALESCE(SUM(total), 0) as total FROM faturas_cartao WHERE competencia = ? AND status IN ('aberta', 'fechada')
    `).get(mes)).total;

    const faturas_pagas = (await db.prepare(`
      SELECT COALESCE(SUM(total), 0) as total FROM faturas_cartao WHERE competencia = ? AND status = 'paga'
    `).get(mes)).total;

    // 8. Contas pagas
    const contas_pagas = (await db.prepare(`
      SELECT COALESCE(SUM(valor), 0) as total FROM contas_pagar WHERE vencimento LIKE ? AND status = 'pago'
    `).get(`${mes}%`)).total;

    // 9. Contas pendentes
    const contas_pendentes = (await db.prepare(`
      SELECT COALESCE(SUM(valor), 0) as total FROM contas_pagar WHERE vencimento LIKE ? AND status = 'pendente'
    `).get(`${mes}%`)).total;

    // 10. Eu devo
    let eu_devo = (await db.prepare(`
      SELECT COALESCE(SUM(valor), 0) as total FROM pessoas_dividas WHERE tipo = 'eu_devo' AND status = 'pendente' AND data_combinada LIKE ?
    `).get(`${mes}%`)).total;

    // 11. Me devem
    let me_devem = (await db.prepare(`
      SELECT COALESCE(SUM(valor), 0) as total FROM pessoas_dividas WHERE tipo = 'me_deve' AND status = 'pendente' AND data_combinada LIKE ?
    `).get(`${mes}%`)).total;

    // Somar a parcela correspondente do mês das dívidas parceladas ativas se pendentes
    const dp_ativas = (await db.prepare(`
      SELECT * FROM dividas_parceladas_grupos WHERE status = 'ativa'
    `).all());
    
    dp_ativas.forEach(grupo => {
      const [anoI, mesI] = grupo.competencia_inicio.split('-');
      const [anoF, mesF] = mes.split('-');
      const diffMeses = (Number(anoF) - Number(anoI)) * 12 + (Number(mesF) - Number(mesI));
      const numParcela = diffMeses + 1;

      if (numParcela >= 1 && numParcela <= grupo.total_parcelas) {
        if (numParcela > grupo.parcelas_pagas) {
          let valorParcela = grupo.valor_parcela;
          if (grupo.id === 4 && numParcela === 1 && mes === '2026-06') {
            valorParcela = 194.57; // Exceção para Meu Peixe no mês 6
          }

          if (grupo.tipo === 'eu_devo') {
            eu_devo += valorParcela;
          } else if (grupo.tipo === 'me_deve') {
            me_devem += valorParcela;
          }
        }
      }
    });

    // 12. Entradas total
    const entradas_total = receitas_recebidas + receitas_previstas + trabalho_a_receber + me_devem;

    // 13. Saídas total
    const saidas_total = gastos_pagos + cartoes_total + contas_pagas + contas_pendentes + eu_devo;

    // 14. Comprometido
    const comprometido = contas_pendentes + eu_devo + faturas_nao_pagas + gastos_pendentes;

    // Calcular saldo acumulado de meses anteriores (carryover) para este mês
    const receitas_recebidas_ant = (await db.prepare(`
      SELECT COALESCE(SUM(valor), 0) as total FROM receitas WHERE status = 'recebido' AND data < ?
    `).get(`${mes}-01`)).total;

    const gastos_pagos_ant = (await db.prepare(`
      SELECT COALESCE(SUM(valor), 0) as total FROM gastos WHERE status = 'pago' AND data < ?
    `).get(`${mes}-01`)).total;

    const cartoes_pagos_ant = (await db.prepare(`
      SELECT COALESCE(SUM(total), 0) as total FROM faturas_cartao WHERE status = 'paga' AND competencia < ?
    `).get(mes)).total;

    const contas_pagas_ant = (await db.prepare(`
      SELECT COALESCE(SUM(valor), 0) as total FROM contas_pagar WHERE status = 'pago' AND vencimento < ?
    `).get(`${mes}-01`)).total;

    // Dívidas pessoais pagas/recebidas em meses anteriores (impactam o caixa)
    const dividas_pagas_ant = (await db.prepare(`
      SELECT COALESCE(SUM(valor), 0) as total FROM pessoas_dividas 
      WHERE tipo = 'eu_devo' AND status = 'pago' AND pago_recebido_em < ? AND pago_recebido_em >= '2026-06-01'
    `).get(`${mes}-01`)).total;

    const dividas_recebidas_ant = (await db.prepare(`
      SELECT COALESCE(SUM(valor), 0) as total FROM pessoas_dividas 
      WHERE tipo = 'me_deve' AND status = 'recebido' AND pago_recebido_em < ? AND pago_recebido_em >= '2026-06-01'
    `).get(`${mes}-01`)).total;

    const saldo_anterior = receitas_recebidas_ant + dividas_recebidas_ant - gastos_pagos_ant - cartoes_pagos_ant - contas_pagas_ant - dividas_pagas_ant + investimentos.impacto_caixa_anterior;

    // Dívidas pessoais pagas/recebidas neste mês (impactam o caixa atual)
    const dividas_pagas_mes = (await db.prepare(`
      SELECT COALESCE(SUM(valor), 0) as total FROM pessoas_dividas 
      WHERE tipo = 'eu_devo' AND status = 'pago' AND pago_recebido_em LIKE ? AND pago_recebido_em >= '2026-06-01'
    `).get(`${mes}%`)).total;

    const dividas_recebidas_mes = (await db.prepare(`
      SELECT COALESCE(SUM(valor), 0) as total FROM pessoas_dividas 
      WHERE tipo = 'me_deve' AND status = 'recebido' AND pago_recebido_em LIKE ? AND pago_recebido_em >= '2026-06-01'
    `).get(`${mes}%`)).total;

    // 15. Saldo real
    const saldo_real = saldo_anterior + receitas_recebidas + dividas_recebidas_mes - gastos_pagos - contas_pagas - faturas_pagas - dividas_pagas_mes + investimentos.impacto_caixa_mes;

    // 16. Saldo previsto
    const saldo_previsto = saldo_anterior + entradas_total - saidas_total + investimentos.impacto_caixa_mes;

    meses.push({
      mes,
      label,
      trabalho_produzido,
      trabalho_recebido,
      trabalho_a_receber,
      receitas_recebidas,
      receitas_previstas,
      gastos_pagos,
      cartoes_total,
      contas_pagas,
      contas_pendentes,
      eu_devo,
      me_devem,
      entradas_total,
      saidas_total,
      comprometido,
      saldo_real,
      saldo_previsto
    });
  }

  // Resumo geral
  let melhor_mes_saldo = { mes: null, label: null, valor: -Infinity };
  let pior_mes_saldo = { mes: null, label: null, valor: Infinity };
  let maior_producao = { mes: null, label: null, valor: -Infinity };
  let maior_gasto = { mes: null, label: null, valor: -Infinity };

  let somaReceitas = 0;
  let somaDespesas = 0;
  let somaSaldoPrev = 0;

  meses.forEach(m => {
    if (m.saldo_previsto > melhor_mes_saldo.valor) {
      melhor_mes_saldo = { mes: m.mes, label: m.label, valor: m.saldo_previsto };
    }
    if (m.saldo_previsto < pior_mes_saldo.valor) {
      pior_mes_saldo = { mes: m.mes, label: m.label, valor: m.saldo_previsto };
    }
    if (m.trabalho_produzido > maior_producao.valor) {
      maior_producao = { mes: m.mes, label: m.label, valor: m.trabalho_produzido };
    }
    if (m.saidas_total > maior_gasto.valor) {
      maior_gasto = { mes: m.mes, label: m.label, valor: m.saidas_total };
    }

    somaReceitas += m.entradas_total;
    somaDespesas += m.saidas_total;
    somaSaldoPrev += m.saldo_previsto;
  });

  const numMeses = meses.length || 1;

  // Ajustes caso não haja dados
  if (melhor_mes_saldo.valor === -Infinity) melhor_mes_saldo = null;
  if (pior_mes_saldo.valor === Infinity) pior_mes_saldo = null;
  if (maior_producao.valor === -Infinity) maior_producao = null;
  if (maior_gasto.valor === -Infinity) maior_gasto = null;

  const resumo = {
    melhor_mes_saldo,
    pior_mes_saldo,
    maior_producao,
    maior_gasto,
    media_receitas: somaReceitas / numMeses,
    media_despesas: somaDespesas / numMeses,
    media_saldo_previsto: somaSaldoPrev / numMeses
  };

  return {
    success: true,
    periodo: {
      inicio: mesesQuery[0],
      fim: mesesQuery[mesesQuery.length - 1]
    },
    meses,
    resumo
  };
  });
}
