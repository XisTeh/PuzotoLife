import { obterRelatorioFinancas } from '../services/api.js';
import { formatarMoedaBR, formatarDataBR, mesAtualReferencia } from '../utils/formatters.js';
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

let charts = {};

export async function initRelatorioFinancas() {
  const mesInput = document.getElementById('rel-fin-mes');
  if (!mesInput.value) mesInput.value = mesAtualReferencia();
  await carregarDados();
}

async function carregarDados() {
  const container = document.getElementById('rel-fin-content');
  const empty = document.getElementById('rel-fin-empty');
  try {
    const mes = document.getElementById('rel-fin-mes').value;
    const d = await obterRelatorioFinancas(mes);
    const hasData = d.resumo.total_receitas_potenciais > 0 || d.resumo.gastos_pagos > 0 || d.resumo.gastos_pendentes > 0 || d.resumo.cartoes_abertos > 0 || d.resumo.contas_pendentes > 0;
    if (!hasData) { container.style.display='none'; empty.style.display='flex'; return; }
    container.style.display='block'; empty.style.display='none';
    preencherCards(d.resumo);
    renderGraficos(d.resumo, d.graficos);
    renderTabelas(d.graficos);
    renderRankings(d.rankings);
    renderAlertas(d.alertas);
    if (window.lucide) window.lucide.createIcons();
  } catch (err) { console.error('Erro rel financas:', err); }
}

function preencherCards(r) {
  const sets = [
    ['card-rf-rec', r.receitas_recebidas],['card-rf-prev', r.receitas_previstas],
    ['card-rf-gpago', r.gastos_pagos],['card-rf-gpend', r.gastos_pendentes],
    ['card-rf-cart', r.cartoes_abertos],['card-rf-contas', r.contas_pendentes],
    ['card-rf-comp', r.comprometido],['card-rf-saldo', r.saldo_previsto]
  ];
  sets.forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = formatarMoedaBR(val);
  });
  const saldoEl = document.getElementById('card-rf-saldo');
  if (saldoEl) saldoEl.style.color = r.saldo_previsto >= 0 ? 'var(--color-teal)' : 'var(--color-rose)';
}

function formatCompetencia(comp) {
  if (!comp) return '';
  var parts = comp.split('-');
  if (parts.length === 2) return parts[1] + '/' + parts[0];
  return comp;
}

function destroyChart(key) { if (charts[key]) { charts[key].destroy(); charts[key] = null; } }

function renderChartOrEmpty(canvasId, hasData, chartConfig) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const container = canvas.parentElement;
  
  if (charts[canvasId]) {
    charts[canvasId].destroy();
    charts[canvasId] = null;
  }

  const existingEmpty = container.querySelector('.rf-empty-state');
  if (existingEmpty) existingEmpty.remove();

  if (hasData) {
    canvas.style.display = 'block';
    charts[canvasId] = new Chart(canvas, chartConfig);
  } else {
    canvas.style.display = 'none';
    const div = document.createElement('div');
    div.className = 'rf-empty-state';
    div.style = 'display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);font-size:0.9rem;';
    div.textContent = 'Nenhum dado encontrado para esta seção.';
    container.appendChild(div);
  }
}

