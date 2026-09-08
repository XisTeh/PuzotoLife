import { obterComparativoMensal } from '../services/api.js';
import { formatarMoedaBR, formatarDataBR, mesAtualReferencia } from '../utils/formatters.js';
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

let charts = {};

export async function initComparativoMensal() {
  const dtFim = new Date();
  const dtInicio = new Date(dtFim.getFullYear(), dtFim.getMonth() - 5, 1);

  const mesInicioInput = document.getElementById('comp-mes-inicio');
  const mesFimInput = document.getElementById('comp-mes-fim');
  
  if (!mesInicioInput.value) {
    mesInicioInput.value = `${dtInicio.getFullYear()}-${String(dtInicio.getMonth() + 1).padStart(2, '0')}`;
  }
  if (!mesFimInput.value) {
    mesFimInput.value = `${dtFim.getFullYear()}-${String(dtFim.getMonth() + 1).padStart(2, '0')}`;
  }
  
  await carregarDados();
}

async function carregarDados() {
  const container = document.getElementById('comp-content');
  const empty = document.getElementById('comp-empty');
  const loader = document.getElementById('comp-loader');

  container.style.display = 'none';
  empty.style.display = 'none';
  loader.style.display = 'flex';

  try {
    const inicio = document.getElementById('comp-mes-inicio').value;
    const fim = document.getElementById('comp-mes-fim').value;

    const data = await obterComparativoMensal(inicio, fim);
    
    loader.style.display = 'none';

    if (!data || !data.meses || data.meses.length === 0) {
      empty.style.display = 'flex';
      return;
    }

    container.style.display = 'block';
    preencherCards(data);
    preencherInsights(data);
    renderGraficos(data.meses);
    renderTabela(data.meses);
    if (window.lucide) window.lucide.createIcons();

  } catch (err) {
    console.error('Erro comparativo mensal:', err);
    loader.style.display = 'none';
    alert('Erro ao carregar comparativo mensal.');
  }
}

function preencherCards(data) {
  const r = data.resumo;
  const meses = data.meses;
  
  const el = (id, html) => { const e = document.getElementById(id); if (e) e.innerHTML = html; };
  
  el('card-comp-melhor', r.melhor_mes_saldo ? `${formatarMoedaBR(r.melhor_mes_saldo.valor)}<div style="font-size:0.8rem;color:var(--text-muted);font-weight:normal;">${r.melhor_mes_saldo.label}</div>` : '-');
  el('card-comp-pior', r.pior_mes_saldo ? `${formatarMoedaBR(r.pior_mes_saldo.valor)}<div style="font-size:0.8rem;color:var(--text-muted);font-weight:normal;">${r.pior_mes_saldo.label}</div>` : '-');
  el('card-comp-prod', r.maior_producao ? `${formatarMoedaBR(r.maior_producao.valor)}<div style="font-size:0.8rem;color:var(--text-muted);font-weight:normal;">${r.maior_producao.label}</div>` : '-');
  el('card-comp-desp', r.maior_gasto ? `${formatarMoedaBR(r.maior_gasto.valor)}<div style="font-size:0.8rem;color:var(--text-muted);font-weight:normal;">${r.maior_gasto.label}</div>` : '-');
  
  el('card-comp-med-ent', formatarMoedaBR(r.media_receitas || 0));
  el('card-comp-med-sai', formatarMoedaBR(r.media_despesas || 0));
  el('card-comp-med-sal', formatarMoedaBR(r.media_saldo_previsto || 0));

  // Variação atual (último mês x penúltimo)
  let varHtml = '-';
  if (meses.length >= 2) {
    const atual = meses[meses.length - 1].saldo_previsto;
    const anterior = meses[meses.length - 2].saldo_previsto;
    if (anterior !== 0) {
      const variacao = ((atual - anterior) / Math.abs(anterior)) * 100;
      const isPos = variacao >= 0;
      const cor = isPos ? 'var(--color-teal)' : 'var(--color-rose)';
      const icon = isPos ? 'trending-up' : 'trending-down';
      const sinal = isPos ? '+' : '';
      varHtml = `<div style="display:flex;align-items:center;gap:6px;color:${cor};font-weight:600;"><i data-lucide="${icon}" style="width:16px;height:16px;"></i> ${sinal}${variacao.toFixed(1)}%</div>`;
    }
  }
  el('card-comp-var', varHtml);
}

