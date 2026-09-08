import { apiFetch } from '../services/http.js';
import { escapeHtml, setIconMessage } from '../security/safeDom.js';
import { Chart, registerables } from 'chart.js';
import { formatarMoedaBR } from '../utils/formatters.js';

Chart.register(...registerables);

const API_BASE = '/api';

let chartBarras = null;
let chartLinhas = null;

const CORES_EMPRESA = {
  'Diagnóstico':     { bg: 'rgba(20, 184, 166, 0.7)',  border: '#14B8A6' },
  'Perfecta':        { bg: 'rgba(139, 92, 246, 0.7)',   border: '#8B5CF6' },
  'E-Mail':          { bg: 'rgba(34, 197, 94, 0.7)',    border: '#22C55E' },
  'Padrão':          { bg: 'rgba(234, 179, 8, 0.7)',    border: '#EAB308' },
  'Dr. Ranon / RX':  { bg: 'rgba(6, 182, 212, 0.7)',    border: '#06B6D4' }
};

function showToast(message, type = 'success') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  setIconMessage(toast, type === 'success' ? 'check-circle' : (type === 'error' ? 'alert-circle' : 'info'), message);
  container.appendChild(toast);
  lucide.createIcons();
  setTimeout(() => {
    toast.style.animation = 'slideOutRight 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards';
    setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
  }, 3000);
}

function getMesAtual() {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
}

// ═══════════════════════════════════════
// INICIALIZAÇÃO
// ═══════════════════════════════════════

export async function initRelatorioTrabalho() {
  const mesInput = document.getElementById('filtro-mes');
  if (mesInput) mesInput.value = getMesAtual();

  window.atualizarRelatorio = carregarDados;
  await carregarDados();
}

async function carregarDados() {
  const mes = document.getElementById('filtro-mes')?.value || getMesAtual();
  const empresa = document.getElementById('filtro-empresa')?.value || 'todas';
  const status = document.getElementById('filtro-status')?.value || 'todos';

  try {
    const res = await apiFetch(`${API_BASE}/trabalho/analytics?mes=${mes}&empresa=${empresa}&status=${status}`);
    const json = await res.json();

    if (!json.ok) throw new Error(json.error);

    const d = json.data;
    renderCards(d.cards);
    renderMarketShare(d.por_empresa);
    renderGraficoBarras(d.faturamento_diario);
    renderGraficoLinhas(d.evolucao_por_empresa);
    renderTabelaResumo(d.por_empresa);
    renderEstadoVazio(d.cards.qtd_total === 0);
  } catch (err) {
    showToast('Erro ao carregar analytics: ' + err.message, 'error');
  }
}

// ═══════════════════════════════════════
// RENDER CARDS
// ═══════════════════════════════════════

function renderCards(cards) {
  document.getElementById('card-total-produzido').textContent = formatarMoedaBR(cards.total_produzido);
  document.getElementById('card-qtd-total').textContent = cards.qtd_total;
  document.getElementById('card-media-dia').textContent = formatarMoedaBR(cards.media_dia);
  document.getElementById('card-media-dia-desc').textContent = `${cards.qtd_dias_considerados} dias considerados`;
  document.getElementById('card-clinicas-valor').textContent = formatarMoedaBR(cards.total_clinicas_principais);
  document.getElementById('card-clinicas-qtd').textContent = `${cards.qtd_clinicas_principais} laudos`;
  document.getElementById('card-padrao-valor').textContent = formatarMoedaBR(cards.total_padrao);
  document.getElementById('card-padrao-qtd').textContent = `${cards.qtd_padrao} laudos`;
  document.getElementById('card-ranon-valor').textContent = formatarMoedaBR(cards.total_ranon);
  document.getElementById('card-ranon-qtd').textContent = `${cards.qtd_ranon} laudos`;
}

// ═══════════════════════════════════════
// MARKET SHARE
// ═══════════════════════════════════════

