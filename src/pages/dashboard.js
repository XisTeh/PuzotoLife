import { obterDashboard } from '../services/api.js';
import { formatarMoedaBR, formatarDataBR, mesAtualReferencia } from '../utils/formatters.js';
import { navigateTo } from '../state.js';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

let chartReceitasDespesas = null;
let chartTrabalho = null;

export async function initDashboard() {
  const mesInput = document.getElementById('dashboard-mes');
  if (!mesInput.value) {
    mesInput.value = mesAtualReferencia();
  }

  await carregarDadosDashboard();
}

async function carregarDadosDashboard() {
  try {
    const mes = document.getElementById('dashboard-mes').value;
    const data = await obterDashboard(mes);
    
    // Atualizar UI com os dados
    atualizarHeroCard(data.resumo);
    atualizarCards(data.resumo);
    atualizarAlertas(data.alertas);
    atualizarGraficos(data.graficos);

    // Re-inicia os ícones para novos elementos
    if (window.lucide) {
      window.lucide.createIcons();
    }
  } catch (err) {
    console.error('Erro ao carregar dashboard:', err);
    // TODO: show error state
  }
}

function atualizarHeroCard(resumo) {
  const heroSaldoReal = document.getElementById('hero-saldo-real');
  const heroSaldo = document.getElementById('hero-saldo');
  const heroProduzido = document.getElementById('hero-produzido');
  const heroComprometido = document.getElementById('hero-comprometido');
  const heroCofre = document.getElementById('hero-cofre');
  const heroStatus = document.getElementById('hero-status');

  if (heroSaldoReal) heroSaldoReal.textContent = formatarMoedaBR(resumo.saldo_atual);
  if (heroSaldo) heroSaldo.textContent = formatarMoedaBR(resumo.saldo_previsto);
  if (heroProduzido) heroProduzido.textContent = formatarMoedaBR(resumo.trabalho_produzido);
  if (heroComprometido) heroComprometido.textContent = formatarMoedaBR(resumo.comprometido);
  if (heroCofre) heroCofre.textContent = formatarMoedaBR(resumo.saldo_investido_atual);

  if (heroStatus) {
    if (resumo.saldo_previsto >= 0) {
      heroStatus.innerHTML = '<i data-lucide="check-circle" style="color: var(--color-teal); width: 16px; height: 16px;"></i><span style="color: var(--color-teal); font-weight: 500;">Mês Positivo</span>';
    } else {
      heroStatus.innerHTML = '<i data-lucide="alert-triangle" style="color: var(--color-rose); width: 16px; height: 16px;"></i><span style="color: var(--color-rose); font-weight: 500;">Atenção: Saldo Negativo</span>';
    }
  }
}

function atualizarCards(resumo) {
  document.getElementById('card-produzido').textContent = formatarMoedaBR(resumo.trabalho_produzido);
  document.getElementById('card-recebido').textContent = formatarMoedaBR(resumo.receitas_recebidas);
  document.getElementById('card-areceber').textContent = formatarMoedaBR(resumo.trabalho_a_receber + resumo.receitas_previstas + resumo.me_devem);
  
  const totalPago = resumo.gastos_pagos + (resumo.cartoes_pagos || 0) + (resumo.contas_pagas || 0);
  document.getElementById('card-gastos').textContent = formatarMoedaBR(totalPago);
  
  document.getElementById('card-cartoes').textContent = formatarMoedaBR(resumo.cartoes_abertos);
  document.getElementById('card-contas').textContent = formatarMoedaBR(resumo.contas_pendentes);
  document.getElementById('card-comprometido').textContent = formatarMoedaBR(resumo.comprometido);
  document.getElementById('card-saldo').textContent = formatarMoedaBR(resumo.saldo_previsto);
}