function preencherInsights(data) {
  const container = document.getElementById('comp-insights-list');
  const meses = data.meses;
  const r = data.resumo;

  if (meses.length < 2) {
    container.innerHTML = '<div style="color:var(--text-muted);">Registre dados em mais meses para gerar insights comparativos.</div>';
    return;
  }

  const frases = [];
  
  if (r.melhor_mes_saldo) {
    frases.push(`Seu melhor saldo previsto foi em <strong>${r.melhor_mes_saldo.label}</strong> com <strong>${formatarMoedaBR(r.melhor_mes_saldo.valor)}</strong>.`);
  }
  if (r.maior_producao) {
    frases.push(`O mês com maior produção foi <strong>${r.maior_producao.label}</strong>.`);
  }

  const atual = meses[meses.length - 1];
  const anterior = meses[meses.length - 2];

  if (atual.saidas_total > anterior.saidas_total) {
    frases.push(`As despesas <span style="color:var(--color-rose);font-weight:bold;">aumentaram</span> em relação a ${anterior.label}.`);
  } else if (atual.saidas_total < anterior.saidas_total) {
    frases.push(`As despesas <span style="color:var(--color-teal);font-weight:bold;">diminuíram</span> em relação a ${anterior.label}.`);
  }

  if (atual.saldo_previsto > anterior.saldo_previsto) {
    frases.push(`O saldo previsto <span style="color:var(--color-teal);font-weight:bold;">melhorou</span> em comparação a ${anterior.label}.`);
  } else if (atual.saldo_previsto < anterior.saldo_previsto) {
    frases.push(`O saldo previsto <span style="color:var(--color-rose);font-weight:bold;">piorou</span> em comparação a ${anterior.label}.`);
  }

  let html = '<ul style="list-style-type:none;padding:0;margin:0;display:flex;flex-direction:column;gap:12px;">';
  frases.forEach(f => {
    html += `<li style="display:flex;align-items:flex-start;gap:10px;color:var(--text-primary);font-size:0.95rem;">
      <i data-lucide="zap" style="color:var(--color-gold);width:18px;height:18px;margin-top:2px;flex-shrink:0;"></i>
      <span>${f}</span>
    </li>`;
  });
  html += '</ul>';
  container.innerHTML = html;
}

function destroyChart(key) { if (charts[key]) { charts[key].destroy(); charts[key] = null; } }

function renderChart(canvasId, config) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  if (charts[canvasId]) charts[canvasId].destroy();
  charts[canvasId] = new Chart(canvas, config);
}

function renderGraficos(meses) {
  const labels = meses.map(m => m.label);

  // 1. Evolução do saldo previsto
  renderChart('chart-comp-saldo', {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Saldo Previsto',
        data: meses.map(m => m.saldo_previsto),
        borderColor: '#8b5cf6',
        backgroundColor: 'rgba(139, 92, 246, 0.1)',
        borderWidth: 2,
        tension: 0.3,
        fill: true,
        pointBackgroundColor: '#8b5cf6'
      }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { ticks: { callback: v => formatarMoedaBR(v) } } } }
  });

  // 2. Entradas x Saídas
  renderChart('chart-comp-es', {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Entradas', data: meses.map(m => m.entradas_total), backgroundColor: '#14b8a6', borderRadius: 4 },
        { label: 'Saídas', data: meses.map(m => m.saidas_total), backgroundColor: '#f43f5e', borderRadius: 4 }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false, scales: { y: { ticks: { callback: v => formatarMoedaBR(v) } } } }
  });

  // 3. Trabalho produzido x recebido
  renderChart('chart-comp-trab', {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Produzido', data: meses.map(m => m.trabalho_produzido), backgroundColor: '#3b82f6', borderRadius: 4 },
        { label: 'Recebido', data: meses.map(m => m.trabalho_recebido), backgroundColor: '#06b6d4', borderRadius: 4 },
        { label: 'A Receber', data: meses.map(m => m.trabalho_a_receber), backgroundColor: '#f59e0b', borderRadius: 4 }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false, scales: { y: { ticks: { callback: v => formatarMoedaBR(v) } } } }
  });

  // 4. Despesas por grupo
  renderChart('chart-comp-despesas', {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Gastos', data: meses.map(m => m.gastos_pagos), backgroundColor: '#f43f5e' },
        { label: 'Cartões', data: meses.map(m => m.cartoes_total), backgroundColor: '#8b5cf6' },
        { label: 'Contas', data: meses.map(m => m.contas_pagas + m.contas_pendentes), backgroundColor: '#eab308' },
        { label: 'Pessoas (Eu Devo)', data: meses.map(m => m.eu_devo), backgroundColor: '#fb923c' }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true, ticks: { callback: v => formatarMoedaBR(v) } } } }
  });

  // 5. Saldo real x saldo previsto
  renderChart('chart-comp-realprev', {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Saldo Real', data: meses.map(m => m.saldo_real), borderColor: '#10b981', borderWidth: 2, tension: 0.3 },
        { label: 'Saldo Previsto', data: meses.map(m => m.saldo_previsto), borderColor: '#8b5cf6', borderWidth: 2, tension: 0.3, borderDash: [5, 5] }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false, scales: { y: { ticks: { callback: v => formatarMoedaBR(v) } } } }
  });
}

