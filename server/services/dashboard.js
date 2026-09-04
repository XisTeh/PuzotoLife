import { getDatabase } from '../database/connection.js';
import { dataHojeLocal, dataFuturaLocal } from '../utils/dataLocal.js';
import { obterResumoInvestimentosDashboard } from './investimentos.js';

export function obterDashboard(mes) {
  const db = getDatabase();
  const hoje = dataHojeLocal();
  const investimentos = obterResumoInvestimentosDashboard(mes);

  // ==========================================
  // TRABALHO
  // ==========================================
  const trabalhoProd = db.prepare(`
    SELECT COALESCE(SUM(total), 0) as total 
    FROM lancamentos_trabalho
    WHERE data LIKE ? AND status != 'cancelado'
  `).get(`${mes}%`).total;

  const ranonProdClosed = db.prepare(`
    SELECT COALESCE(SUM(total), 0) as total FROM laudos_ranon WHERE data LIKE ? AND status != 'cancelado'
  `).get(`${mes}%`).total;

  const ranonProdPend = db.prepare(`
    SELECT COALESCE(SUM(total), 0) as total FROM laudos_ranon_pendentes WHERE data LIKE ?
  `).get(`${mes}%`).total;

  const ranonProd = ranonProdClosed + ranonProdPend;

  const trabalhoRec = db.prepare(`
    SELECT COALESCE(SUM(total), 0) as total 
    FROM lancamentos_trabalho
    WHERE data LIKE ? AND status = 'recebido'
  `).get(`${mes}%`).total;

  const ranonRec = db.prepare(`
    SELECT COALESCE(SUM(total), 0) as total FROM laudos_ranon WHERE data LIKE ? AND status = 'recebido'
  `).get(`${mes}%`).total;

  const trabalho_produzido = trabalhoProd + ranonProd;
  const trabalho_recebido = trabalhoRec + ranonRec;
  const trabalho_a_receber = trabalho_produzido - trabalho_recebido;

  // ==========================================
  // RECEITAS
  // ==========================================
  const receitas_recebidas = db.prepare(`
    SELECT COALESCE(SUM(valor), 0) as total FROM receitas WHERE data LIKE ? AND status = 'recebido'
  `).get(`${mes}%`).total;

  const receitas_previstas = db.prepare(`
    SELECT COALESCE(SUM(valor), 0) as total FROM receitas WHERE data LIKE ? AND status = 'previsto'
  `).get(`${mes}%`).total;

  // ==========================================
  // GASTOS
  // ==========================================
  const gastos_pagos = db.prepare(`
    SELECT COALESCE(SUM(valor), 0) as total FROM gastos WHERE data LIKE ? AND status = 'pago'
  `).get(`${mes}%`).total;

  const gastos_pendentes = db.prepare(`
    SELECT COALESCE(SUM(valor), 0) as total FROM gastos WHERE data LIKE ? AND status = 'pendente'
  `).get(`${mes}%`).total;

  // ==========================================
  // CARTÕES
  // ==========================================
  const cartoes_abertos = db.prepare(`
    SELECT COALESCE(SUM(total), 0) as total FROM faturas_cartao WHERE competencia = ? AND status IN ('aberta', 'fechada')
  `).get(mes).total;

  const cartoes_pagos = db.prepare(`
    SELECT COALESCE(SUM(total), 0) as total FROM faturas_cartao WHERE competencia = ? AND status = 'paga'
  `).get(mes).total;

  const proximas_faturas = db.prepare(`
    SELECT COALESCE(SUM(total), 0) as total FROM faturas_cartao WHERE competencia > ? AND status != 'cancelada' AND status != 'paga'
  `).get(mes).total;

  // ==========================================
  // CONTAS A PAGAR
  // ==========================================
  // inclui 'atrasado' junto com 'pendente' pois o contasPagar.js migra automaticamente
  const contas_pendentes = db.prepare(`
    SELECT COALESCE(SUM(valor), 0) as total FROM contas_pagar WHERE vencimento LIKE ? AND status IN ('pendente', 'atrasado')
  `).get(`${mes}%`).total;

  const contas_pagas = db.prepare(`
    SELECT COALESCE(SUM(valor), 0) as total FROM contas_pagar WHERE vencimento LIKE ? AND status = 'pago'
  `).get(`${mes}%`).total;

  const contas_atrasadas = db.prepare(`
    SELECT COALESCE(SUM(valor), 0) as total FROM contas_pagar WHERE status IN ('pendente', 'atrasado') AND vencimento < ?
  `).get(hoje).total;

  // ==========================================
  // PESSOAS / DÍVIDAS
  // ==========================================
  let eu_devo = db.prepare(`
    SELECT COALESCE(SUM(valor), 0) as total FROM pessoas_dividas WHERE tipo = 'eu_devo' AND status = 'pendente'
  `).get().total;

  let me_devem = db.prepare(`
    SELECT COALESCE(SUM(valor), 0) as total FROM pessoas_dividas WHERE tipo = 'me_deve' AND status = 'pendente'
  `).get().total;

  // Buscar todas as dívidas parceladas ativas e somar apenas a parcela pendente do mês atual
  const dp_ativas = db.prepare(`
    SELECT * FROM dividas_parceladas_grupos WHERE status = 'ativa'
  `).all();
  
  dp_ativas.forEach(grupo => {
    const [anoI, mesI] = grupo.competencia_inicio.split('-');
    const [anoF, mesF] = mes.split('-');
    const diffMeses = (Number(anoF) - Number(anoI)) * 12 + (Number(mesF) - Number(mesI));
    const numParcela = diffMeses + 1;

    if (numParcela >= 1 && numParcela <= grupo.total_parcelas) {
      if (numParcela > grupo.parcelas_pagas) {
        // Parcela está pendente neste mês!
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

  // ==========================================
  // COMPROMETIDO E SALDO
  // ==========================================
  // Saldo acumulado de meses anteriores (apenas receitas avulsas e despesas pagas)
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

  // saldo_anterior = receitas avulsas + recebimentos pessoais - gastos - contas - cartões - pagamentos pessoais
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

  const comprometido = gastos_pendentes + cartoes_abertos + contas_pendentes + eu_devo;
  // saldo_atual = saldo anterior + receitas avulsas - despesas - pagamentos de dívidas pessoais + recebimentos de dívidas pessoais
  const saldo_atual = saldo_anterior + receitas_recebidas + dividas_recebidas_mes - gastos_pagos - cartoes_pagos - contas_pagas - dividas_pagas_mes + investimentos.impacto_caixa_mes;
  const saldo_previsto = saldo_atual + receitas_previstas + trabalho_a_receber + me_devem - comprometido;

  // ==========================================
  // ALERTAS
  // ==========================================
  const limiteStr = dataFuturaLocal(7);

  const alertas_contas = db.prepare(`
    SELECT id, nome, valor, vencimento, status FROM contas_pagar 
    WHERE status = 'pendente' AND vencimento <= ? 
    ORDER BY vencimento ASC LIMIT 5
  `).all(limiteStr);

  const alertas_faturas = db.prepare(`
    SELECT id, cartao_nome, total as valor, vencimento, status FROM faturas_cartao 
    WHERE status IN ('aberta', 'fechada') AND vencimento <= ? 
    ORDER BY vencimento ASC LIMIT 5
  `).all(limiteStr);

  const alertas_receitas = db.prepare(`
    SELECT id, descricao, valor, data FROM receitas 
    WHERE status = 'previsto' AND data <= ? 
    ORDER BY data ASC LIMIT 5
  `).all(limiteStr);

  const alertas_pessoas = db.prepare(`
    SELECT id, nome_pessoa as pessoa, tipo, valor, data_combinada 
    FROM pessoas_dividas
    WHERE status = 'pendente' AND data_combinada <= ? 
    ORDER BY data_combinada ASC LIMIT 5
  `).all(limiteStr); // Note: Fix this query

  // ==========================================
  // GRÁFICOS (simplificados por enquanto)
  // ==========================================
  // Receitas vs Despesas
  const graficos = {
    receitas_vs_despesas: [
      { nome: 'Recebimentos', valor: receitas_recebidas + trabalho_recebido, cor: '#14b8a6' },
      { nome: 'Despesas Pagas', valor: gastos_pagos + cartoes_pagos + contas_pagas, cor: '#f43f5e' },
      { nome: 'A Receber', valor: trabalho_a_receber + receitas_previstas, cor: '#8b5cf6' },
      { nome: 'Comprometido', valor: comprometido, cor: '#f59e0b' }
    ],
    gastos_por_categoria: db.prepare(`
      SELECT categoria_nome as nome, SUM(valor) as valor FROM gastos 
      WHERE data LIKE ? AND status = 'pago' GROUP BY categoria_nome
    `).all(`${mes}%`),
    trabalho_por_empresa: db.prepare(`
      SELECT empresa_nome as nome, SUM(total) as valor 
      FROM lancamentos_trabalho
      WHERE data LIKE ? AND status != 'cancelado' 
      GROUP BY empresa_nome
    `).all(`${mes}%`)
  };

  // Add Ranon to trabalho_por_empresa
  if (ranonProd > 0) {
    graficos.trabalho_por_empresa.push({ nome: 'Dr. Ranon / RX', valor: ranonProd });
  }

  return {
    success: true,
    mes,
    resumo: {
      trabalho_produzido,
      trabalho_recebido,
      trabalho_a_receber,
      receitas_recebidas,
      receitas_previstas,
      gastos_pagos,
      gastos_pendentes,
      cartoes_abertos,
      cartoes_pagos,
      proximas_faturas,
      contas_pendentes,
      contas_pagas,
      contas_atrasadas,
      eu_devo,
      me_devem,
      saldo_atual,
      saldo_previsto,
      comprometido,
      saldo_investido_atual: investimentos.saldo_investido_atual,
      saldo_investido_na_competencia: investimentos.saldo_investido_na_competencia
    },
    graficos,
    alertas: {
      contas_vencendo: alertas_contas,
      faturas_vencendo: alertas_faturas,
      receitas_previstas: alertas_receitas,
      pendencias_pessoas: alertas_pessoas
    }
  };
}
