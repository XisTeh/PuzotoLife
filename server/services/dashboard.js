import { getDatabase, snapshot } from '../database/connection.js';
import { dataFuturaLocal, dataHojeLocal } from '../utils/dataLocal.js';

const arredondarMoeda = valor => Math.round((Number(valor) + Number.EPSILON) * 100) / 100;

function proximoMesInicio(mes) {
  const [ano, numeroMes] = mes.split('-').map(Number);
  const data = new Date(ano, numeroMes, 1);
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-01`;
}

async function obterAgregados(db, mes, hoje) {
  const padraoMes = `${mes}%`;
  const inicioMes = `${mes}-01`;
  const proximoMes = proximoMesInicio(mes);
  return db.prepare(`
    SELECT
      (SELECT COALESCE(SUM(CASE tipo WHEN 'aporte' THEN valor WHEN 'rendimento' THEN valor WHEN 'ajuste' THEN valor WHEN 'resgate' THEN -valor ELSE 0 END), 0) FROM investimento_movimentos WHERE data <= ?) AS investimento_atual,
      (SELECT COALESCE(SUM(CASE tipo WHEN 'aporte' THEN valor WHEN 'rendimento' THEN valor WHEN 'ajuste' THEN valor WHEN 'resgate' THEN -valor ELSE 0 END), 0) FROM investimento_movimentos WHERE data < ?) AS investimento_competencia,
      (SELECT COALESCE(SUM(CASE tipo WHEN 'aporte' THEN -valor WHEN 'resgate' THEN valor ELSE 0 END), 0) FROM investimento_movimentos WHERE data < ?) AS investimento_impacto_anterior,
      (SELECT COALESCE(SUM(CASE tipo WHEN 'aporte' THEN -valor WHEN 'resgate' THEN valor ELSE 0 END), 0) FROM investimento_movimentos WHERE data >= ? AND data < ?) AS investimento_impacto_mes,
      (SELECT COALESCE(SUM(total), 0) FROM lancamentos_trabalho WHERE data LIKE ? AND status != 'cancelado') AS trabalho_prod,
      (SELECT COALESCE(SUM(total), 0) FROM laudos_ranon WHERE data LIKE ? AND status != 'cancelado') AS ranon_prod_fechado,
      (SELECT COALESCE(SUM(total), 0) FROM laudos_ranon_pendentes WHERE data LIKE ?) AS ranon_prod_pendente,
      (SELECT COALESCE(SUM(total), 0) FROM lancamentos_trabalho WHERE data LIKE ? AND status = 'recebido') AS trabalho_recebido,
      (SELECT COALESCE(SUM(total), 0) FROM laudos_ranon WHERE data LIKE ? AND status = 'recebido') AS ranon_recebido,
      (SELECT COALESCE(SUM(valor), 0) FROM receitas WHERE data LIKE ? AND status = 'recebido') AS receitas_recebidas,
      (SELECT COALESCE(SUM(valor), 0) FROM receitas WHERE data LIKE ? AND status = 'previsto') AS receitas_previstas,
      (SELECT COALESCE(SUM(valor), 0) FROM gastos WHERE data LIKE ? AND status = 'pago') AS gastos_pagos,
      (SELECT COALESCE(SUM(valor), 0) FROM gastos WHERE data LIKE ? AND status = 'pendente') AS gastos_pendentes,
      (SELECT COALESCE(SUM(total), 0) FROM faturas_cartao WHERE competencia = ? AND status IN ('aberta', 'fechada')) AS cartoes_abertos,
      (SELECT COALESCE(SUM(total), 0) FROM faturas_cartao WHERE competencia = ? AND status = 'paga') AS cartoes_pagos,
      (SELECT COALESCE(SUM(total), 0) FROM faturas_cartao WHERE competencia > ? AND status NOT IN ('cancelada', 'paga')) AS proximas_faturas,
      (SELECT COALESCE(SUM(valor), 0) FROM contas_pagar WHERE vencimento LIKE ? AND status IN ('pendente', 'atrasado')) AS contas_pendentes,
      (SELECT COALESCE(SUM(valor), 0) FROM contas_pagar WHERE vencimento LIKE ? AND status = 'pago') AS contas_pagas,
      (SELECT COALESCE(SUM(valor), 0) FROM contas_pagar WHERE status IN ('pendente', 'atrasado') AND vencimento < ?) AS contas_atrasadas,
      (SELECT COALESCE(SUM(valor), 0) FROM pessoas_dividas WHERE tipo = 'eu_devo' AND status = 'pendente') AS eu_devo,
      (SELECT COALESCE(SUM(valor), 0) FROM pessoas_dividas WHERE tipo = 'me_deve' AND status = 'pendente') AS me_devem,
      (SELECT COALESCE(SUM(valor), 0) FROM receitas WHERE status = 'recebido' AND data < ?) AS receitas_recebidas_ant,
      (SELECT COALESCE(SUM(valor), 0) FROM gastos WHERE status = 'pago' AND data < ?) AS gastos_pagos_ant,
      (SELECT COALESCE(SUM(total), 0) FROM faturas_cartao WHERE status = 'paga' AND competencia < ?) AS cartoes_pagos_ant,
      (SELECT COALESCE(SUM(valor), 0) FROM contas_pagar WHERE status = 'pago' AND vencimento < ?) AS contas_pagas_ant,
      (SELECT COALESCE(SUM(valor), 0) FROM pessoas_dividas WHERE tipo = 'eu_devo' AND status = 'pago' AND pago_recebido_em < ? AND pago_recebido_em >= '2026-06-01') AS dividas_pagas_ant,
      (SELECT COALESCE(SUM(valor), 0) FROM pessoas_dividas WHERE tipo = 'me_deve' AND status = 'recebido' AND pago_recebido_em < ? AND pago_recebido_em >= '2026-06-01') AS dividas_recebidas_ant,
      (SELECT COALESCE(SUM(valor), 0) FROM pessoas_dividas WHERE tipo = 'eu_devo' AND status = 'pago' AND pago_recebido_em LIKE ? AND pago_recebido_em >= '2026-06-01') AS dividas_pagas_mes,
      (SELECT COALESCE(SUM(valor), 0) FROM pessoas_dividas WHERE tipo = 'me_deve' AND status = 'recebido' AND pago_recebido_em LIKE ? AND pago_recebido_em >= '2026-06-01') AS dividas_recebidas_mes
  `).get(
    hoje, proximoMes, inicioMes, inicioMes, proximoMes,
    padraoMes, padraoMes, padraoMes, padraoMes, padraoMes,
    padraoMes, padraoMes, padraoMes, padraoMes,
    mes, mes, mes, padraoMes, padraoMes, hoje,
    inicioMes, inicioMes, mes, inicioMes, inicioMes, inicioMes, padraoMes, padraoMes,
  );
}

async function obterAlertas(db, limite) {
  const rows = await db.prepare(`
    SELECT 'conta' AS tipo_alerta, id, nome AS titulo, NULL AS subtipo, valor, vencimento AS data_limite, status
    FROM (SELECT id, nome, valor, vencimento, status FROM contas_pagar WHERE status = 'pendente' AND vencimento <= ? ORDER BY vencimento ASC LIMIT 5) AS contas
    UNION ALL
    SELECT 'fatura', id, cartao_nome, NULL, total, vencimento, status
    FROM (SELECT id, cartao_nome, total, vencimento, status FROM faturas_cartao WHERE status IN ('aberta', 'fechada') AND vencimento <= ? ORDER BY vencimento ASC LIMIT 5) AS faturas
    UNION ALL
    SELECT 'receita', id, descricao, NULL, valor, data, 'previsto'
    FROM (SELECT id, descricao, valor, data FROM receitas WHERE status = 'previsto' AND data <= ? ORDER BY data ASC LIMIT 5) AS receitas_alerta
    UNION ALL
    SELECT 'pessoa', id, nome_pessoa, tipo, valor, data_combinada, 'pendente'
    FROM (SELECT id, nome_pessoa, tipo, valor, data_combinada FROM pessoas_dividas WHERE status = 'pendente' AND data_combinada <= ? ORDER BY data_combinada ASC LIMIT 5) AS pessoas_alerta
  `).all(limite, limite, limite, limite);
  return {
    contas_vencendo: rows.filter(row => row.tipo_alerta === 'conta').map(row => ({ id: row.id, nome: row.titulo, valor: row.valor, vencimento: row.data_limite, status: row.status })),
    faturas_vencendo: rows.filter(row => row.tipo_alerta === 'fatura').map(row => ({ id: row.id, cartao_nome: row.titulo, valor: row.valor, vencimento: row.data_limite, status: row.status })),
    receitas_previstas: rows.filter(row => row.tipo_alerta === 'receita').map(row => ({ id: row.id, descricao: row.titulo, valor: row.valor, data: row.data_limite })),
    pendencias_pessoas: rows.filter(row => row.tipo_alerta === 'pessoa').map(row => ({ id: row.id, pessoa: row.titulo, tipo: row.subtipo, valor: row.valor, data_combinada: row.data_limite })),
  };
}

async function obterGraficos(db, mes) {
  const rows = await db.prepare(`
    SELECT 'gasto' AS tipo_grafico, categoria_nome AS nome, SUM(valor) AS valor FROM gastos
    WHERE data LIKE ? AND status = 'pago' GROUP BY categoria_nome
    UNION ALL
    SELECT 'trabalho', empresa_nome, SUM(total) FROM lancamentos_trabalho
    WHERE data LIKE ? AND status != 'cancelado' GROUP BY empresa_nome
  `).all(`${mes}%`, `${mes}%`);
  return {
    gastos_por_categoria: rows.filter(row => row.tipo_grafico === 'gasto').map(({ nome, valor }) => ({ nome, valor })),
    trabalho_por_empresa: rows.filter(row => row.tipo_grafico === 'trabalho').map(({ nome, valor }) => ({ nome, valor })),
  };
}

export async function obterDashboard(mes) {
  if (!/^\d{4}-\d{2}$/.test(String(mes || ''))) throw new Error('Competência inválida.');
  return snapshot(async () => {
    const db = getDatabase();
    const hoje = dataHojeLocal();
    const a = await obterAgregados(db, mes, hoje);
    const gruposParcelados = await db.prepare("SELECT * FROM dividas_parceladas_grupos WHERE status = 'ativa'").all();
    const alertas = await obterAlertas(db, dataFuturaLocal(7));
    const graficos = await obterGraficos(db, mes);

    const ranonProd = a.ranon_prod_fechado + a.ranon_prod_pendente;
    const trabalhoProduzido = a.trabalho_prod + ranonProd;
    const trabalhoRecebido = a.trabalho_recebido + a.ranon_recebido;
    const trabalhoAReceber = trabalhoProduzido - trabalhoRecebido;
    let euDevo = a.eu_devo;
    let meDevem = a.me_devem;
    for (const grupo of gruposParcelados) {
      const [anoI, mesI] = grupo.competencia_inicio.split('-').map(Number);
      const [anoF, mesF] = mes.split('-').map(Number);
      const parcela = (anoF - anoI) * 12 + (mesF - mesI) + 1;
      if (parcela < 1 || parcela > grupo.total_parcelas || parcela <= grupo.parcelas_pagas) continue;
      const valor = grupo.id === 4 && parcela === 1 && mes === '2026-06' ? 194.57 : grupo.valor_parcela;
      if (grupo.tipo === 'eu_devo') euDevo += valor;
      else if (grupo.tipo === 'me_deve') meDevem += valor;
    }

    const saldoAnterior = a.receitas_recebidas_ant + a.dividas_recebidas_ant - a.gastos_pagos_ant - a.cartoes_pagos_ant - a.contas_pagas_ant - a.dividas_pagas_ant + a.investimento_impacto_anterior;
    const comprometido = a.gastos_pendentes + a.cartoes_abertos + a.contas_pendentes + euDevo;
    const saldoAtual = saldoAnterior + a.receitas_recebidas + a.dividas_recebidas_mes - a.gastos_pagos - a.cartoes_pagos - a.contas_pagas - a.dividas_pagas_mes + a.investimento_impacto_mes;
    const saldoPrevisto = saldoAtual + a.receitas_previstas + trabalhoAReceber + meDevem - comprometido;

    if (ranonProd > 0) graficos.trabalho_por_empresa.push({ nome: 'Dr. Ranon / RX', valor: ranonProd });
    graficos.receitas_vs_despesas = [
      { nome: 'Recebimentos', valor: a.receitas_recebidas + trabalhoRecebido, cor: '#14b8a6' },
      { nome: 'Despesas Pagas', valor: a.gastos_pagos + a.cartoes_pagos + a.contas_pagas, cor: '#f43f5e' },
      { nome: 'A Receber', valor: trabalhoAReceber + a.receitas_previstas, cor: '#8b5cf6' },
      { nome: 'Comprometido', valor: comprometido, cor: '#f59e0b' },
    ];

    return {
      success: true,
      mes,
      resumo: {
        trabalho_produzido: trabalhoProduzido,
        trabalho_recebido: trabalhoRecebido,
        trabalho_a_receber: trabalhoAReceber,
        receitas_recebidas: a.receitas_recebidas,
        receitas_previstas: a.receitas_previstas,
        gastos_pagos: a.gastos_pagos,
        gastos_pendentes: a.gastos_pendentes,
        cartoes_abertos: a.cartoes_abertos,
        cartoes_pagos: a.cartoes_pagos,
        proximas_faturas: a.proximas_faturas,
        contas_pendentes: a.contas_pendentes,
        contas_pagas: a.contas_pagas,
        contas_atrasadas: a.contas_atrasadas,
        eu_devo: euDevo,
        me_devem: meDevem,
        saldo_atual: saldoAtual,
        saldo_previsto: saldoPrevisto,
        comprometido,
        saldo_investido_atual: arredondarMoeda(a.investimento_atual),
        saldo_investido_na_competencia: arredondarMoeda(a.investimento_competencia),
      },
      graficos,
      alertas,
    };
  });
}