function renderTabela(meses) {
  const tbody = document.getElementById('comp-tbody');
  if (!tbody) return;

  let h = '';
  meses.forEach(m => {
    const srCor = m.saldo_real >= 0 ? 'var(--color-teal)' : 'var(--color-rose)';
    const spCor = m.saldo_previsto >= 0 ? 'var(--color-teal)' : 'var(--color-rose)';

    h += `<tr>
      <td style="font-weight:600;">${m.label}</td>
      <td>${formatarMoedaBR(m.trabalho_produzido)}</td>
      <td>${formatarMoedaBR(m.trabalho_recebido)}</td>
      <td>${formatarMoedaBR(m.trabalho_a_receber)}</td>
      <td>${formatarMoedaBR(m.receitas_recebidas)}</td>
      <td>${formatarMoedaBR(m.gastos_pagos)}</td>
      <td>${formatarMoedaBR(m.cartoes_total)}</td>
      <td>${formatarMoedaBR(m.contas_pagas + m.contas_pendentes)}</td>
      <td>${formatarMoedaBR(m.comprometido)}</td>
      <td style="color:${srCor};font-weight:600;">${formatarMoedaBR(m.saldo_real)}</td>
      <td style="color:${spCor};font-weight:600;">${formatarMoedaBR(m.saldo_previsto)}</td>
    </tr>`;
  });
  tbody.innerHTML = h;
}

window.atualizarComparativoMensal = async function() { await carregarDados(); };