function renderGraficos(resumo, graficos) {
  renderChartOrEmpty('chart-rf-fluxo', 
    (resumo.receitas_recebidas > 0 || resumo.receitas_previstas > 0 || resumo.gastos_pagos > 0 || resumo.gastos_pendentes > 0 || resumo.cartoes_abertos > 0 || resumo.contas_pendentes > 0),
    {
      type: 'bar',
      data: {
        labels: ['Rec. Recebidas','Rec. Previstas','Gastos Pagos','Gastos Pend.','Cartões','Contas Pend.'],
        datasets: [{
          data: [resumo.receitas_recebidas,resumo.receitas_previstas,resumo.gastos_pagos,resumo.gastos_pendentes,resumo.cartoes_abertos,resumo.contas_pendentes],
          backgroundColor: ['#14b8a6','rgba(20,184,166,0.5)','#f43f5e','rgba(244,63,94,0.5)','#8b5cf6','#3b82f6'],
          borderRadius: 4
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(c) { return formatarMoedaBR(c.raw); } } } }, scales: { y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { callback: function(v) { return formatarMoedaBR(v); }, color: 'rgba(255,255,255,0.5)' } }, x: { grid: { display: false }, ticks: { color: 'rgba(255,255,255,0.7)', font: { size: 11 } } } } }
    }
  );

  renderChartOrEmpty('chart-rf-dist', 
    graficos.distribuicao_despesas && graficos.distribuicao_despesas.length > 0,
    {
      type: 'doughnut',
      data: {
        labels: graficos.distribuicao_despesas.map(d => d.nome),
        datasets: [{ data: graficos.distribuicao_despesas.map(d => d.valor), backgroundColor: graficos.distribuicao_despesas.map(d => d.cor), borderWidth: 0, cutout: '70%' }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: 'rgba(255,255,255,0.7)', usePointStyle: true } }, tooltip: { callbacks: { label: function(c) { return formatarMoedaBR(c.raw); } } } } }
    }
  );

  renderChartOrEmpty('chart-rf-cat', 
    graficos.gastos_por_categoria && graficos.gastos_por_categoria.length > 0,
    {
      type: 'bar',
      data: {
        labels: graficos.gastos_por_categoria.map(d => d.nome),
        datasets: [{ data: graficos.gastos_por_categoria.map(d => d.valor), backgroundColor: '#3b82f6', borderRadius: 4 }]
      },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(c) { return formatarMoedaBR(c.raw); } } } }, scales: { x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { callback: function(v) { return formatarMoedaBR(v); }, color: 'rgba(255,255,255,0.5)' } }, y: { grid: { display: false }, ticks: { color: 'rgba(255,255,255,0.7)' } } } }
    }
  );

  renderChartOrEmpty('chart-rf-orig', 
    graficos.receitas_por_origem && graficos.receitas_por_origem.length > 0,
    {
      type: 'doughnut',
      data: {
        labels: graficos.receitas_por_origem.map(d => d.nome),
        datasets: [{ data: graficos.receitas_por_origem.map(d => d.valor), backgroundColor: ['#10b981','#14b8a6','#06b6d4','#3b82f6','#8b5cf6','#d946ef','#f43f5e'], borderWidth: 0, cutout: '70%' }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: 'rgba(255,255,255,0.7)', usePointStyle: true } }, tooltip: { callbacks: { label: function(c) { return formatarMoedaBR(c.raw); } } } } }
    }
  );
}

function renderTabelas(g) {
  // Cartões
  const cartEl = document.getElementById('tbl-rf-cartoes');
  if (cartEl) {
    if (!g.cartoes_por_fatura || g.cartoes_por_fatura.length === 0) {
      cartEl.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:20px;font-size:0.9rem;">Nenhum dado encontrado para esta seção.</div>';
    } else {
      var h = '<table class="table" style="width:100%"><thead><tr><th>Cartão</th><th>Compet.</th><th>Vencimento</th><th>Valor</th><th>Status</th></tr></thead><tbody>';
      g.cartoes_por_fatura.forEach(function(f) {
        var statusColor = f.status === 'paga' ? 'var(--color-teal)' : f.status === 'fechada' ? 'var(--color-gold)' : 'var(--color-rose)';
        h += '<tr><td>' + f.cartao_nome + '</td><td>' + formatCompetencia(f.competencia) + '</td><td>' + formatarDataBR(f.vencimento) + '</td><td>' + formatarMoedaBR(f.valor) + '</td><td style="color:' + statusColor + ';font-weight:600;text-transform:capitalize;">' + f.status + '</td></tr>';
      });
      h += '</tbody></table>';
      cartEl.innerHTML = h;
    }
  }
  // Contas
  const contEl = document.getElementById('tbl-rf-contas');
  if (contEl) {
    if (!g.contas_lista || g.contas_lista.length === 0) {
      contEl.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:20px;font-size:0.9rem;">Nenhum dado encontrado para esta seção.</div>';
    } else {
      var h2 = '<table class="table" style="width:100%"><thead><tr><th>Nome</th><th>Categoria</th><th>Valor</th><th>Vencimento</th><th>Status</th></tr></thead><tbody>';
      g.contas_lista.forEach(function(c) {
        var sc = c.status === 'pago' ? 'var(--color-teal)' : c.status === 'atrasado' ? 'var(--color-rose)' : 'var(--color-gold)';
        h2 += '<tr><td>' + c.nome + '</td><td>' + (c.categoria||'-') + '</td><td>' + formatarMoedaBR(c.valor) + '</td><td>' + formatarDataBR(c.vencimento) + '</td><td style="color:' + sc + ';font-weight:600;text-transform:capitalize;">' + c.status + '</td></tr>';
      });
      h2 += '</tbody></table>';
      contEl.innerHTML = h2;
    }
  }
  // Pessoas
  const pesEl = document.getElementById('tbl-rf-pessoas');
  if (pesEl) {
    if (!g.pessoas_lista || g.pessoas_lista.length === 0) {
      pesEl.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:20px;font-size:0.9rem;">Nenhum dado encontrado para esta seção.</div>';
    } else {
      var h3 = '<table class="table" style="width:100%"><thead><tr><th>Pessoa</th><th>Tipo</th><th>Valor</th><th>Data</th><th>Status</th></tr></thead><tbody>';
      g.pessoas_lista.forEach(function(p) {
        var tipoLabel = p.tipo === 'eu_devo' ? 'Eu Devo' : 'Me Devem';
        var tc = p.tipo === 'eu_devo' ? 'var(--color-rose)' : 'var(--color-teal)';
        h3 += '<tr><td>' + p.pessoa + '</td><td style="color:' + tc + ';font-weight:600;">' + tipoLabel + '</td><td>' + formatarMoedaBR(p.valor) + '</td><td>' + formatarDataBR(p.data_combinada) + '</td><td style="text-transform:capitalize;">' + p.status + '</td></tr>';
      });
      h3 += '</tbody></table>';
      pesEl.innerHTML = h3;
    }
  }
}

