import { obterRelatorioGeral } from '../services/api.js';
import { formatarMoedaBR, formatarDataBR, mesAtualReferencia } from '../utils/formatters.js';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

let chartFluxo = null;
let chartDistSaidas = null;
let chartCategorias = null;
let chartOrigens = null;

export async function initRelatorioGeral() {
  const mesInput = document.getElementById('rel-geral-mes');
  if (!mesInput.value) {
    mesInput.value = mesAtualReferencia();
  }
  await carregarRelatorioGeral();
}

async function carregarRelatorioGeral() {
  const container = document.getElementById('rel-geral-content');
  const emptyState = document.getElementById('rel-geral-empty');
  
  try {
    const mes = document.getElementById('rel-geral-mes').value;
    const data = await obterRelatorioGeral(mes);
    
    // Verifica se tem dados relevantes
    const hasData = data.resumo.total_entradas_potenciais > 0 || data.resumo.total_saidas_potenciais > 0 || data.resumo.trabalho_produzido > 0;

    if (!hasData) {
      container.style.display = 'none';
      emptyState.style.display = 'flex';
      return;
    }

    container.style.display = 'block';
    emptyState.style.display = 'none';

    atualizarCards(data.resumo);
    atualizarProgressoTrabalho(data.resumo);
    atualizarGraficos(data.resumo, data.comparativos);
    atualizarListas(data.rankings);

    if (window.lucide) {
      window.lucide.createIcons();
    }
  } catch (err) {
    console.error('Erro ao carregar relatório geral:', err);
  }
}

function atualizarCards(resumo) {
  document.getElementById('card-entradas-rec').textContent = formatarMoedaBR(resumo.entradas_recebidas);
  document.getElementById('card-entradas-prev').textContent = formatarMoedaBR(resumo.entradas_previstas);
  document.getElementById('card-saidas-pagas').textContent = formatarMoedaBR(resumo.saidas_pagas);
  document.getElementById('card-saidas-pend').textContent = formatarMoedaBR(resumo.saidas_pendentes);
  
  const cardSaldoReal = document.getElementById('card-saldo-real');
  cardSaldoReal.textContent = formatarMoedaBR(resumo.saldo_real);
  cardSaldoReal.style.color = resumo.saldo_real >= 0 ? 'var(--color-teal)' : 'var(--color-rose)';

  const cardSaldoPrev = document.getElementById('card-saldo-prev');
  cardSaldoPrev.textContent = formatarMoedaBR(resumo.saldo_previsto);
  cardSaldoPrev.style.color = resumo.saldo_previsto >= 0 ? 'var(--color-teal)' : 'var(--color-rose)';

  document.getElementById('card-trab-prod').textContent = formatarMoedaBR(resumo.trabalho_produzido);
  document.getElementById('card-trab-arec').textContent = formatarMoedaBR(resumo.trabalho_a_receber);
}

function atualizarProgressoTrabalho(resumo) {
  const percentual = resumo.trabalho_produzido > 0 
    ? (resumo.trabalho_recebido / resumo.trabalho_produzido) * 100 
    : 0;
  
  document.getElementById('trab-perc').textContent = percentual.toFixed(1) + '%';
  document.getElementById('trab-bar').style.width = percentual + '%';
  document.getElementById('trab-rec-val').textContent = formatarMoedaBR(resumo.trabalho_recebido);
  document.getElementById('trab-arec-val').textContent = formatarMoedaBR(resumo.trabalho_a_receber);
}