function renderMarketShare(porEmpresa) {
  const container = document.getElementById('market-share-container');
  if (!container) return;

  container.innerHTML = porEmpresa.map(e => {
    const cor = CORES_EMPRESA[e.empresa]?.border || '#94a3b8';
    return `
      <div style="margin-bottom: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <span style="font-weight: 600; color: var(--text-primary); font-size: 0.9rem;">${escapeHtml(e.empresa)}</span>
          <div style="display: flex; gap: 16px; align-items: center;">
            <span style="color: var(--text-muted); font-size: 0.8rem;">${e.quantidade} laudos</span>
            <span style="font-weight: 600; color: ${cor};">${formatarMoedaBR(e.total)}</span>
            <span style="color: var(--text-secondary); font-size: 0.85rem; min-width: 50px; text-align: right;">${e.percentual}%</span>
          </div>
        </div>
        <div style="background: var(--bg-surface); border-radius: 4px; height: 8px; overflow: hidden;">
          <div style="width: ${Math.max(e.percentual, 0.5)}%; height: 100%; background: ${cor}; border-radius: 4px; transition: width 0.6s ease;"></div>
        </div>
      </div>
    `;
  }).join('');
}

// ═══════════════════════════════════════
// GRÁFICO DE BARRAS - FATURAMENTO DIÁRIO
// ═══════════════════════════════════════

function renderGraficoBarras(faturamentoDiario) {
  const canvas = document.getElementById('chart-faturamento-diario');
  if (!canvas) return;

  if (chartBarras) chartBarras.destroy();

  const labels = faturamentoDiario.map(d => d.data);
  const valores = faturamentoDiario.map(d => d.total);

  chartBarras = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Faturamento',
        data: valores,
        backgroundColor: 'rgba(20, 184, 166, 0.6)',
        borderColor: '#14B8A6',
        borderWidth: 1,
        borderRadius: 4,
        maxBarThickness: 40
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => formatarMoedaBR(ctx.parsed.y)
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { color: '#94a3b8', callback: val => `R$ ${val}` },
          grid: { color: 'rgba(148, 163, 184, 0.1)' }
        },
        x: {
          ticks: { color: '#94a3b8' },
          grid: { display: false }
        }
      }
    }
  });
}

// ═══════════════════════════════════════
// GRÁFICO DE LINHAS - EVOLUÇÃO POR EMPRESA
// ═══════════════════════════════════════