function renderRankings(rankings) {
  renderListaRanking('list-rf-gastos', rankings.maiores_gastos, 'categoria', 'var(--color-rose)');
  renderListaRanking('list-rf-receitas', rankings.maiores_receitas, 'origem', 'var(--color-teal)');
  renderListaSimples('list-rf-contas', rankings.maiores_contas, 'var(--color-gold)');
  renderListaSimples('list-rf-faturas', rankings.maiores_faturas, 'var(--color-purple)');
}

function renderListaRanking(elId, items, subField, color) {
  var el = document.getElementById(elId);
  if (!el) return;
  if (!items || items.length === 0) { el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);padding:20px;font-size:0.9rem;">Nenhum dado encontrado para esta seção.</div>'; return; }
  var h = '';
  items.forEach(function(item) {
    h += '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid var(--border-subtle);">';
    h += '<div><div style="font-weight:500;color:var(--text-primary);font-size:0.95rem;">' + item.descricao + '</div>';
    h += '<div style="font-size:0.8rem;color:var(--text-muted);">' + (item[subField]||'') + ' &bull; ' + formatarDataBR(item.data) + '</div></div>';
    h += '<div style="font-weight:600;color:' + color + ';">' + formatarMoedaBR(item.valor) + '</div></div>';
  });
  el.innerHTML = h;
}

function renderListaSimples(elId, items, color) {
  var el = document.getElementById(elId);
  if (!el) return;
  if (!items || items.length === 0) { el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);padding:20px;font-size:0.9rem;">Nenhum dado encontrado para esta seção.</div>'; return; }
  var h = '';
  items.forEach(function(item) {
    h += '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid var(--border-subtle);">';
    h += '<div><div style="font-weight:500;color:var(--text-primary);font-size:0.95rem;">' + item.descricao + '</div>';
    if (item.competencia) {
      h += '<div style="font-size:0.8rem;color:var(--text-muted);">' + formatCompetencia(item.competencia) + ' &bull; ' + formatarDataBR(item.vencimento) + '</div></div>';
    } else {
      h += '<div style="font-size:0.8rem;color:var(--text-muted);">' + formatarDataBR(item.vencimento || item.data) + '</div></div>';
    }
    h += '<div style="font-weight:600;color:' + color + ';">' + formatarMoedaBR(item.valor) + '</div></div>';
  });
  el.innerHTML = h;
}