function atualizarGraficos(resumo, comparativos) {
  // 1. Receitas x Despesas
  const ctxFluxo = document.getElementById('chart-fluxo');
  if (ctxFluxo) {
    if (chartFluxo) chartFluxo.destroy();
    chartFluxo = new Chart(ctxFluxo, {
      type: 'bar',
      data: {
        labels: ['Entradas Rec.', 'Entradas Prev.', 'Saídas Pagas', 'Saídas Pend.'],
        datasets: [{
          data: [
            resumo.entradas_recebidas, 
            resumo.entradas_previstas, 
            resumo.saidas_pagas, 
            resumo.saidas_pendentes
          ],
          backgroundColor: [
            '#14b8a6', // teal
            'rgba(20, 184, 166, 0.5)', // teal opaco
            '#f43f5e', // rose
            'rgba(244, 63, 94, 0.5)' // rose opaco
          ],
          borderRadius: 4
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'rgba(255,255,255,0.5)' } },
          x: { grid: { display: false }, ticks: { color: 'rgba(255,255,255,0.7)' } }
        }
      }
    });
  }

  // 2. Distribuição das Saídas
  const ctxDist = document.getElementById('chart-dist-saidas');
  if (ctxDist) {
    if (chartDistSaidas) chartDistSaidas.destroy();
    chartDistSaidas = new Chart(ctxDist, {
      type: 'doughnut',
      data: {
        labels: comparativos.distribuicao_saidas.map(d => d.nome),
        datasets: [{
          data: comparativos.distribuicao_saidas.map(d => d.valor),
          backgroundColor: ['#f43f5e', '#f59e0b', '#3b82f6', '#8b5cf6'],
          borderWidth: 0, cutout: '70%'
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'right', labels: { color: 'rgba(255,255,255,0.7)', usePointStyle: true } } }
      }
    });
  }

  // 3. Gastos por Categoria
  const ctxCat = document.getElementById('chart-categorias');
  if (ctxCat) {
    if (chartCategorias) chartCategorias.destroy();
    chartCategorias = new Chart(ctxCat, {
      type: 'bar',
      data: {
        labels: comparativos.gastos_por_categoria.map(d => d.nome),
        datasets: [{
          data: comparativos.gastos_por_categoria.map(d => d.valor),
          backgroundColor: '#3b82f6', borderRadius: 4
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'rgba(255,255,255,0.5)' } },
          y: { grid: { display: false }, ticks: { color: 'rgba(255,255,255,0.7)' } }
        }
      }
    });
  }

  // 4. Receitas por Origem
  const ctxOrigem = document.getElementById('chart-origens');
  if (ctxOrigem) {
    if (chartOrigens) chartOrigens.destroy();
    chartOrigens = new Chart(ctxOrigem, {
      type: 'doughnut',
      data: {
        labels: comparativos.receitas_por_origem.map(d => d.nome),
        datasets: [{
          data: comparativos.receitas_por_origem.map(d => d.valor),
          backgroundColor: ['#10b981', '#14b8a6', '#06b6d4', '#3b82f6', '#8b5cf6', '#d946ef', '#f43f5e'],
          borderWidth: 0, cutout: '70%'
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'right', labels: { color: 'rgba(255,255,255,0.7)', usePointStyle: true } } }
      }
    });
  }
}

function atualizarListas(rankings) {
  // Maiores Gastos
  const listGastos = document.getElementById('list-maiores-gastos');
  if (rankings.maiores_gastos.length === 0) {
    listGastos.innerHTML = '<div style="color: var(--text-muted); font-size: 0.9rem; text-align: center; padding: 20px;">Nenhum gasto no mês.</div>';
  } else {
    listGastos.innerHTML = rankings.maiores_gastos.map(g => `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--border-subtle);">
        <div>
          <div style="font-weight: 500; color: var(--text-primary); font-size: 0.95rem;">${g.descricao}</div>
          <div style="font-size: 0.8rem; color: var(--text-muted);">${g.categoria} • ${formatarDataBR(g.data)}</div>
        </div>
        <div style="font-weight: 600; color: var(--color-rose);">${formatarMoedaBR(g.valor)}</div>
      </div>
    `).join('');
  }

  // Maiores Receitas
  const listReceitas = document.getElementById('list-maiores-receitas');
  if (rankings.maiores_receitas.length === 0) {
    listReceitas.innerHTML = '<div style="color: var(--text-muted); font-size: 0.9rem; text-align: center; padding: 20px;">Nenhuma receita no mês.</div>';
  } else {
    listReceitas.innerHTML = rankings.maiores_receitas.map(r => `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--border-subtle);">
        <div>
          <div style="font-weight: 500; color: var(--text-primary); font-size: 0.95rem;">${r.descricao}</div>
          <div style="font-size: 0.8rem; color: var(--text-muted);">${r.origem} • ${formatarDataBR(r.data)}</div>
        </div>
        <div style="font-weight: 600; color: var(--color-teal);">${formatarMoedaBR(r.valor)}</div>
      </div>
    `).join('');
  }

  // Próximos Vencimentos
  const listVencimentos = document.getElementById('list-vencimentos');
  if (rankings.proximos_vencimentos.length === 0) {
    listVencimentos.innerHTML = '<div style="color: var(--text-muted); font-size: 0.9rem; text-align: center; padding: 20px;">Nenhum vencimento próximo.</div>';
  } else {
    listVencimentos.innerHTML = rankings.proximos_vencimentos.map(v => {
      const isAtrasado = new Date(v.data) < new Date(new Date().toISOString().split('T')[0]);
      return `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--border-subtle);">
          <div>
            <div style="font-weight: 500; color: var(--text-primary); font-size: 0.95rem;">${v.descricao}</div>
            <div style="font-size: 0.8rem; color: ${isAtrasado ? 'var(--color-rose)' : 'var(--text-muted)'};"> ${v.tipo} • ${formatarDataBR(v.data)}</div>
          </div>
          <div style="font-weight: 600; color: var(--text-primary);">${formatarMoedaBR(v.valor)}</div>
        </div>
      `;
    }).join('');
  }
}