function atualizarAlertas(alertas) {
  const container = document.getElementById('alertas-container');
  const badge = document.getElementById('alertas-badge');
  
  let html = '';
  let totalAlertas = 0;

  // Contas vencendo
  alertas.contas_vencendo.forEach(c => {
    totalAlertas++;
    html += `
      <div class="alert-item">
        <div class="alert-item__icon" style="background: var(--color-gold-dim);">
          <i data-lucide="receipt" style="color: var(--color-gold);"></i>
        </div>
        <div class="alert-item__content">
          <div class="alert-item__title">Conta vencendo: ${c.nome}</div>
          <div class="alert-item__desc">Valor: ${formatarMoedaBR(c.valor)}</div>
        </div>
        <div class="alert-item__time">${formatarDataBR(c.vencimento)}</div>
      </div>
    `;
  });

  // Faturas vencendo
  alertas.faturas_vencendo.forEach(f => {
    totalAlertas++;
    html += `
      <div class="alert-item">
        <div class="alert-item__icon" style="background: var(--color-rose-dim);">
          <i data-lucide="credit-card" style="color: var(--color-rose);"></i>
        </div>
        <div class="alert-item__content">
          <div class="alert-item__title">Fatura vencendo: ${f.cartao_nome}</div>
          <div class="alert-item__desc">Valor: ${formatarMoedaBR(f.valor)}</div>
        </div>
        <div class="alert-item__time">${formatarDataBR(f.vencimento)}</div>
      </div>
    `;
  });

  // Receitas previstas
  alertas.receitas_previstas.forEach(r => {
    totalAlertas++;
    html += `
      <div class="alert-item">
        <div class="alert-item__icon" style="background: var(--color-teal-dim);">
          <i data-lucide="arrow-up-circle" style="color: var(--color-teal);"></i>
        </div>
        <div class="alert-item__content">
          <div class="alert-item__title">Receita prevista: ${r.descricao}</div>
          <div class="alert-item__desc">Valor: ${formatarMoedaBR(r.valor)}</div>
        </div>
        <div class="alert-item__time">${formatarDataBR(r.data)}</div>
      </div>
    `;
  });

  // Pessoas/Dívidas
  alertas.pendencias_pessoas.forEach(p => {
    totalAlertas++;
    const tipo = p.tipo === 'eu_devo' ? 'Eu Devo' : 'Me Devem';
    const color = p.tipo === 'eu_devo' ? 'var(--color-rose)' : 'var(--color-teal)';
    const bg = p.tipo === 'eu_devo' ? 'var(--color-rose-dim)' : 'var(--color-teal-dim)';
    html += `
      <div class="alert-item">
        <div class="alert-item__icon" style="background: ${bg};">
          <i data-lucide="users" style="color: ${color};"></i>
        </div>
        <div class="alert-item__content">
          <div class="alert-item__title">Pessoa pendente: ${p.pessoa}</div>
          <div class="alert-item__desc">${tipo}: ${formatarMoedaBR(p.valor)}</div>
        </div>
        <div class="alert-item__time">${formatarDataBR(p.data_combinada)}</div>
      </div>
    `;
  });

  if (totalAlertas === 0) {
    html = '<div style="color: var(--text-muted); font-size: 0.9rem; padding: 16px; text-align: center;">Nenhum alerta importante para este período.</div>';
  }

  container.innerHTML = html;
  if (badge) badge.textContent = `${totalAlertas} Alerta${totalAlertas !== 1 ? 's' : ''}`;
}