function renderAlertas(alertas) {
  var el = document.getElementById('rf-alertas');
  if (!el) return;
  var total = (alertas.contas_vencendo||[]).length + (alertas.faturas_vencendo||[]).length + (alertas.receitas_previstas||[]).length + (alertas.dividas_pendentes||[]).length;
  if (total === 0) { el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);padding:20px;font-size:0.9rem;">Nenhum dado encontrado para esta seção.</div>'; return; }
  var h = '';
  (alertas.contas_vencendo||[]).forEach(function(c) {
    h += alertaItem('receipt', 'var(--color-gold)', 'Conta: ' + c.nome, formatarMoedaBR(c.valor), formatarDataBR(c.vencimento));
  });
  (alertas.faturas_vencendo||[]).forEach(function(f) {
    h += alertaItem('credit-card', 'var(--color-purple)', 'Fatura: ' + f.cartao_nome, formatarMoedaBR(f.valor), formatarDataBR(f.vencimento));
  });
  (alertas.receitas_previstas||[]).forEach(function(r) {
    h += alertaItem('arrow-up-circle', 'var(--color-teal)', 'Receita: ' + r.descricao, formatarMoedaBR(r.valor), formatarDataBR(r.data));
  });
  (alertas.dividas_pendentes||[]).forEach(function(d) {
    var label = d.tipo === 'eu_devo' ? 'Eu devo: ' : 'Me devem: ';
    h += alertaItem('users', 'var(--color-rose)', label + d.pessoa, formatarMoedaBR(d.valor), formatarDataBR(d.data_combinada));
  });
  el.innerHTML = h;
}

function alertaItem(icon, color, title, valor, data) {
  var h = '<div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--border-subtle);">';
  h += '<div style="width:36px;height:36px;border-radius:10px;background:rgba(0,0,0,0.2);display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i data-lucide="' + icon + '" style="width:18px;height:18px;color:' + color + ';"></i></div>';
  h += '<div style="flex:1;"><div style="font-weight:500;color:var(--text-primary);font-size:0.9rem;">' + title + '</div>';
  h += '<div style="font-size:0.8rem;color:var(--text-muted);">' + valor + '</div></div>';
  h += '<div style="font-size:0.8rem;color:var(--text-muted);white-space:nowrap;">' + data + '</div></div>';
  return h;
}

window.atualizarRelatorioFinancas = async function() { await carregarDados(); };

