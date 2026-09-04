import { snapshot } from '../database/connection.js';
import { getDatabase } from '../database/connection.js';
import { dataHojeLocal, dataFuturaLocal } from '../utils/dataLocal.js';
import { obterResumoInvestimentosDashboard } from './investimentos.js';

export async function obterRelatorioFinancas(mes) {
  return snapshot(async () => {
  const db = getDatabase();
  const hoje = dataHojeLocal();
  const investimentos = (await obterResumoInvestimentosDashboard(mes));

  // ==========================================
  // RECEITAS
  // ==========================================
  const receitas_recebidas = (await db.prepare(`SELECT COALESCE(SUM(valor), 0) as total FROM receitas WHERE data LIKE ? AND status = 'recebido'`).get(`${mes}%`)).total;
  const receitas_previstas = (await db.prepare(`SELECT COALESCE(SUM(valor), 0) as total FROM receitas WHERE data LIKE ? AND status = 'previsto'`).get(`${mes}%`)).total;

  // ==========================================
  // GASTOS
  // ==========================================
  const gastos_pagos = (await db.prepare(`SELECT COALESCE(SUM(valor), 0) as total FROM gastos WHERE data LIKE ? AND status = 'pago'`).get(`${mes}%`)).total;
  const gastos_pendentes = (await db.prepare(`SELECT COALESCE(SUM(valor), 0) as total FROM gastos WHERE data LIKE ? AND status = 'pendente'`).get(`${mes}%`)).total;

  // ==========================================
  // CARTÕES (COM CONSOLIDAÇÃO POR CARTAO_ID E COMPETENCIA)
  // ==========================================
  const cartoes_abertos = (await db.prepare(`
    SELECT COALESCE(SUM(total_fatura), 0) as total FROM (
      SELECT SUM(total) as total_fatura, SUM(CASE WHEN status IN ('aberta', 'fechada') THEN 1 ELSE 0 END) as pendentes
      FROM faturas_cartao WHERE competencia = ? AND status != 'cancelada' GROUP BY cartao_id, competencia
    ) WHERE pendentes > 0
  `).get(mes)).total;

  const cartoes_pagos = (await db.prepare(`
    SELECT COALESCE(SUM(total_fatura), 0) as total FROM (
      SELECT SUM(total) as total_fatura, SUM(CASE WHEN status IN ('aberta', 'fechada') THEN 1 ELSE 0 END) as pendentes
      FROM faturas_cartao WHERE competencia = ? AND status != 'cancelada' GROUP BY cartao_id, competencia
    ) WHERE pendentes = 0
  `).get(mes)).total;

  const proximas_faturas = (await db.prepare(`
    SELECT COALESCE(SUM(total_fatura), 0) as total FROM (
      SELECT SUM(total) as total_fatura, SUM(CASE WHEN status IN ('aberta', 'fechada') THEN 1 ELSE 0 END) as pendentes, MIN(vencimento) as vencimento
      FROM faturas_cartao WHERE status != 'cancelada' GROUP BY cartao_id, competencia
    ) WHERE pendentes > 0 AND vencimento > ?
  `).get(hoje)).total;

  // ==========================================
  // CONTAS A PAGAR
  // ==========================================
  const contas_pendentes = (await db.prepare(`SELECT COALESCE(SUM(valor), 0) as total FROM contas_pagar WHERE vencimento LIKE ? AND status = 'pendente'`).get(`${mes}%`)).total;
  const contas_pagas = (await db.prepare(`SELECT COALESCE(SUM(valor), 0) as total FROM contas_pagar WHERE vencimento LIKE ? AND status = 'pago'`).get(`${mes}%`)).total;
  const contas_atrasadas = (await db.prepare(`SELECT COALESCE(SUM(valor), 0) as total FROM contas_pagar WHERE status = 'pendente' AND vencimento < ?`).get(hoje)).total;

  // ==========================================
  // PESSOAS / DÍVIDAS
  // ==========================================
  let eu_devo = (await db.prepare(`SELECT COALESCE(SUM(valor), 0) as total FROM pessoas_dividas WHERE tipo = 'eu_devo' AND status = 'pendente'`).get()).total;
  let me_devem = (await db.prepare(`SELECT COALESCE(SUM(valor), 0) as total FROM pessoas_dividas WHERE tipo = 'me_deve' AND status = 'pendente'`).get()).total;

  // Buscar todas as dívidas parceladas ativas e somar apenas a parcela pendente do mês atual
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
  // CÁLCULOS
  // ==========================================
  // Calcular saldo acumulado de meses anteriores (carryover)
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

  const total_receitas_potenciais = receitas_recebidas + receitas_previstas + me_devem;
  const comprometido = gastos_pendentes + cartoes_abertos + contas_pendentes + eu_devo;
  const saldo_real = saldo_anterior + receitas_recebidas + dividas_recebidas_mes - gastos_pagos - cartoes_pagos - contas_pagas - dividas_pagas_mes + investimentos.impacto_caixa_mes;
  const saldo_previsto = saldo_real + receitas_previstas + me_devem - comprometido;

  // ==========================================
  // GRÁFICOS
  // ==========================================
  const receitas_por_origem = (await db.prepare(`
    SELECT origem as nome, SUM(valor) as valor FROM receitas WHERE data LIKE ? AND status != 'cancelada' GROUP BY origem ORDER BY valor DESC
  `).all(`${mes}%`));

  const gastos_por_categoria = (await db.prepare(`
    SELECT categoria_nome as nome, SUM(valor) as valor FROM gastos WHERE data LIKE ? AND status != 'cancelado' GROUP BY categoria_nome ORDER BY valor DESC
  `).all(`${mes}%`));

  const distribuicao_despesas = [
    { nome: 'Gastos Avulsos', valor: gastos_pagos + gastos_pendentes, cor: '#f43f5e' },
    { nome: 'Cartões', valor: cartoes_abertos + cartoes_pagos, cor: '#8b5cf6' },
    { nome: 'Contas a Pagar', valor: contas_pendentes + contas_pagas, cor: '#3b82f6' },
    { nome: 'Pessoas / Dívidas', valor: eu_devo, cor: '#f59e0b' }
  ].filter(i => i.valor > 0);

  const cartoes_por_fatura_raw = (await db.prepare(`
    SELECT cartao_nome, competencia, MIN(vencimento) as vencimento, SUM(total) as valor,
           SUM(CASE WHEN status IN ('aberta', 'fechada') THEN 1 ELSE 0 END) as pendentes
    FROM faturas_cartao WHERE competencia = ? AND status != 'cancelada' GROUP BY cartao_id, cartao_nome, competencia ORDER BY vencimento
  `).all(mes));
  
  const cartoes_por_fatura = cartoes_por_fatura_raw.map(f => ({
    cartao_nome: f.cartao_nome,
    competencia: f.competencia,
    vencimento: f.vencimento,
    valor: f.valor,
    status: f.pendentes > 0 ? 'aberta' : 'paga'
  }));

  const contas_lista = (await db.prepare(`
    SELECT nome, categoria_nome as categoria, valor, vencimento, status FROM contas_pagar WHERE vencimento LIKE ? ORDER BY vencimento
  `).all(`${mes}%`));

  const pessoas_lista = (await db.prepare(`
    SELECT nome_pessoa as pessoa, tipo, valor, data_combinada, status FROM pessoas_dividas WHERE status = 'pendente' ORDER BY data_combinada
  `).all());

  // Injetar parcelas pendentes correspondentes ao mês selecionado de dividas_parceladas_grupos
  if (mes) {
    const dp_ativas = (await db.prepare("SELECT * FROM dividas_parceladas_grupos WHERE status = 'ativa'").all());
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
          
          // Calcular data combinada real para exibição (vencimento)
          const d = new Date(Number(anoF), Number(mesF) - 1, 1);
          const ultimoDia = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
          const diaReal = grupo.dia_vencimento > ultimoDia ? ultimoDia : grupo.dia_vencimento;
          const dataCombinada = `${mes}-${String(diaReal).padStart(2, '0')}`;
          
          pessoas_lista.push({
            pessoa: grupo.nome_pessoa,
            tipo: grupo.tipo,
            valor: valorParcela,
            data_combinada: dataCombinada,
            status: 'pendente'
          });
        }
      }
    });

    // Reordenar a lista por data_combinada após adicionar as virtuais
    pessoas_lista.sort((a, b) => a.data_combinada.localeCompare(b.data_combinada));
  }

  // ==========================================
  // RANKINGS
  // ==========================================
  const maiores_gastos = (await db.prepare(`
    SELECT descricao, categoria_nome as categoria, valor, data FROM gastos WHERE data LIKE ? ORDER BY valor DESC LIMIT 5
  `).all(`${mes}%`));

  const maiores_receitas = (await db.prepare(`
    SELECT descricao, origem, valor, data FROM receitas WHERE data LIKE ? ORDER BY valor DESC LIMIT 5
  `).all(`${mes}%`));

  const maiores_contas = (await db.prepare(`
    SELECT nome as descricao, valor, vencimento FROM contas_pagar WHERE vencimento LIKE ? AND status != 'pago' ORDER BY valor DESC LIMIT 5
  `).all(`${mes}%`));

  const maiores_faturas = (await db.prepare(`
    SELECT cartao_nome as descricao, competencia, SUM(total) as valor, MIN(vencimento) as vencimento 
    FROM faturas_cartao WHERE competencia = ? AND status != 'cancelada'
    GROUP BY cartao_id, cartao_nome, competencia
    ORDER BY valor DESC LIMIT 5
  `).all(mes));

  // ==========================================
  // ALERTAS (próximos 7 dias)
  // ==========================================
  const limiteStr = dataFuturaLocal(7);

  const contas_vencendo = (await db.prepare(`
    SELECT nome, valor, vencimento FROM contas_pagar WHERE status = 'pendente' AND vencimento <= ? ORDER BY vencimento
  `).all(limiteStr));

  const faturas_vencendo = (await db.prepare(`
    SELECT cartao_nome, SUM(total) as valor, MIN(vencimento) as vencimento 
    FROM faturas_cartao WHERE status != 'cancelada'
    GROUP BY cartao_id, cartao_nome, competencia
    HAVING SUM(CASE WHEN status IN ('aberta', 'fechada') THEN 1 ELSE 0 END) > 0 AND MIN(vencimento) <= ?
    ORDER BY vencimento
  `).all(limiteStr));

  const receitas_prev_alertas = (await db.prepare(`
    SELECT descricao, valor, data FROM receitas WHERE status = 'previsto' AND data <= ? ORDER BY data
  `).all(limiteStr));

  const dividas_pendentes = (await db.prepare(`
    SELECT nome_pessoa as pessoa, tipo, valor, data_combinada FROM pessoas_dividas WHERE status = 'pendente' AND data_combinada <= ? ORDER BY data_combinada
  `).all(limiteStr));

  // Injetar parcelas pendentes que vencem nos próximos 7 dias nos alertas
  if (mes) {
    const dp_ativas = (await db.prepare("SELECT * FROM dividas_parceladas_grupos WHERE status = 'ativa'").all());
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
          
          // Calcular data combinada real para exibição (vencimento)
          const d = new Date(Number(anoF), Number(mesF) - 1, 1);
          const ultimoDia = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
          const diaReal = grupo.dia_vencimento > ultimoDia ? ultimoDia : grupo.dia_vencimento;
          const dataCombinada = `${mes}-${String(diaReal).padStart(2, '0')}`;
          
          if (dataCombinada <= limiteStr) {
            dividas_pendentes.push({
              pessoa: grupo.nome_pessoa,
              tipo: grupo.tipo,
              valor: valorParcela,
              data_combinada: dataCombinada
            });
          }
        }
      }
    });

    // Reordenar a lista por data_combinada após adicionar as virtuais
    dividas_pendentes.sort((a, b) => a.data_combinada.localeCompare(b.data_combinada));
  }

  return {
    success: true,
    mes,
    resumo: {
      receitas_recebidas, receitas_previstas, total_receitas_potenciais,
      gastos_pagos, gastos_pendentes,
      cartoes_abertos, cartoes_pagos, proximas_faturas,
      contas_pendentes, contas_pagas, contas_atrasadas,
      eu_devo, me_devem,
      saldo_real, saldo_previsto, comprometido
    },
    graficos: {
      receitas_por_origem, gastos_por_categoria, distribuicao_despesas,
      cartoes_por_fatura, contas_lista, pessoas_lista
    },
    rankings: { maiores_gastos, maiores_receitas, maiores_contas, maiores_faturas },
    alertas: { contas_vencendo, faturas_vencendo, receitas_previstas: receitas_prev_alertas, dividas_pendentes }
  };
  });
}