function atualizarGraficos(graficos) {
  // Gráfico Receitas x Despesas
  const ctxRD = document.getElementById('chart-receitas-despesas');
  if (ctxRD) {
    if (chartReceitasDespesas) chartReceitasDespesas.destroy();
    
    chartReceitasDespesas = new Chart(ctxRD, {
      type: 'bar',
      data: {
        labels: graficos.receitas_vs_despesas.map(g => g.nome),
        datasets: [{
          label: 'Valor (R$)',
          data: graficos.receitas_vs_despesas.map(g => g.valor),
          backgroundColor: graficos.receitas_vs_despesas.map(g => g.cor),
          borderRadius: 4,
          barPercentage: 0.6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { color: 'rgba(255, 255, 255, 0.5)' }
          },
          x: {
            grid: { display: false },
            ticks: { color: 'rgba(255, 255, 255, 0.7)' }
          }
        }
      }
    });
  }

  // Gráfico Trabalho
  const ctxTrab = document.getElementById('chart-trabalho-empresa');
  if (ctxTrab) {
    if (chartTrabalho) chartTrabalho.destroy();
    
    chartTrabalho = new Chart(ctxTrab, {
      type: 'doughnut',
      data: {
        labels: graficos.trabalho_por_empresa.map(g => g.nome),
        datasets: [{
          data: graficos.trabalho_por_empresa.map(g => g.valor),
          backgroundColor: ['#14b8a6', '#3b82f6', '#8b5cf6', '#f59e0b', '#06b6d4', '#ec4899', '#10b981'],
          borderWidth: 0,
          cutout: '75%'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { 
            position: 'right',
            labels: { color: 'rgba(255, 255, 255, 0.7)', padding: 20, usePointStyle: true, font: { size: 12 } }
          }
        }
      }
    });
  }
}

// Global scope for events
window.atualizarDashboard = async () => {
  await carregarDadosDashboard();
};

window.navegarAcaoRapida = (pagina) => {
  navigateTo(pagina);
};

export function renderDashboard() {


  return `
    <div class="page-header animate-in" style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 24px;">
      <div>
        <h1 class="page-header__title" style="font-size: 2.2rem; font-weight: 700; margin-bottom: 6px;">Visão geral</h1>
        <p class="page-header__subtitle">Acompanhe sua produção, finanças, cartões e saldo previsto em um só lugar.</p>
      </div>
      <div style="display: flex; gap: 8px; align-items: center; background: var(--bg-card); padding: 6px 12px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle); box-shadow: var(--shadow-sm);">
        <div style="position: relative; display: flex; align-items: center;">
          <i data-lucide="calendar" style="position: absolute; left: 12px; width: 18px; height: 18px; color: var(--text-muted); pointer-events: none;"></i>
          <input type="month" id="dashboard-mes" aria-label="Mês de referência" class="form-control" style="width: 205px; height: 44px; padding-left: 40px; border: none; background: transparent; cursor: pointer; color: var(--text-primary); font-weight: 600; font-size: 0.95rem; box-shadow: none;" onchange="window.atualizarDashboard()">
        </div>
        <div style="width: 1px; height: 24px; background: var(--border-default);"></div>
        <button class="btn-icon" onclick="window.atualizarDashboard()" style="border: none; background: transparent; box-shadow: none; color: var(--text-muted);" title="Atualizar">
          <i data-lucide="refresh-cw"></i>
        </button>
      </div>
    </div>

    <section class="hero-card account-summary" aria-labelledby="summaryTitle">
      <div>
        <p class="eyebrow">RESUMO DO MÊS</p>
        <h2 id="summaryTitle">Seu dinheiro, com clareza.</h2>
        <div class="dashboard-hero-metrics" style="background: rgba(0,0,0,0.25); border-radius: var(--radius-lg); border: 1px solid rgba(255,255,255,0.05); backdrop-filter: blur(10px);">
          <div class="dashboard-hero-metric">
            <div style="display: flex; align-items: center; gap: 6px; font-size: 0.85rem; color: var(--text-muted); font-weight: 500; margin-bottom: 8px;">
              <i data-lucide="wallet" style="width: 14px; height: 14px;"></i> Saldo Real
            </div>
            <div id="hero-saldo-real" style="font-size: 2.0rem; font-weight: 800; color: #fff; letter-spacing: -0.02em;">R$ ...</div>
            <div style="margin-top: 8px; font-size: 0.8rem; color: var(--text-muted);">Dinheiro em conta hoje</div>
          </div>

          <div class="dashboard-hero-metric">
            <div style="display: flex; align-items: center; gap: 6px; font-size: 0.85rem; color: var(--text-muted); font-weight: 500; margin-bottom: 8px;">
              <i data-lucide="trending-up" style="width: 14px; height: 14px;"></i> Saldo Previsto
            </div>
            <div id="hero-saldo" style="font-size: 2.0rem; font-weight: 800; color: var(--color-teal); letter-spacing: -0.02em;">R$ ...</div>
            <div id="hero-status" style="margin-top: 8px; font-size: 0.8rem;">...</div>
          </div>

          <div class="dashboard-hero-metric">
            <div style="display: flex; align-items: center; gap: 6px; font-size: 0.85rem; color: var(--text-muted); font-weight: 500; margin-bottom: 8px;">
              <i data-lucide="briefcase" style="width: 14px; height: 14px;"></i> Produzido
            </div>
            <div id="hero-produzido" style="font-size: 1.6rem; font-weight: 700; color: #fff; letter-spacing: -0.01em;">R$ ...</div>
          </div>

          <div class="dashboard-hero-metric">
            <div style="display: flex; align-items: center; gap: 6px; font-size: 0.85rem; color: var(--text-muted); font-weight: 500; margin-bottom: 8px;">
              <i data-lucide="alert-triangle" style="width: 14px; height: 14px;"></i> Comprometido
            </div>
            <div id="hero-comprometido" style="font-size: 1.6rem; font-weight: 700; color: var(--color-rose); letter-spacing: -0.01em;">R$ ...</div>
          </div>

          <div class="dashboard-hero-metric">
            <div style="display: flex; align-items: center; gap: 6px; font-size: 0.85rem; color: var(--text-muted); font-weight: 500; margin-bottom: 8px;">
              <i data-lucide="piggy-bank" style="width: 14px; height: 14px;"></i> Cofre
            </div>
            <div id="hero-cofre" style="font-size: 1.6rem; font-weight: 800; color: var(--color-gold); letter-spacing: -0.01em;">R$ ...</div>
            <div style="margin-top: 8px; font-size: 0.8rem; color: var(--text-muted);">Guardado no Inter</div>
          </div>
        </div>
      </div>
    </section>

    <!-- Metrics Grid - 4 Columns -->
    <div class="metrics-grid animate-in" style="animation-delay: 0.1s;">
      
      <div class="metric-card">
        <div class="metric-card__header">
          <div class="metric-card__label-top">Produzido no trabalho</div>
          <div class="metric-card__icon" style="background: var(--color-teal-dim);">
            <i data-lucide="briefcase" style="color: var(--color-teal);"></i>
          </div>
        </div>
        <div class="metric-card__body">
          <div class="metric-card__value" id="card-produzido">...</div>
          <div class="metric-card__desc">Total fechado/produzido no mês</div>
        </div>
      </div>

      <div class="metric-card">
        <div class="metric-card__header">
          <div class="metric-card__label-top">Recebido</div>
          <div class="metric-card__icon" style="background: var(--color-blue-dim);">
            <i data-lucide="dollar-sign" style="color: var(--color-blue);"></i>
          </div>
        </div>
        <div class="metric-card__body">
          <div class="metric-card__value" id="card-recebido">...</div>
          <div class="metric-card__desc">Entradas recebidas no mês</div>
        </div>
      </div>

      <div class="metric-card">
        <div class="metric-card__header">
          <div class="metric-card__label-top">A receber</div>
          <div class="metric-card__icon" style="background: var(--color-gold-dim);">
            <i data-lucide="clock" style="color: var(--color-gold);"></i>
          </div>
        </div>
        <div class="metric-card__body">
          <div class="metric-card__value" id="card-areceber">...</div>
          <div class="metric-card__desc">Valores previstos ou pendentes</div>
        </div>
      </div>

      <div class="metric-card">
        <div class="metric-card__header">
          <div class="metric-card__label-top">Saldo previsto</div>
          <div class="metric-card__icon" style="background: var(--color-purple-dim);">
            <i data-lucide="wallet" style="color: var(--color-purple);"></i>
          </div>
        </div>
        <div class="metric-card__body">
          <div class="metric-card__value" id="card-saldo">...</div>
          <div class="metric-card__desc">Estimativa considerando entradas e saídas</div>
        </div>
      </div>

      <div class="metric-card">
        <div class="metric-card__header">
          <div class="metric-card__label-top">Total pago</div>
          <div class="metric-card__icon" style="background: var(--color-rose-dim);">
            <i data-lucide="arrow-down-circle" style="color: var(--color-rose);"></i>
          </div>
        </div>
        <div class="metric-card__body">
          <div class="metric-card__value" id="card-gastos">...</div>
          <div class="metric-card__desc">Avulsos, cartões e contas pagos</div>
        </div>
      </div>

      <div class="metric-card">
        <div class="metric-card__header">
          <div class="metric-card__label-top">Cartões em aberto</div>
          <div class="metric-card__icon" style="background: var(--color-rose-dim);">
            <i data-lucide="credit-card" style="color: var(--color-rose);"></i>
          </div>
        </div>
        <div class="metric-card__body">
          <div class="metric-card__value" id="card-cartoes">...</div>
          <div class="metric-card__desc">Faturas abertas ou fechadas não pagas</div>
        </div>
      </div>

      <div class="metric-card">
        <div class="metric-card__header">
          <div class="metric-card__label-top">Contas pendentes</div>
          <div class="metric-card__icon" style="background: var(--color-gold-dim);">
            <i data-lucide="receipt" style="color: var(--color-gold);"></i>
          </div>
        </div>
        <div class="metric-card__body">
          <div class="metric-card__value" id="card-contas">...</div>
          <div class="metric-card__desc">Contas ainda não pagas</div>
        </div>
      </div>

      <div class="metric-card">
        <div class="metric-card__header">
          <div class="metric-card__label-top">Comprometido</div>
          <div class="metric-card__icon" style="background: var(--color-rose-dim);">
            <i data-lucide="alert-triangle" style="color: var(--color-rose);"></i>
          </div>
        </div>
        <div class="metric-card__body">
          <div class="metric-card__value" id="card-comprometido">...</div>
          <div class="metric-card__desc">Total que ainda deve sair</div>
        </div>
      </div>

    </div>

    <!-- Main Grid - Fluxo Financeiro + Alertas -->
    <div class="dashboard-grid animate-in" style="animation-delay: 0.2s;">
      
      <!-- Lado Esquerdo - Gráficos -->
      <div style="display: flex; flex-direction: column; gap: 20px;">
        <div class="dashboard-panel">
          <div class="dashboard-panel__header">
            <h3 class="dashboard-panel__title">Receitas x Despesas</h3>
            <span class="dashboard-panel__badge">Este Mês</span>
          </div>
          <div style="height: 250px; position: relative;">
            <canvas id="chart-receitas-despesas"></canvas>
          </div>
        </div>

        <div class="dashboard-panel">
          <div class="dashboard-panel__header">
            <h3 class="dashboard-panel__title">Trabalho por Empresa</h3>
            <span class="dashboard-panel__badge">Produzido no Mês</span>
          </div>
          <div style="height: 200px; position: relative;">
            <canvas id="chart-trabalho-empresa"></canvas>
          </div>
        </div>
      </div>

      <!-- Lado Direito - Alertas -->
      <div class="dashboard-panel">
        <div class="dashboard-panel__header">
          <h3 class="dashboard-panel__title">Alertas do Mês</h3>
          <span class="dashboard-panel__badge" id="alertas-badge">...</span>
        </div>
        <div class="alert-list" id="alertas-container">
          <div style="text-align: center; color: var(--text-muted); padding: 40px 0;">
            <i data-lucide="loader" class="rotating" style="width: 24px; height: 24px; margin-bottom: 12px;"></i>
            <p>Carregando alertas...</p>
          </div>
        </div>
      </div>

    </div>
  `;
}