export function renderRelatorioFinancas() {

  var s = '';
  // Header
  s += '<div class="page-header animate-in" style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:32px;">';
  s += '<div><h1 class="page-header__title" style="font-size:2.2rem;font-weight:700;margin-bottom:6px;">Relatório Financeiro</h1>';
  s += '<p class="page-header__subtitle">Analise suas entradas, despesas, cartões, contas e saldo previsto do mês.</p></div>';
  s += '<div style="display:flex;gap:8px;align-items:center;background:var(--bg-card);padding:6px 12px;border-radius:var(--radius-md);border:1px solid var(--border-subtle);box-shadow:var(--shadow-sm);">';
  s += '<div style="position:relative;display:flex;align-items:center;"><i data-lucide="calendar" style="position:absolute;left:12px;width:18px;height:18px;color:var(--text-muted);pointer-events:none;"></i>';
  s += '<input type="month" id="rel-fin-mes" class="form-control" style="width:170px;height:40px;padding-left:40px;border:none;background:transparent;cursor:pointer;color:var(--text-primary);font-weight:600;font-size:0.95rem;box-shadow:none;" onchange="window.atualizarRelatorioFinancas()"></div>';
  s += '<div style="width:1px;height:24px;background:var(--border-default);"></div>';
  s += '<button class="btn-icon" onclick="window.atualizarRelatorioFinancas()" style="border:none;background:transparent;box-shadow:none;color:var(--text-muted);" title="Atualizar"><i data-lucide="refresh-cw"></i></button></div></div>';

  // Empty state
  s += '<div id="rel-fin-empty" style="display:none;flex-direction:column;align-items:center;justify-content:center;padding:80px 20px;background:var(--bg-card);border:1px dashed var(--border-default);border-radius:var(--radius-lg);margin-top:40px;">';
  s += '<div style="width:64px;height:64px;border-radius:50%;background:var(--bg-surface);display:flex;align-items:center;justify-content:center;margin-bottom:24px;"><i data-lucide="pie-chart" style="width:32px;height:32px;color:var(--text-muted);"></i></div>';
  s += '<h3 style="font-size:1.2rem;font-weight:600;color:var(--text-primary);margin-bottom:8px;">Nenhum dado financeiro encontrado para este mês.</h3>';
  s += '<p style="color:var(--text-secondary);text-align:center;max-width:400px;line-height:1.5;">Registre receitas, gastos, contas ou compras no cartão para alimentar este relatório.</p></div>';

  // Content
  s += '<div id="rel-fin-content" style="display:none;">';

  // Cards
  s += '<div class="metrics-grid animate-in" style="animation-delay:0.1s;margin-bottom:40px;">';
  s += metricCard('Receitas Recebidas','card-rf-rec','arrow-up-circle','var(--color-teal)','var(--color-teal-dim)','Valor já creditado');
  s += metricCard('Receitas Previstas','card-rf-prev','clock','var(--color-teal)','rgba(20,184,166,0.1)','Valores aguardando');
  s += metricCard('Gastos Pagos','card-rf-gpago','arrow-down-circle','var(--color-rose)','var(--color-rose-dim)','Valor já debitado');
  s += metricCard('Gastos Pendentes','card-rf-gpend','clock','var(--color-rose)','rgba(244,63,94,0.1)','Aguardando pagamento');
  s += metricCard('Cartões em Aberto','card-rf-cart','credit-card','var(--color-purple)','var(--color-purple-dim)','Faturas abertas/fechadas');
  s += metricCard('Contas Pendentes','card-rf-contas','receipt','var(--color-gold)','var(--color-gold-dim)','Contas ainda não pagas');
  s += metricCard('Comprometido','card-rf-comp','alert-triangle','var(--color-rose)','var(--color-rose-dim)','Total que ainda deve sair');
  s += metricCard('Saldo Previsto','card-rf-saldo','wallet','var(--color-purple)','var(--color-purple-dim)','Estimativa final do mês');
  s += '</div>';

  // Gráficos linha 1
  s += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(400px,1fr));gap:24px;margin-bottom:24px;" class="animate-in">';
  s += chartPanel('Fluxo Financeiro','chart-rf-fluxo',280);
  s += chartPanel('Distribuição das Despesas','chart-rf-dist',280);
  s += '</div>';

  // Gráficos linha 2
  s += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:24px;margin-bottom:24px;" class="animate-in">';
  s += chartPanel('Gastos por Categoria','chart-rf-cat',250);
  s += chartPanel('Receitas por Origem','chart-rf-orig',250);
  s += '</div>';

  // Tabelas
  s += '<div style="display:grid;grid-template-columns:1fr;gap:24px;margin-bottom:24px;" class="animate-in">';
  s += tablePanel('Cartões e Faturas','tbl-rf-cartoes');
  s += tablePanel('Contas e Vencimentos','tbl-rf-contas');
  s += tablePanel('Pessoas e Pendências','tbl-rf-pessoas');
  s += '</div>';

  // Rankings
  s += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px;margin-bottom:24px;" class="animate-in">';
  s += listPanel('Maiores Gastos','list-rf-gastos');
  s += listPanel('Maiores Receitas','list-rf-receitas');
  s += listPanel('Maiores Contas Pend.','list-rf-contas');
  s += listPanel('Maiores Faturas','list-rf-faturas');
  s += '</div>';

  // Alertas
  s += '<div class="dashboard-panel animate-in" style="margin-bottom:24px;">';
  s += '<div class="dashboard-panel__header"><h3 class="dashboard-panel__title">Alertas Financeiros</h3></div>';
  s += '<div id="rf-alertas"></div></div>';

  s += '</div>'; // fecha content
  return s;
}

function metricCard(label, id, icon, color, bg, desc) {
  var h = '<div class="metric-card"><div class="metric-card__header">';
  h += '<div class="metric-card__label-top">' + label + '</div>';
  h += '<div class="metric-card__icon" style="background:' + bg + ';"><i data-lucide="' + icon + '" style="color:' + color + ';"></i></div></div>';
  h += '<div class="metric-card__body"><div class="metric-card__value" id="' + id + '">...</div>';
  h += '<div class="metric-card__desc">' + desc + '</div></div></div>';
  return h;
}

function chartPanel(title, canvasId, height) {
  var h = '<div class="dashboard-panel"><div class="dashboard-panel__header"><h3 class="dashboard-panel__title">' + title + '</h3></div>';
  h += '<div style="height:' + height + 'px;position:relative;"><canvas id="' + canvasId + '"></canvas></div></div>';
  return h;
}

function tablePanel(title, containerId) {
  var h = '<div class="dashboard-panel"><div class="dashboard-panel__header"><h3 class="dashboard-panel__title">' + title + '</h3></div>';
  h += '<div id="' + containerId + '" style="overflow-x:auto;"></div></div>';
  return h;
}

function listPanel(title, containerId) {
  var h = '<div class="dashboard-panel"><div class="dashboard-panel__header"><h3 class="dashboard-panel__title">' + title + '</h3></div>';
  h += '<div id="' + containerId + '" style="display:flex;flex-direction:column;"></div></div>';
  return h;
}
