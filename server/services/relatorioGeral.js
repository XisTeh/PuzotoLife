import { getDatabase } from '../database/connection.js';
import { dataHojeLocal, dataFuturaLocal } from '../utils/dataLocal.js';
import { obterResumoInvestimentosDashboard } from './investimentos.js';

export function obterRelatorioGeral(mes) {
  const db = getDatabase();
  const hoje = dataHojeLocal();
  const investimentos = obterResumoInvestimentosDashboard(mes);

  // 1. Trabalho Produzido e Recebido (Histórico bruto)
  const trabProd = db.prepare(`
    SELECT COALESCE(SUM(total), 0) as total 
    FROM lancamentos_trabalho
    WHERE data LIKE ? AND status != 'cancelado'
  `).get(`${mes}%`).total;
  const ranonProdClosed = db.prepare(`SELECT COALESCE(SUM(total), 0) as total FROM laudos_ranon WHERE data LIKE ? AND status != 'cancelado'`).get(`${mes}%`).total;
  const ranonProdPend = db.prepare(`SELECT COALESCE(SUM(total), 0) as total FROM laudos_ranon_pendentes WHERE data LIKE ?`).get(`${mes}%`).total;
  const ranonProd = ranonProdClosed + ranonProdPend;
  const trabalho_produzido = trabProd + ranonProd;

  const trabRec = db.prepare(`
    SELECT COALESCE(SUM(total), 0) as total 
    FROM lancamentos_trabalho
    WHERE data LIKE ? AND status = 'recebido'
  `).get(`${mes}%`).total;
  const ranonRec = db.prepare(`SELECT COALESCE(SUM(total), 0) as total FROM laudos_ranon WHERE data LIKE ? AND status = 'recebido'`).get(`${mes}%`).total;
  const trabalho_recebido = trabRec + ranonRec;
  
  const trabalho_a_receber = trabalho_produzido - trabalho_recebido;

  // 2. Entradas
  const entradas_recebidas = db.prepare(`SELECT COALESCE(SUM(valor), 0) as total FROM receitas WHERE data LIKE ? AND status = 'recebido'`).get(`${mes}%`).total;
  const receitas_previstas = db.prepare(`SELECT COALESCE(SUM(valor), 0) as total FROM receitas WHERE data LIKE ? AND status = 'previsto'`).get(`${mes}%`).total;
  let me_devem = db.prepare(`SELECT COALESCE(SUM(valor), 0) as total FROM pessoas_dividas WHERE tipo = 'me_deve' AND status = 'pendente'`).get().total; // total pendente global
  
  // Somar apenas a parcela pendente do mês atual das dívidas parceladas ativas (me_devem)
  const dp_ativas_me = db.prepare(`
    SELECT * FROM dividas_parceladas_grupos WHERE status = 'ativa' AND tipo = 'me_deve'
  `).all();
  dp_ativas_me.forEach(grupo => {
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
        me_devem += valorParcela;
      }
    }
  });

  const entradas_previstas = receitas_previstas + trabalho_a_receber + me_devem;
  const total_entradas_potenciais = entradas_recebidas + entradas_previstas;

  // 3. Saídas Pagas
  const gastos_pagos = db.prepare(`SELECT COALESCE(SUM(valor), 0) as total FROM gastos WHERE data LIKE ? AND status = 'pago'`).get(`${mes}%`).total;
  const contas_pagas = db.prepare(`SELECT COALESCE(SUM(valor), 0) as total FROM contas_pagar WHERE vencimento LIKE ? AND status = 'pago'`).get(`${mes}%`).total;
  const cartoes_pagos = db.prepare(`SELECT COALESCE(SUM(total), 0) as total FROM faturas_cartao WHERE competencia = ? AND status = 'paga'`).get(mes).total;
  
  const saidas_pagas = gastos_pagos + contas_pagas + cartoes_pagos;

  // 4. Saídas Pendentes
  const gastos_pendentes = db.prepare(`SELECT COALESCE(SUM(valor), 0) as total FROM gastos WHERE data LIKE ? AND status = 'pendente'`).get(`${mes}%`).total;
  const contas_pendentes = db.prepare(`SELECT COALESCE(SUM(valor), 0) as total FROM contas_pagar WHERE vencimento LIKE ? AND status IN ('pendente', 'atrasado')`).get(`${mes}%`).total;
  const cartoes_abertos = db.prepare(`SELECT COALESCE(SUM(total), 0) as total FROM faturas_cartao WHERE competencia = ? AND status IN ('aberta', 'fechada')`).get(mes).total;
  let eu_devo = db.prepare(`SELECT COALESCE(SUM(valor), 0) as total FROM pessoas_dividas WHERE tipo = 'eu_devo' AND status = 'pendente'`).get().total; // total pendente global

  // Somar apenas a parcela pendente do mês atual das dívidas parceladas ativas (eu_devo)
  const dp_ativas_eu = db.prepare(`
    SELECT * FROM dividas_parceladas_grupos WHERE status = 'ativa' AND tipo = 'eu_devo'
  `).all();
  dp_ativas_eu.forEach(grupo => {
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
        eu_devo += valorParcela;
      }
    }
  });

  const saidas_pendentes = gastos_pendentes + contas_pendentes + cartoes_abertos + eu_devo;
  const total_saidas_potenciais = saidas_pagas + saidas_pendentes;

  // 5. Saldos e Comprometimento
  // Calcular saldo acumulado de meses anteriores (carryover)
  const receitas_recebidas_ant = db.prepare(`
    SELECT COALESCE(SUM(valor), 0) as total FROM receitas WHERE status = 'recebido' AND data < ?
  `).get(`${mes}-01`).total;

  const gastos_pagos_ant = db.prepare(`
    SELECT COALESCE(SUM(valor), 0) as total FROM gastos WHERE status = 'pago' AND data < ?
  `).get(`${mes}-01`).total;

  const cartoes_pagos_ant = db.prepare(`
    SELECT COALESCE(SUM(total), 0) as total FROM faturas_cartao WHERE status = 'paga' AND competencia < ?
  `).get(mes).total;

  const contas_pagas_ant = db.prepare(`
    SELECT COALESCE(SUM(valor), 0) as total FROM contas_pagar WHERE status = 'pago' AND vencimento < ?
  `).get(`${mes}-01`).total;

  // Dívidas pessoais pagas/recebidas em meses anteriores (impactam o caixa)
  const dividas_pagas_ant = db.prepare(`
    SELECT COALESCE(SUM(valor), 0) as total FROM pessoas_dividas 
    WHERE tipo = 'eu_devo' AND status = 'pago' AND pago_recebido_em < ? AND pago_recebido_em >= '2026-06-01'
  `).get(`${mes}-01`).total;

  const dividas_recebidas_ant = db.prepare(`
    SELECT COALESCE(SUM(valor), 0) as total FROM pessoas_dividas 
    WHERE tipo = 'me_deve' AND status = 'recebido' AND pago_recebido_em < ? AND pago_recebido_em >= '2026-06-01'
  `).get(`${mes}-01`).total;

  const saldo_anterior = receitas_recebidas_ant + dividas_recebidas_ant - gastos_pagos_ant - cartoes_pagos_ant - contas_pagas_ant - dividas_pagas_ant + investimentos.impacto_caixa_anterior;

  // Dívidas pessoais pagas/recebidas neste mês (impactam o caixa atual)
  const dividas_pagas_mes = db.prepare(`
    SELECT COALESCE(SUM(valor), 0) as total FROM pessoas_dividas 
    WHERE tipo = 'eu_devo' AND status = 'pago' AND pago_recebido_em LIKE ? AND pago_recebido_em >= '2026-06-01'
  `).get(`${mes}%`).total;

  const dividas_recebidas_mes = db.prepare(`
    SELECT COALESCE(SUM(valor), 0) as total FROM pessoas_dividas 
    WHERE tipo = 'me_deve' AND status = 'recebido' AND pago_recebido_em LIKE ? AND pago_recebido_em >= '2026-06-01'
  `).get(`${mes}%`).total;

  const saldo_real = saldo_anterior + entradas_recebidas + dividas_recebidas_mes - saidas_pagas - dividas_pagas_mes + investimentos.impacto_caixa_mes;
  const comprometido = saidas_pendentes;
  const saldo_previsto = saldo_anterior + total_entradas_potenciais - total_saidas_potenciais + investimentos.impacto_caixa_mes;

  // ==========================================
  // GRÁFICOS / COMPARATIVOS
  // ==========================================
  const distribuicao_saidas = [
    { nome: 'Gastos Avulsos', valor: gastos_pagos + gastos_pendentes },
    { nome: 'Faturas de Cartão', valor: cartoes_pagos + cartoes_abertos },
    { nome: 'Contas a Pagar', valor: contas_pagas + contas_pendentes },
    { nome: 'Pessoas / Dívidas', valor: eu_devo }
  ].filter(i => i.valor > 0);

  const gastos_por_categoria = db.prepare(`
    SELECT categoria_nome as nome, SUM(valor) as valor 
    FROM gastos 
    WHERE data LIKE ? 
    GROUP BY categoria_nome
    ORDER BY valor DESC
  `).all(`${mes}%`);

  const receitas_por_origem = db.prepare(`
    SELECT origem as nome, SUM(valor) as valor 
    FROM receitas 
    WHERE data LIKE ? 
    GROUP BY origem
    ORDER BY valor DESC
  `).all(`${mes}%`);

  // ==========================================
  // RANKINGS
  // ==========================================
  const maiores_gastos = db.prepare(`
    SELECT descricao, categoria_nome as categoria, valor, data 
    FROM gastos 
    WHERE data LIKE ? 
    ORDER BY valor DESC LIMIT 5
  `).all(`${mes}%`);

  const maiores_receitas = db.prepare(`
    SELECT descricao, origem, valor, data 
    FROM receitas 
    WHERE data LIKE ? 
    ORDER BY valor DESC LIMIT 5
  `).all(`${mes}%`);

  const limiteStr = dataFuturaLocal(15);

  const alertas_contas = db.prepare(`
    SELECT 'Conta' as tipo, nome as descricao, valor, vencimento as data 
    FROM contas_pagar 
    WHERE status = 'pendente' AND vencimento <= ?
  `).all(limiteStr);

  const alertas_faturas = db.prepare(`
    SELECT 'Fatura' as tipo, cartao_nome as descricao, total as valor, vencimento as data 
    FROM faturas_cartao 
    WHERE status IN ('aberta', 'fechada') AND vencimento <= ?
  `).all(limiteStr);

  const alertas_pessoas = db.prepare(`
    SELECT 'Pessoa' as tipo, nome_pessoa as descricao, valor, data_combinada as data 
    FROM pessoas_dividas 
    WHERE status = 'pendente' AND data_combinada <= ? AND tipo = 'eu_devo'
  `).all(limiteStr);

  let proximos_vencimentos = [...alertas_contas, ...alertas_faturas, ...alertas_pessoas];
  proximos_vencimentos.sort((a, b) => new Date(a.data) - new Date(b.data));
  proximos_vencimentos = proximos_vencimentos.slice(0, 10); // Top 10 próximos

  return {
    success: true,
    mes,
    resumo: {
      entradas_recebidas,
      entradas_previstas,
      total_entradas_potenciais,

      saidas_pagas,
      saidas_pendentes,
      total_saidas_potenciais,

      trabalho_produzido,
      trabalho_recebido,
      trabalho_a_receber,

      saldo_real,
      saldo_previsto,
      comprometido
    },
    comparativos: {
      distribuicao_saidas,
      gastos_por_categoria,
      receitas_por_origem
    },
    rankings: {
      maiores_gastos,
      maiores_receitas,
      proximos_vencimentos
    }
  };
}