function renderGraficoLinhas(evolucao) {
  const canvas = document.getElementById('chart-evolucao-empresa');
  if (!canvas) return;

  if (chartLinhas) chartLinhas.destroy();

  const labels = evolucao.map(d => d.data);
  const empresas = ['Diagnóstico', 'Perfecta', 'E-Mail', 'Padrão', 'Dr. Ranon / RX'];

  const datasets = empresas.map(emp => ({
    label: emp,
    data: evolucao.map(d => d[emp] || 0),
    borderColor: CORES_EMPRESA[emp]?.border || '#94a3b8',
    backgroundColor: CORES_EMPRESA[emp]?.bg || 'rgba(148,163,184,0.2)',
    borderWidth: 2,
    fill: false,
    tension: 0.3,
    pointRadius: 3,
    pointHoverRadius: 6
  }));

  chartLinhas = new Chart(canvas, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          labels: { color: '#e2e8f0', usePointStyle: true, pointStyle: 'circle', padding: 16 }
        },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ${formatarMoedaBR(ctx.parsed.y)}`
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { color: '#94a3b8', callback: val => `R$ ${val}` },
          grid: { color: 'rgba(148, 163, 184, 0.1)' }
        },
        x: {
          ticks: { color: '#94a3b8' },
          grid: { display: false }
        }
      }
    }
  });
}

// ═══════════════════════════════════════
// TABELA RESUMO
// ═══════════════════════════════════════

function renderTabelaResumo(porEmpresa) {
  const tbody = document.getElementById('tabela-resumo-body');
  if (!tbody) return;

  tbody.innerHTML = porEmpresa.map(e => {
    const ticket = e.quantidade > 0 ? e.total / e.quantidade : 0;
    const cor = CORES_EMPRESA[e.empresa]?.border || '#94a3b8';
    return `
      <tr>
        <td>
          <span style="display: inline-flex; align-items: center; gap: 8px;">
            <span style="width: 10px; height: 10px; border-radius: 50%; background: ${cor}; display: inline-block;"></span>
            ${escapeHtml(e.empresa)}
          </span>
        </td>
        <td style="text-align: center;">${e.quantidade}</td>
        <td style="text-align: right; font-weight: 600;">${formatarMoedaBR(e.total)}</td>
        <td style="text-align: center;">${e.percentual}%</td>
        <td style="text-align: right; color: var(--text-secondary);">${formatarMoedaBR(ticket)}</td>
      </tr>
    `;
  }).join('');
}

// ═══════════════════════════════════════
// ESTADO VAZIO
// ═══════════════════════════════════════

function renderEstadoVazio(semDados) {
  const el = document.getElementById('estado-vazio-analytics');
  const paineis = document.getElementById('paineis-analytics');
  if (!el || !paineis) return;

  if (semDados) {
    el.style.display = 'flex';
    paineis.style.display = 'none';
  } else {
    el.style.display = 'none';
    paineis.style.display = 'block';
  }
}

// ═══════════════════════════════════════
// ESTRUTURA DA TELA
// ═══════════════════════════════════════

export function renderRelatorioTrabalho() {


  return `
    <div class="page-header animate-in">
      <h1 class="page-header__title">Relatório do Trabalho</h1>
      <p class="page-header__subtitle">Acompanhe sua produção, faturamento, clínicas e evolução do mês.</p>
    </div>

    <!-- Filtros -->
    <div class="form-card animate-in" style="margin-bottom: 24px; padding: 20px 32px;">
      <div style="display: flex; gap: 16px; align-items: flex-end; flex-wrap: wrap;">
        <div class="form-group" style="min-width: 160px;">
          <label class="form-label">Mês de referência</label>
          <input type="month" class="form-control" id="filtro-mes">
        </div>
        <div class="form-group" style="min-width: 180px;">
          <label class="form-label">Empresa / Clínica</label>
          <select class="form-control" id="filtro-empresa">
            <option value="todas">Todas</option>
            <option value="Diagnóstico">Diagnóstico</option>
            <option value="Perfecta">Perfecta</option>
            <option value="E-Mail">E-Mail</option>
            <option value="Padrão">Padrão</option>
            <option value="Dr. Ranon / RX">Dr. Ranon / RX</option>
          </select>
        </div>
        <div class="form-group" style="min-width: 160px;">
          <label class="form-label">Status</label>
          <select class="form-control" id="filtro-status">
            <option value="todos">Todos</option>
            <option value="produzido">Produzido</option>
            <option value="fechado">Fechado</option>
            <option value="recebido">Recebido</option>
            <option value="cancelado">Cancelado</option>
          </select>
        </div>
        <button class="btn-primary" onclick="window.atualizarRelatorio()" style="height: 46px; padding: 0 24px; background: var(--color-teal);">
          <i data-lucide="refresh-cw" style="width: 16px; height: 16px;"></i> Atualizar
        </button>
      </div>
    </div>

    <!-- Estado vazio -->
    <div id="estado-vazio-analytics" class="empty-state" style="display: none;">
      <div class="empty-state__icon-wrap">
        <i data-lucide="bar-chart-2"></i>
      </div>
      <h3 class="empty-state__title">Nenhum dado encontrado</h3>
      <p class="empty-state__desc">Nenhum dado de trabalho encontrado para este período. Faça lançamentos e feche o dia para alimentar este relatório.</p>
    </div>

    <div id="paineis-analytics">

      <!-- Cards KPI -->
      <div class="metrics-grid animate-in" style="grid-template-columns: repeat(3, 1fr); margin-bottom: 24px;">
        <div class="metric-card">
          <div class="metric-card__header"><div class="metric-card__label-top">Total produzido</div></div>
          <div class="metric-card__body">
            <div class="metric-card__value" id="card-total-produzido" style="color: var(--color-teal);">R$ 0,00</div>
            <div class="metric-card__desc" style="margin-top: 4px;">Faturamento do mês</div>
          </div>
        </div>
        <div class="metric-card">
          <div class="metric-card__header"><div class="metric-card__label-top">Quantidade total</div></div>
          <div class="metric-card__body">
            <div class="metric-card__value" id="card-qtd-total">0</div>
            <div class="metric-card__desc" style="margin-top: 4px;">Laudos no período</div>
          </div>
        </div>
        <div class="metric-card">
          <div class="metric-card__header"><div class="metric-card__label-top">Média diária</div></div>
          <div class="metric-card__body">
            <div class="metric-card__value" id="card-media-dia">R$ 0,00</div>
            <div class="metric-card__desc" id="card-media-dia-desc" style="margin-top: 4px;">0 dias considerados</div>
          </div>
        </div>
      </div>

      <div class="metrics-grid animate-in" style="grid-template-columns: repeat(3, 1fr); margin-bottom: 24px;">
        <div class="metric-card">
          <div class="metric-card__header"><div class="metric-card__label-top">Clínicas principais</div></div>
          <div class="metric-card__body">
            <div class="metric-card__value" id="card-clinicas-valor" style="color: #8B5CF6;">R$ 0,00</div>
            <div class="metric-card__desc" id="card-clinicas-qtd" style="margin-top: 4px;">Diagnóstico + Perfecta + E-Mail</div>
          </div>
        </div>
        <div class="metric-card">
          <div class="metric-card__header"><div class="metric-card__label-top">Padrão</div></div>
          <div class="metric-card__body">
            <div class="metric-card__value" id="card-padrao-valor" style="color: #EAB308;">R$ 0,00</div>
            <div class="metric-card__desc" id="card-padrao-qtd" style="margin-top: 4px;">0 laudos</div>
          </div>
        </div>
        <div class="metric-card">
          <div class="metric-card__header"><div class="metric-card__label-top">Dr. Ranon / RX</div></div>
          <div class="metric-card__body">
            <div class="metric-card__value" id="card-ranon-valor" style="color: #06B6D4;">R$ 0,00</div>
            <div class="metric-card__desc" id="card-ranon-qtd" style="margin-top: 4px;">0 laudos</div>
          </div>
        </div>
      </div>

      <!-- Market Share -->
      <div class="form-card animate-in" style="margin-bottom: 24px;">
        <h3 style="margin-bottom: 24px; font-weight: 600; color: var(--text-primary);">Participação por clínica</h3>
        <div id="market-share-container"></div>
      </div>

      <!-- Gráficos -->
      <div class="dashboard-grid animate-in" style="margin-bottom: 24px;">
        <div class="dashboard-panel">
          <div class="dashboard-panel__header">
            <div class="dashboard-panel__title">Faturamento Diário</div>
          </div>
          <div style="height: 280px;">
            <canvas id="chart-faturamento-diario"></canvas>
          </div>
        </div>
        <div class="dashboard-panel">
          <div class="dashboard-panel__header">
            <div class="dashboard-panel__title">Evolução por Clínica</div>
          </div>
          <div style="height: 280px;">
            <canvas id="chart-evolucao-empresa"></canvas>
          </div>
        </div>
      </div>

      <!-- Tabela Resumo -->
      <div class="form-card animate-in">
        <h3 style="margin-bottom: 16px; font-weight: 600; color: var(--text-primary);">Resumo por empresa</h3>
        <div class="table-container" style="margin-bottom: 0;">
          <table class="table">
            <thead>
              <tr>
                <th>Empresa</th>
                <th style="text-align: center;">Quantidade</th>
                <th style="text-align: right;">Total</th>
                <th style="text-align: center;">Participação</th>
                <th style="text-align: right;">Ticket Médio</th>
              </tr>
            </thead>
            <tbody id="tabela-resumo-body">
              <!-- JS -->
            </tbody>
          </table>
        </div>
      </div>

    </div>
  `;
}
