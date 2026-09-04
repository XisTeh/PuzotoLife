/**
 * Serviço de Analytics do Trabalho
 * Cruza lancamentos_trabalho + laudos_ranon para gerar métricas e gráficos.
 */

import { getDatabase } from '../database/connection.js';

/**
 * Retorna analytics completo do trabalho para um mês.
 * @param {string} mes - Formato YYYY-MM
 * @param {string} empresa - "todas" ou nome específico
 * @param {string} status - "todos" ou status específico
 */
export function obterAnalyticsTrabalho(mes, empresa = 'todas', status = 'todos') {
  const db = getDatabase();
  const mesLike = `${mes}%`;

  // ═══════════════════════════════════════
  // 1. LANÇAMENTOS DE TRABALHO
  // ═══════════════════════════════════════
  let sqlLanc = `
    SELECT empresa_nome, quantidade, total, data, status
    FROM lancamentos_trabalho
    WHERE data LIKE ?
  `;
  const paramsLanc = [mesLike];

  if (empresa !== 'todas' && empresa !== 'Dr. Ranon / RX') {
    sqlLanc += ' AND empresa_nome = ?';
    paramsLanc.push(empresa);
  }
  if (status !== 'todos') {
    sqlLanc += ' AND status = ?';
    paramsLanc.push(status);
  }

  const lancamentos = db.prepare(sqlLanc).all(...paramsLanc);

  // ═══════════════════════════════════════
  // 2. LAUDOS RANON (histórico definitivo)
  // ═══════════════════════════════════════
  let sqlRanon = `
    SELECT registro_paciente, valor_unitario, total, data, status
    FROM laudos_ranon
    WHERE data LIKE ?
  `;
  const paramsRanon = [mesLike];

  if (status !== 'todos') {
    sqlRanon += ' AND status = ?';
    paramsRanon.push(status);
  }

  let laudosRanon = [];
  // Só inclui Ranon se empresa = todas ou Dr. Ranon / RX
  if (empresa === 'todas' || empresa === 'Dr. Ranon / RX') {
    laudosRanon = db.prepare(sqlRanon).all(...paramsRanon);
  }

  // ═══════════════════════════════════════
  // 3. UNIFICAR DADOS
  // ═══════════════════════════════════════
  const todasLinhas = [];

  for (const l of lancamentos) {
    todasLinhas.push({
      empresa: l.empresa_nome,
      quantidade: l.quantidade,
      total: l.total,
      data: l.data,
      status: l.status
    });
  }

  for (const r of laudosRanon) {
    todasLinhas.push({
      empresa: 'Dr. Ranon / RX',
      quantidade: 1,
      total: r.total,
      data: r.data,
      status: r.status
    });
  }

  // ═══════════════════════════════════════
  // 4. CALCULAR CARDS
  // ═══════════════════════════════════════
  const totalProduzido = todasLinhas.reduce((a, l) => a + l.total, 0);
  const qtdTotal = todasLinhas.reduce((a, l) => a + l.quantidade, 0);

  // Média diária
  const [anoStr, mesStr] = mes.split('-');
  const anoNum = parseInt(anoStr);
  const mesNum = parseInt(mesStr);
  const agora = new Date();
  const mesAtual = agora.getFullYear() === anoNum && (agora.getMonth() + 1) === mesNum;
  const diasConsiderados = mesAtual
    ? agora.getDate()
    : new Date(anoNum, mesNum, 0).getDate();
  const mediaDia = diasConsiderados > 0 ? totalProduzido / diasConsiderados : 0;

  // Clinicas principais (Diagnóstico, Perfecta, E-Mail)
  const clinicasPrincipais = ['Diagnóstico', 'Perfecta', 'E-Mail'];
  const totalClinicasPrincipais = todasLinhas
    .filter(l => clinicasPrincipais.includes(l.empresa))
    .reduce((a, l) => a + l.total, 0);

  const totalPadrao = todasLinhas
    .filter(l => l.empresa === 'Padrão')
    .reduce((a, l) => a + l.total, 0);

  const totalRanon = todasLinhas
    .filter(l => l.empresa === 'Dr. Ranon / RX')
    .reduce((a, l) => a + l.total, 0);

  const qtdClinicasPrincipais = todasLinhas
    .filter(l => clinicasPrincipais.includes(l.empresa))
    .reduce((a, l) => a + l.quantidade, 0);

  const qtdPadrao = todasLinhas
    .filter(l => l.empresa === 'Padrão')
    .reduce((a, l) => a + l.quantidade, 0);

  const qtdRanon = laudosRanon.length;

  // ═══════════════════════════════════════
  // 5. POR EMPRESA
  // ═══════════════════════════════════════
  const mapaEmpresa = {};
  const empresasOrdem = ['Diagnóstico', 'Perfecta', 'E-Mail', 'Padrão', 'Dr. Ranon / RX'];

  for (const e of empresasOrdem) {
    mapaEmpresa[e] = { empresa: e, quantidade: 0, total: 0, percentual: 0 };
  }

  for (const l of todasLinhas) {
    if (!mapaEmpresa[l.empresa]) {
      mapaEmpresa[l.empresa] = { empresa: l.empresa, quantidade: 0, total: 0, percentual: 0 };
    }
    mapaEmpresa[l.empresa].quantidade += l.quantidade;
    mapaEmpresa[l.empresa].total += l.total;
  }

  const porEmpresa = Object.values(mapaEmpresa).map(e => ({
    ...e,
    percentual: totalProduzido > 0 ? Math.round((e.total / totalProduzido) * 10000) / 100 : 0
  }));

  // ═══════════════════════════════════════
  // 6. FATURAMENTO DIÁRIO
  // ═══════════════════════════════════════
  const mapaDia = {};
  for (const l of todasLinhas) {
    if (!mapaDia[l.data]) mapaDia[l.data] = { total: 0, quantidade: 0 };
    mapaDia[l.data].total += l.total;
    mapaDia[l.data].quantidade += l.quantidade;
  }

  const faturamentoDiario = Object.entries(mapaDia)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([data, val]) => {
      const partes = data.split('-');
      return {
        data: `${partes[2]}/${partes[1]}`,
        total: Math.round(val.total * 100) / 100,
        quantidade: val.quantidade
      };
    });

  // ═══════════════════════════════════════
  // 7. EVOLUÇÃO POR EMPRESA
  // ═══════════════════════════════════════
  const mapaEvolucao = {};
  for (const l of todasLinhas) {
    if (!mapaEvolucao[l.data]) {
      mapaEvolucao[l.data] = {};
      for (const e of empresasOrdem) mapaEvolucao[l.data][e] = 0;
    }
    if (mapaEvolucao[l.data][l.empresa] === undefined) mapaEvolucao[l.data][l.empresa] = 0;
    mapaEvolucao[l.data][l.empresa] += l.total;
  }

  const evolucaoPorEmpresa = Object.entries(mapaEvolucao)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([data, vals]) => {
      const partes = data.split('-');
      return {
        data: `${partes[2]}/${partes[1]}`,
        ...vals
      };
    });

  return {
    success: true,
    periodo: mes,
    cards: {
      total_produzido: Math.round(totalProduzido * 100) / 100,
      qtd_total: qtdTotal,
      media_dia: Math.round(mediaDia * 100) / 100,
      qtd_dias_considerados: diasConsiderados,
      total_clinicas_principais: Math.round(totalClinicasPrincipais * 100) / 100,
      qtd_clinicas_principais: qtdClinicasPrincipais,
      total_padrao: Math.round(totalPadrao * 100) / 100,
      qtd_padrao: qtdPadrao,
      total_ranon: Math.round(totalRanon * 100) / 100,
      qtd_ranon: qtdRanon
    },
    por_empresa: porEmpresa,
    faturamento_diario: faturamentoDiario,
    evolucao_por_empresa: evolucaoPorEmpresa
  };
}