window.atualizarRelatorioGeral = async () => {
  await carregarRelatorioGeral();
};

export function renderRelatorioGeral() {


  return `
    <div class="page-header animate-in" style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 32px;">
      <div>
        <h1 class="page-header__title" style="font-size: 2.2rem; font-weight: 700; margin-bottom: 6px;">Relatório Geral</h1>
        <p class="page-header__subtitle">Analise entradas, saídas, pendências e saldo previsto do mês.</p>
      </div>
      <div style="display: flex; gap: 8px; align-items: center; background: var(--bg-card); padding: 6px 12px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle); box-shadow: var(--shadow-sm);">
        <div style="position: relative; display: flex; align-items: center;">
          <i data-lucide="calendar" style="position: absolute; left: 12px; width: 18px; height: 18px; color: var(--text-muted); pointer-events: none;"></i>
          <input type="month" id="rel-geral-mes" class="form-control" style="width: 170px; height: 40px; padding-left: 40px; border: none; background: transparent; cursor: pointer; color: var(--text-primary); font-weight: 600; font-size: 0.95rem; box-shadow: none;" onchange="window.atualizarRelatorioGeral()">
        </div>
        <div style="width: 1px; height: 24px; background: var(--border-default);"></div>
        <button class="btn-icon" onclick="window.atualizarRelatorioGeral()" style="border: none; background: transparent; box-shadow: none; color: var(--text-muted);" title="Atualizar">
          <i data-lucide="refresh-cw"></i>
        </button>
      </div>
    </div>

    <!-- Empty State -->
    <div id="rel-geral-empty" style="display: none; flex-direction: column; align-items: center; justify-content: center; padding: 80px 20px; background: var(--bg-card); border: 1px dashed var(--border-default); border-radius: var(--radius-lg); margin-top: 40px;">
      <div style="width: 64px; height: 64px; border-radius: 50%; background: var(--bg-surface); display: flex; align-items: center; justify-content: center; margin-bottom: 24px;">
        <i data-lucide="bar-chart-2" style="width: 32px; height: 32px; color: var(--text-muted);"></i>
      </div>
      <h3 style="font-size: 1.2rem; font-weight: 600; color: var(--text-primary); margin-bottom: 8px;">Nenhum dado encontrado para este mês.</h3>
      <p style="color: var(--text-secondary); text-align: center; max-width: 400px; line-height: 1.5;">Registre lançamentos, gastos, receitas ou contas para alimentar este relatório.</p>
    </div>

    <div id="rel-geral-content" style="display: none;">
      
      <!-- Metrics Grid -->
      <div class="metrics-grid animate-in" style="animation-delay: 0.1s; margin-bottom: 40px;">
        
        <div class="metric-card">
          <div class="metric-card__header">
            <div class="metric-card__label-top">Entradas Recebidas</div>
            <div class="metric-card__icon" style="background: var(--color-teal-dim);"><i data-lucide="arrow-up-circle" style="color: var(--color-teal);"></i></div>
          </div>
          <div class="metric-card__body">
            <div class="metric-card__value" id="card-entradas-rec">...</div>
            <div class="metric-card__desc">Valor já creditado</div>
          </div>
        </div>

        <div class="metric-card">
          <div class="metric-card__header">
            <div class="metric-card__label-top">Entradas Previstas</div>
            <div class="metric-card__icon" style="background: rgba(20, 184, 166, 0.1);"><i data-lucide="clock" style="color: var(--color-teal);"></i></div>
          </div>
          <div class="metric-card__body">
            <div class="metric-card__value" id="card-entradas-prev">...</div>
            <div class="metric-card__desc">Valores aguardando</div>
          </div>
        </div>

        <div class="metric-card">
          <div class="metric-card__header">
            <div class="metric-card__label-top">Saídas Pagas</div>
            <div class="metric-card__icon" style="background: var(--color-rose-dim);"><i data-lucide="arrow-down-circle" style="color: var(--color-rose);"></i></div>
          </div>
          <div class="metric-card__body">
            <div class="metric-card__value" id="card-saidas-pagas">...</div>
            <div class="metric-card__desc">Valor já debitado</div>
          </div>
        </div>

        <div class="metric-card">
          <div class="metric-card__header">
            <div class="metric-card__label-top">Saídas Pendentes</div>
            <div class="metric-card__icon" style="background: rgba(244, 63, 94, 0.1);"><i data-lucide="clock" style="color: var(--color-rose);"></i></div>
          </div>
          <div class="metric-card__body">
            <div class="metric-card__value" id="card-saidas-pend">...</div>
            <div class="metric-card__desc">Aguardando pagamento</div>
          </div>
        </div>

        <div class="metric-card" style="background: var(--bg-surface);">
          <div class="metric-card__header">
            <div class="metric-card__label-top">Saldo Real</div>
            <div class="metric-card__icon" style="background: var(--color-blue-dim);"><i data-lucide="dollar-sign" style="color: var(--color-blue);"></i></div>
          </div>
          <div class="metric-card__body">
            <div class="metric-card__value" id="card-saldo-real">...</div>
            <div class="metric-card__desc">Dinheiro efetivo em mãos</div>
          </div>
        </div>

        <div class="metric-card" style="background: var(--bg-surface);">
          <div class="metric-card__header">
            <div class="metric-card__label-top">Saldo Previsto</div>
            <div class="metric-card__icon" style="background: var(--color-purple-dim);"><i data-lucide="wallet" style="color: var(--color-purple);"></i></div>
          </div>
          <div class="metric-card__body">
            <div class="metric-card__value" id="card-saldo-prev">...</div>
            <div class="metric-card__desc">Considerando tudo</div>
          </div>
        </div>

        <div class="metric-card">
          <div class="metric-card__header">
            <div class="metric-card__label-top">Trabalho Produzido</div>
            <div class="metric-card__icon" style="background: var(--color-gold-dim);"><i data-lucide="briefcase" style="color: var(--color-gold);"></i></div>
          </div>
          <div class="metric-card__body">
            <div class="metric-card__value" id="card-trab-prod">...</div>
            <div class="metric-card__desc">Soma da produção do mês</div>
          </div>
        </div>

        <div class="metric-card">
          <div class="metric-card__header">
            <div class="metric-card__label-top">Trabalho A Receber</div>
            <div class="metric-card__icon" style="background: rgba(245, 158, 11, 0.1);"><i data-lucide="alert-circle" style="color: var(--color-gold);"></i></div>
          </div>
          <div class="metric-card__body">
            <div class="metric-card__value" id="card-trab-arec">...</div>
            <div class="metric-card__desc">Produzido pendente de pgto</div>
          </div>
        </div>

      </div>

      <!-- Sessões Analíticas -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 24px; margin-bottom: 24px;" class="animate-in" style="animation-delay: 0.2s;">
        
        <!-- Receitas x Despesas -->
        <div class="dashboard-panel">
          <div class="dashboard-panel__header">
            <h3 class="dashboard-panel__title">Visão Financeira</h3>
          </div>
          <div style="height: 250px; position: relative;">
            <canvas id="chart-fluxo"></canvas>
          </div>
        </div>

        <!-- Trabalho Produzido x Recebido -->
        <div class="dashboard-panel">
          <div class="dashboard-panel__header">
            <h3 class="dashboard-panel__title">Conversão do Trabalho</h3>
          </div>
          <div style="display: flex; flex-direction: column; justify-content: center; height: 250px; gap: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: baseline;">
              <span style="font-size: 1rem; color: var(--text-secondary); font-weight: 500;">Taxa de Recebimento</span>
              <span id="trab-perc" style="font-size: 2rem; font-weight: 800; color: var(--color-teal);">0%</span>
            </div>
            
            <div style="width: 100%; height: 16px; background: var(--bg-surface); border-radius: 100px; overflow: hidden; position: relative; border: 1px solid var(--border-default);">
              <div id="trab-bar" style="height: 100%; width: 0%; background: linear-gradient(90deg, var(--color-teal), #059669); border-radius: 100px; transition: width 0.5s ease-out;"></div>
            </div>

            <div style="display: flex; justify-content: space-between; margin-top: 10px;">
              <div style="display: flex; flex-direction: column; gap: 4px;">
                <span style="font-size: 0.8rem; color: var(--text-muted);">Recebido</span>
                <span id="trab-rec-val" style="font-size: 1.1rem; font-weight: 600; color: var(--color-teal);">R$ 0,00</span>
              </div>
              <div style="display: flex; flex-direction: column; gap: 4px; text-align: right;">
                <span style="font-size: 0.8rem; color: var(--text-muted);">A Receber</span>
                <span id="trab-arec-val" style="font-size: 1.1rem; font-weight: 600; color: var(--color-gold);">R$ 0,00</span>
              </div>
            </div>
          </div>
        </div>

      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 24px; margin-bottom: 24px;" class="animate-in" style="animation-delay: 0.3s;">
        
        <!-- Distribuição de Saídas -->
        <div class="dashboard-panel">
          <div class="dashboard-panel__header">
            <h3 class="dashboard-panel__title">Distribuição das Saídas</h3>
          </div>
          <div style="height: 250px; position: relative;">
            <canvas id="chart-dist-saidas"></canvas>
          </div>
        </div>

        <!-- Receitas por Origem -->
        <div class="dashboard-panel">
          <div class="dashboard-panel__header">
            <h3 class="dashboard-panel__title">Receitas por Origem</h3>
          </div>
          <div style="height: 250px; position: relative;">
            <canvas id="chart-origens"></canvas>
          </div>
        </div>

        <!-- Gastos por Categoria -->
        <div class="dashboard-panel">
          <div class="dashboard-panel__header">
            <h3 class="dashboard-panel__title">Gastos por Categoria</h3>
          </div>
          <div style="height: 250px; position: relative;">
            <canvas id="chart-categorias"></canvas>
          </div>
        </div>

      </div>

      <!-- Rankings -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 24px;" class="animate-in" style="animation-delay: 0.4s;">
        
        <!-- Maiores Gastos -->
        <div class="dashboard-panel">
          <div class="dashboard-panel__header">
            <h3 class="dashboard-panel__title">Maiores Gastos</h3>
          </div>
          <div id="list-maiores-gastos" style="display: flex; flex-direction: column;"></div>
        </div>

        <!-- Maiores Receitas -->
        <div class="dashboard-panel">
          <div class="dashboard-panel__header">
            <h3 class="dashboard-panel__title">Maiores Receitas</h3>
          </div>
          <div id="list-maiores-receitas" style="display: flex; flex-direction: column;"></div>
        </div>

        <!-- Próximos Vencimentos -->
        <div class="dashboard-panel">
          <div class="dashboard-panel__header">
            <h3 class="dashboard-panel__title">Próximos Vencimentos</h3>
          </div>
          <div id="list-vencimentos" style="display: flex; flex-direction: column;"></div>
        </div>

      </div>

    </div>
  `;
}