export function renderComparativoMensal() {

  
  let s = '';

  // Header
  s += `<div class="page-header animate-in" style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:32px;flex-wrap:wrap;gap:16px;">
    <div>
      <h1 class="page-header__title" style="font-size:2.2rem;font-weight:700;margin-bottom:6px;">Comparativo Mensal</h1>
      <p class="page-header__subtitle">Compare sua produção, entradas, despesas e saldo entre os meses.</p>
    </div>
    <div style="display:flex;gap:12px;align-items:center;background:var(--bg-card);padding:6px 12px;border-radius:var(--radius-md);border:1px solid var(--border-subtle);box-shadow:var(--shadow-sm);">
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:0.85rem;color:var(--text-muted);font-weight:500;">De</span>
        <input type="month" id="comp-mes-inicio" class="form-control" style="width:130px;height:36px;border:none;background:var(--bg-surface);color:var(--text-primary);border-radius:6px;padding:0 10px;">
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:0.85rem;color:var(--text-muted);font-weight:500;">Até</span>
        <input type="month" id="comp-mes-fim" class="form-control" style="width:130px;height:36px;border:none;background:var(--bg-surface);color:var(--text-primary);border-radius:6px;padding:0 10px;">
      </div>
      <div style="width:1px;height:24px;background:var(--border-default);"></div>
      <button class="btn btn-primary" onclick="window.atualizarComparativoMensal()" style="height:36px;padding:0 16px;display:flex;align-items:center;gap:6px;">
        <i data-lucide="refresh-cw" style="width:16px;height:16px;"></i> Atualizar
      </button>
    </div>
  </div>`;

  // Loader
  s += `<div id="comp-loader" style="display:none;flex-direction:column;align-items:center;justify-content:center;padding:80px 20px;margin-top:40px;">
    <div class="spinner" style="border:3px solid var(--border-default);border-top-color:var(--color-primary);border-radius:50%;width:40px;height:40px;animation:spin 1s linear infinite;"></div>
    <div style="margin-top:16px;color:var(--text-muted);font-weight:500;">Processando comparativo...</div>
  </div>`;

  // Empty state
  s += `<div id="comp-empty" style="display:none;flex-direction:column;align-items:center;justify-content:center;padding:80px 20px;background:var(--bg-card);border:1px dashed var(--border-default);border-radius:var(--radius-lg);margin-top:40px;">
    <div style="width:64px;height:64px;border-radius:50%;background:var(--bg-surface);display:flex;align-items:center;justify-content:center;margin-bottom:24px;">
      <i data-lucide="calendar-off" style="width:32px;height:32px;color:var(--text-muted);"></i>
    </div>
    <h3 style="font-size:1.2rem;font-weight:600;color:var(--text-primary);margin-bottom:8px;">Nenhum dado encontrado para comparar.</h3>
    <p style="color:var(--text-secondary);text-align:center;max-width:400px;line-height:1.5;">Altere o período dos filtros ou registre dados em mais de um mês para visualizar a evolução financeira.</p>
  </div>`;

  // Content
  s += '<div id="comp-content" style="display:none;">';

  // Cards Superiores
  s += '<div class="metrics-grid animate-in" style="animation-delay:0.1s;margin-bottom:32px;">';
  s += metricCard('Melhor Mês', 'card-comp-melhor', 'award', 'var(--color-gold)', 'var(--color-gold-dim)');
  s += metricCard('Pior Mês', 'card-comp-pior', 'alert-circle', 'var(--color-rose)', 'var(--color-rose-dim)');
  s += metricCard('Maior Produção', 'card-comp-prod', 'briefcase', 'var(--color-blue)', 'var(--color-blue-dim)');
  s += metricCard('Maior Despesa', 'card-comp-desp', 'arrow-down-right', 'var(--color-rose)', 'var(--color-rose-dim)');
  s += metricCard('Média de Entradas', 'card-comp-med-ent', 'arrow-up-circle', 'var(--color-teal)', 'var(--color-teal-dim)');
  s += metricCard('Média de Saídas', 'card-comp-med-sai', 'arrow-down-circle', 'var(--color-rose)', 'var(--color-rose-dim)');
  s += metricCard('Média de Saldo', 'card-comp-med-sal', 'wallet', 'var(--color-purple)', 'var(--color-purple-dim)');
  s += metricCard('Variação Atual', 'card-comp-var', 'activity', 'var(--text-primary)', 'var(--bg-surface)');
  s += '</div>';

  // Insights
  s += `<div class="dashboard-panel animate-in" style="margin-bottom:32px;border-left:4px solid var(--color-purple);">
    <div class="dashboard-panel__header"><h3 class="dashboard-panel__title" style="display:flex;align-items:center;gap:8px;"><i data-lucide="lightbulb" style="color:var(--color-gold);"></i> Insights do período</h3></div>
    <div id="comp-insights-list" style="padding:8px 0;"></div>
  </div>`;

  // Gráficos Linha 1
  s += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(450px,1fr));gap:24px;margin-bottom:24px;" class="animate-in">';
  s += chartPanel('Evolução do Saldo Previsto', 'chart-comp-saldo', 300);
  s += chartPanel('Entradas x Saídas', 'chart-comp-es', 300);
  s += '</div>';

  // Gráficos Linha 2
  s += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(450px,1fr));gap:24px;margin-bottom:24px;" class="animate-in">';
  s += chartPanel('Trabalho Produzido x Recebido', 'chart-comp-trab', 300);
  s += chartPanel('Despesas por Grupo', 'chart-comp-despesas', 300);
  s += '</div>';

  // Gráfico Saldo Real x Previsto
  s += '<div style="margin-bottom:32px;" class="animate-in">';
  s += chartPanel('Saldo Real x Saldo Previsto', 'chart-comp-realprev', 300);
  s += '</div>';

  // Tabela Comparativa
  s += `<div class="dashboard-panel animate-in" style="margin-bottom:32px;">
    <div class="dashboard-panel__header"><h3 class="dashboard-panel__title">Tabela Comparativa Detalhada</h3></div>
    <div style="overflow-x:auto;">
      <table class="table" style="width:100%;font-size:0.9rem;">
        <thead>
          <tr>
            <th>Mês</th>
            <th>Trab. Produzido</th>
            <th>Trab. Recebido</th>
            <th>A Receber</th>
            <th>Rec. Recebidas</th>
            <th>Gastos Pagos</th>
            <th>Cartões</th>
            <th>Contas</th>
            <th>Comprometido</th>
            <th>Saldo Real</th>
            <th>Saldo Previsto</th>
          </tr>
        </thead>
        <tbody id="comp-tbody"></tbody>
      </table>
    </div>
  </div>`;

  s += '</div>'; // Fecha content
  return s;
}

function metricCard(label, id, icon, color, bg) {
  return `<div class="metric-card">
    <div class="metric-card__header">
      <div class="metric-card__label-top">${label}</div>
      <div class="metric-card__icon" style="background:${bg};"><i data-lucide="${icon}" style="color:${color};"></i></div>
    </div>
    <div class="metric-card__body">
      <div class="metric-card__value" id="${id}" style="font-size:1.4rem;">...</div>
    </div>
  </div>`;
}

function chartPanel(title, canvasId, height) {
  return `<div class="dashboard-panel">
    <div class="dashboard-panel__header"><h3 class="dashboard-panel__title">${title}</h3></div>
    <div style="height:${height}px;position:relative;"><canvas id="${canvasId}"></canvas></div>
  </div>`;
}
