import { apiFetch } from '../services/http.js';
import { formatarMoedaBR, formatarDataBR, dataAtualISO } from '../utils/formatters.js';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

const API_BASE = '/api/financas';

// Estado
let contas = [];
let resumo = null;
let categorias = [];
let chartCategorias = null;

// Filtros Atuais
let mesAtual = dataAtualISO().substring(0, 7); // YYYY-MM
let filtroCategoria = 'todas';
let filtroStatus = 'todos';

// Toasts
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
  toast.innerHTML = `<i data-lucide="${type === 'success' ? 'check-circle' : 'alert-circle'}"></i> <span>${message}</span>`;
  container.appendChild(toast);
  lucide.createIcons();
  setTimeout(() => {
    toast.style.animation = 'slideOutRight 0.3s forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ═══════════════════════════════════════
// API CALLS
// ═══════════════════════════════════════

async function fetchAPI(endpoint, options = {}) {
  const res = await apiFetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Erro na requisição');
  return data.data;
}

export async function initContasPagar() {
  document.getElementById('cp-filtro-mes').value = mesAtual;
  await loadCategorias();
  await loadDados();
}

async function loadCategorias() {
  try {
    const cats = await fetchAPI('/categorias');
    categorias = cats.filter(c => c.tipo === 'gasto' || c.tipo === 'ambos');
    
    // Select do Filtro
    const selFiltro = document.getElementById('cp-filtro-categoria');
    if (selFiltro) {
      selFiltro.innerHTML = '<option value="todas">Todas as Categorias</option>' + 
        categorias.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
    }

    // Select do Formulário
    const selForm = document.getElementById('form-cp-categoria');
    if (selForm) {
      selForm.innerHTML = categorias.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
    }
  } catch (err) {
    showToast('Erro ao carregar categorias: ' + err.message, 'error');
  }
}

window.filtrarContasPagar = async function() {
  mesAtual = document.getElementById('cp-filtro-mes').value;
  filtroCategoria = document.getElementById('cp-filtro-categoria').value;
  filtroStatus = document.getElementById('cp-filtro-status').value;
  await loadDados();
};

async function loadDados() {
  try {
    const p1 = fetchAPI(`/contas-pagar?mes=${mesAtual}&categoria=${filtroCategoria}&status=${filtroStatus}`);
    const p2 = fetchAPI(`/contas-pagar/resumo?mes=${mesAtual}`);
    
    const [cData, rData] = await Promise.all([p1, p2]);
    contas = cData;
    resumo = rData;

    renderMetrics();
    renderChart();
    renderProximosVencimentos();
    renderTabela();
  } catch (err) {
    showToast('Erro ao carregar contas: ' + err.message, 'error');
  }
}

// ═══════════════════════════════════════
// RENDERS
// ═══════════════════════════════════════

function renderMetrics() {
  if (!resumo) return;
  document.getElementById('metrica-cp-pendente').textContent = formatarMoedaBR(resumo.totalPendente);
  document.getElementById('metrica-cp-vencido').textContent = formatarMoedaBR(resumo.totalVencido);
  document.getElementById('metrica-cp-pago').textContent = formatarMoedaBR(resumo.totalPago);
  document.getElementById('metrica-cp-qtd').textContent = resumo.quantidadeContas;

  const prox = resumo.proximoVencimento;
  document.getElementById('metrica-cp-prox').textContent = prox ? `${formatarDataBR(prox.vencimento)} - ${prox.nome}` : 'Nenhum';
}

function renderChart() {
  if (!resumo || !resumo.categorias) return;
  
  const canvas = document.getElementById('chart-cp-categorias');
  if (!canvas) return;

  if (chartCategorias) {
    chartCategorias.destroy();
  }

  const labels = resumo.categorias.map(c => c.categoria_nome);
  const data = resumo.categorias.map(c => c.total);

  // Paleta de cores para o gráfico
  const bgColors = [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', 
    '#14b8a6', '#f97316', '#6366f1', '#ec4899', '#84cc16'
  ];

  chartCategorias = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: bgColors.slice(0, labels.length),
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { color: '#e2e8f0', usePointStyle: true, pointStyle: 'circle' }
        },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.label}: ${formatarMoedaBR(ctx.parsed)}`
          }
        }
      },
      cutout: '70%'
    }
  });
}

function renderProximosVencimentos() {
  const container = document.getElementById('lista-cp-proximos');
  if (!container) return;

  const hojeStr = dataAtualISO();
  const proximaSemana = new Date();
  proximaSemana.setDate(proximaSemana.getDate() + 7);
  const proximaSemanaStr = proximaSemana.toISOString().split('T')[0];

  const proximos = contas.filter(c => 
    (c.status === 'pendente' || c.status === 'atrasado') && 
    c.vencimento >= hojeStr && c.vencimento <= proximaSemanaStr
  ).sort((a,b) => a.vencimento.localeCompare(b.vencimento));

  if (proximos.length === 0) {
    container.innerHTML = '<p style="color: var(--text-muted); font-size: 0.9rem;">Nenhuma conta para os próximos 7 dias.</p>';
    return;
  }

  let html = '';
  proximos.forEach(c => {
    // Calculando dias restantes
    const diasObj = calcularDiferencaDias(hojeStr, c.vencimento);
    const diasTexto = diasObj === 0 ? 'Vence Hoje!' : (diasObj < 0 ? `Atrasado ${Math.abs(diasObj)}d` : `Em ${diasObj} dias`);
    const corDias = diasObj < 0 ? 'var(--color-red)' : (diasObj === 0 ? 'var(--color-yellow)' : 'var(--text-muted)');

    html += `
      <div style="padding: 12px; background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: 8px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div style="font-weight: 600; color: var(--text-primary); font-size: 0.95rem;">${c.nome}</div>
          <div style="font-size: 0.8rem; color: ${corDias}; font-weight: 500;">${diasTexto} (${formatarDataBR(c.vencimento)})</div>
        </div>
        <div style="font-weight: 600; color: var(--text-primary);">
          ${formatarMoedaBR(c.valor)}
        </div>
      </div>
    `;
  });
  container.innerHTML = html;
}

function calcularDiferencaDias(dataInicioIso, dataFimIso) {
  const d1 = new Date(dataInicioIso + 'T00:00:00');
  const d2 = new Date(dataFimIso + 'T00:00:00');
  const diffTime = d2.getTime() - d1.getTime();
  return Math.round(diffTime / (1000 * 3600 * 24));
}

function renderTabela() {
  const tbody = document.getElementById('tbody-contas-pagar');
  if (!tbody) return;

  if (contas.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-muted);">Nenhuma conta encontrada para os filtros aplicados.</td></tr>';
    return;
  }

  let html = '';
  contas.forEach(c => {
    let badgeColor = 'var(--text-muted)';
    if (c.status === 'pendente') badgeColor = 'var(--color-blue)';
    if (c.status === 'atrasado') badgeColor = 'var(--color-red)';
    if (c.status === 'pago') badgeColor = 'var(--color-teal)';
    if (c.status === 'cancelado') badgeColor = 'var(--text-muted)';

    const recorrenciaStr = c.recorrente ? `<span style="color: var(--color-purple); font-size: 0.8rem; font-weight: 500;">${c.frequencia} (${c.parcela_atual}/${c.total_parcelas})</span>` : '<span style="color: var(--text-muted); font-size: 0.8rem;">Única</span>';

    html += `
      <tr>
        <td style="${c.status === 'atrasado' ? 'color: var(--color-red); font-weight: 600;' : ''}">${formatarDataBR(c.vencimento)}</td>
        <td style="font-weight: 500;">${c.nome}</td>
        <td>${c.categoria_nome}</td>
        <td>${c.forma_pagamento || '-'}</td>
        <td style="font-weight: 600;">${formatarMoedaBR(c.valor)}</td>
        <td>${recorrenciaStr}</td>
        <td>
          <span style="display: inline-flex; align-items: center; gap: 6px; font-size: 0.75rem; padding: 4px 10px; border-radius: 100px; background: var(--bg-surface); border: 1px solid var(--border-subtle); font-weight: 500; text-transform: uppercase;">
            <span style="width: 6px; height: 6px; border-radius: 50%; background: ${badgeColor};"></span>
            ${c.status}
          </span>
        </td>
        <td>
          <div style="display: flex; gap: 8px;">
            ${(c.status === 'pendente' || c.status === 'atrasado') ? `<button class="btn-icon" style="color: var(--color-blue);" onclick="window.editarValorCP(${c.id}, ${c.valor})" title="Editar Valor"><i data-lucide="pencil" style="width:14px;height:14px;"></i></button>` : ''}
            ${(c.status === 'pendente' || c.status === 'atrasado') ? `<button class="btn-icon" style="color: var(--color-teal);" onclick="window.marcarCP_Pago(${c.id})" title="Marcar como Paga"><i data-lucide="check"></i></button>` : ''}
            ${(c.status !== 'cancelado') ? `<button class="btn-icon" style="color: var(--color-red);" onclick="window.cancelarCP(${c.id})" title="Cancelar Conta"><i data-lucide="x"></i></button>` : ''}
          </div>
        </td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
  lucide.createIcons();
}

// ═══════════════════════════════════════
// ACTIONS
// ═══════════════════════════════════════

window.toggleRecorrenciaCP = function() {
  const isChecked = document.getElementById('form-cp-recorrente').checked;
  const containerFreq = document.getElementById('container-cp-frequencia');
  if (isChecked) {
    containerFreq.style.display = 'block';
    document.getElementById('container-cp-quantidade').style.display = 'block';
  } else {
    containerFreq.style.display = 'none';
    document.getElementById('container-cp-quantidade').style.display = 'none';
  }
};

window.salvarContaPagar = async function() {
  const nome = document.getElementById('form-cp-nome').value;
  const descricao = document.getElementById('form-cp-desc').value;
  let valorStr = document.getElementById('form-cp-valor').value.toString().trim();
  if (valorStr.includes(',') && valorStr.includes('.')) {
    valorStr = valorStr.replace(/\./g, '');
  }
  valorStr = valorStr.replace(',', '.');
  const valor = parseFloat(valorStr);

  const vencimento = document.getElementById('form-cp-vencimento').value;
  const categoria_id = parseInt(document.getElementById('form-cp-categoria').value);
  const forma_pagamento = document.getElementById('form-cp-forma').value;
  const recorrente = document.getElementById('form-cp-recorrente').checked;
  const frequencia = recorrente ? document.getElementById('form-cp-frequencia').value : 'nenhuma';
  const quantidade = recorrente ? parseInt(document.getElementById('form-cp-quantidade').value) : 1;
  const observacao = document.getElementById('form-cp-obs').value;

  if (!nome || isNaN(valor) || valor <= 0 || !vencimento || !categoria_id) {
    showToast('Preencha os campos obrigatórios corretamente!', 'error');
    return;
  }

  try {
    const btn = document.getElementById('btn-salvar-cp');
    btn.disabled = true;
    btn.innerHTML = 'Salvando...';

    await fetchAPI('/contas-pagar', {
      method: 'POST',
      body: JSON.stringify({ nome, descricao, valor, vencimento, categoria_id, forma_pagamento, recorrente, frequencia, quantidade, observacao })
    });
    
    showToast('Conta adicionada com sucesso!');
    
    // Limpar form (exceto campos fixos como categoria)
    document.getElementById('form-cp-nome').value = '';
    document.getElementById('form-cp-desc').value = '';
    document.getElementById('form-cp-valor').value = '';
    document.getElementById('form-cp-obs').value = '';
    document.getElementById('form-cp-recorrente').checked = false;
    window.toggleRecorrenciaCP();

    await loadDados();
  } catch (err) {
    showToast('Erro ao salvar: ' + err.message, 'error');
  } finally {
    const btn = document.getElementById('btn-salvar-cp');
    btn.disabled = false;
    btn.innerHTML = 'Adicionar Conta';
  }
};

window.editarValorCP = async function(id, valorAtual) {
  const novoValorStr = prompt("Digite o novo valor para esta conta neste mês:", valorAtual);
  if (novoValorStr === null) return;
  
  const novoValor = parseFloat(novoValorStr.replace(',', '.'));
  if (isNaN(novoValor) || novoValor <= 0) {
    showToast("Valor inválido!", "error");
    return;
  }

  try {
    await fetchAPI(`/contas-pagar/${id}/valor`, {
      method: 'PUT',
      body: JSON.stringify({ valor: novoValor })
    });
    showToast("Valor atualizado com sucesso!");
    await loadDados();
  } catch (err) {
    showToast("Erro ao editar valor: " + err.message, "error");
  }
};

window.marcarCP_Pago = async function(id) {
  if (!confirm('Deseja realmente marcar esta conta como PAGA?')) return;
  try {
    await fetchAPI(`/contas-pagar/${id}/pagar`, { method: 'POST' });
    showToast('Conta marcada como paga!');
    loadDados();
  } catch (err) {
    showToast('Erro ao pagar: ' + err.message, 'error');
  }
};

window.cancelarCP = async function(id) {
  if (!confirm('Deseja realmente CANCELAR esta conta? Ela não será excluída do histórico, mas ficará inativa.')) return;
  try {
    await fetchAPI(`/contas-pagar/${id}/cancelar`, { method: 'POST' });
    showToast('Conta cancelada!');
    loadDados();
  } catch (err) {
    showToast('Erro ao cancelar: ' + err.message, 'error');
  }
};

// ═══════════════════════════════════════
// ESTRUTURA HTML
// ═══════════════════════════════════════

export function renderContasPagarPage() {


  let h = '';
  
  // TOAST CONTAINER
  h += '<div id="toast-container" class="toast-container"></div>';

  // HEADER
  h += '<div class="page-header animate-in">';
  h += '  <h1 class="page-header__title">Contas a Pagar</h1>';
  h += '  <p class="page-header__subtitle">Organize vencimentos, acompanhe pendências e controle suas contas fixas e variáveis.</p>';
  h += '</div>';

  // METRICS GRID
  h += '<div class="metrics-grid animate-in" style="grid-template-columns: repeat(5, 1fr); gap: 16px;">';
  h += '  <div class="metric-card">';
  h += '    <div class="metric-card__header"><div class="metric-card__label-top">Total Pendente</div></div>';
  h += '    <div class="metric-card__body"><div class="metric-card__value" id="metrica-cp-pendente" style="color: var(--color-blue);">R$ 0,00</div></div>';
  h += '  </div>';
  h += '  <div class="metric-card">';
  h += '    <div class="metric-card__header"><div class="metric-card__label-top">Total Vencido</div></div>';
  h += '    <div class="metric-card__body"><div class="metric-card__value" id="metrica-cp-vencido" style="color: var(--color-red);">R$ 0,00</div></div>';
  h += '  </div>';
  h += '  <div class="metric-card">';
  h += '    <div class="metric-card__header"><div class="metric-card__label-top">Total Pago no Mês</div></div>';
  h += '    <div class="metric-card__body"><div class="metric-card__value" id="metrica-cp-pago" style="color: var(--color-teal);">R$ 0,00</div></div>';
  h += '  </div>';
  h += '  <div class="metric-card">';
  h += '    <div class="metric-card__header"><div class="metric-card__label-top">Próximo Vencimento</div></div>';
  h += '    <div class="metric-card__body"><div class="metric-card__value" id="metrica-cp-prox" style="font-size: 1.1rem; line-height: 1.3;">Nenhum</div></div>';
  h += '  </div>';
  h += '  <div class="metric-card">';
  h += '    <div class="metric-card__header"><div class="metric-card__label-top">Qtd. Contas (Mês)</div></div>';
  h += '    <div class="metric-card__body"><div class="metric-card__value" id="metrica-cp-qtd" style="font-size: 1.6rem;">0</div></div>';
  h += '  </div>';
  h += '</div>';

  // MAIN LAYOUT
  h += '<div class="dashboard-grid animate-in" style="grid-template-columns: 350px 1fr; gap: 24px; margin-bottom: 32px;">';
  
  // ESQUERDA: FORMULÁRIO E PRÓXIMOS VENCIMENTOS
  h += '  <div style="display: flex; flex-direction: column; gap: 24px;">';
  
  // Card Nova Conta
  h += '    <div class="form-card" style="padding: 24px;">';
  h += '      <h3 style="font-weight: 600; color: var(--text-primary); margin-bottom: 24px;">Nova Conta</h3>';
  
  h += '      <div class="form-group" style="margin-bottom: 16px;">';
  h += '        <label class="form-label">Nome da Conta*</label>';
  h += '        <input type="text" id="form-cp-nome" class="form-control" placeholder="Ex: Internet Claro">';
  h += '      </div>';
  
  h += '      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">';
  h += '        <div class="form-group">';
  h += '          <label class="form-label">Valor*</label>';
  h += '          <input type="text" id="form-cp-valor" class="form-control" placeholder="0,00">';
  h += '        </div>';
  h += '        <div class="form-group">';
  h += '          <label class="form-label">Vencimento*</label>';
  h += '          <input type="date" id="form-cp-vencimento" class="form-control" value="'+dataAtualISO()+'">';
  h += '        </div>';
  h += '      </div>';

  h += '      <div class="form-group" style="margin-bottom: 16px;">';
  h += '        <label class="form-label">Categoria*</label>';
  h += '        <select id="form-cp-categoria" class="form-control"></select>';
  h += '      </div>';

  h += '      <div class="form-group" style="margin-bottom: 16px;">';
  h += '        <label class="form-label">Forma de Pagamento</label>';
  h += '        <select id="form-cp-forma" class="form-control">';
  h += '          <option value="Pix">Pix</option>';
  h += '          <option value="Boleto">Boleto</option>';
  h += '          <option value="Débito">Débito Automático</option>';
  h += '          <option value="Transferência">Transferência</option>';
  h += '          <option value="Dinheiro">Dinheiro</option>';
  h += '          <option value="Outro">Outro</option>';
  h += '        </select>';
  h += '      </div>';

  h += '      <div class="form-group" style="margin-bottom: 16px;">';
  h += '        <label style="display: flex; align-items: center; gap: 8px; color: var(--text-primary); font-size: 0.9rem; cursor: pointer;">';
  h += '          <input type="checkbox" id="form-cp-recorrente" onchange="window.toggleRecorrenciaCP()"> Conta Recorrente';
  h += '        </label>';
  h += '      </div>';

  h += '      <div id="container-cp-frequencia" class="form-group" style="margin-bottom: 16px; display: none;">';
  h += '        <label class="form-label">Frequência</label>';
  h += '        <select id="form-cp-frequencia" class="form-control">';
  h += '          <option value="mensal">Mensal (Gera 12x)</option>';
  h += '          <option value="semanal">Semanal (Gera 12x)</option>';
  h += '          <option value="anual">Anual (Gera 5x)</option>';
  h += '        </select>';
  h += '      </div>';

  h += '      <div id="container-cp-quantidade" class="form-group" style="margin-bottom: 16px; display: none;">';
  h += '        <label class="form-label">Quantidade de Ocorrências</label>';
  h += '        <input type="number" id="form-cp-quantidade" class="form-control" value="12" min="1">';
  h += '      </div>';

  h += '      <div class="form-group" style="margin-bottom: 16px; display: none;">';
  h += '        <label class="form-label">Descrição Curta</label>';
  h += '        <input type="text" id="form-cp-desc" class="form-control" placeholder="Opcional">';
  h += '      </div>';

  h += '      <div class="form-group" style="margin-bottom: 24px;">';
  h += '        <label class="form-label">Observação</label>';
  h += '        <input type="text" id="form-cp-obs" class="form-control" placeholder="Detalhes opcionais...">';
  h += '      </div>';

  h += '      <button id="btn-salvar-cp" class="btn-primary" style="width: 100%; justify-content: center;" onclick="window.salvarContaPagar()">Adicionar Conta</button>';
  h += '    </div>';

  // Card Próximos Vencimentos
  h += '    <div class="form-card" style="padding: 24px;">';
  h += '      <h3 style="font-weight: 600; color: var(--text-primary); margin-bottom: 16px; font-size: 1.1rem;">Vencem em 7 Dias</h3>';
  h += '      <div id="lista-cp-proximos"></div>';
  h += '    </div>';
  
  h += '  </div>'; // fim esquerda

  // DIREITA: GRÁFICO E TABELA
  h += '  <div style="display: flex; flex-direction: column; gap: 24px;">';
  
  // Card Gráfico
  h += '    <div class="form-card" style="padding: 24px;">';
  h += '      <h3 style="font-weight: 600; color: var(--text-primary); margin-bottom: 16px;">Despesas Fixas por Categoria</h3>';
  h += '      <div style="height: 250px; width: 100%; position: relative;">';
  h += '        <canvas id="chart-cp-categorias"></canvas>';
  h += '      </div>';
  h += '    </div>';

  // Filtros
  h += '    <div class="form-card" style="padding: 16px; display: flex; gap: 16px; flex-wrap: wrap; align-items: flex-end;">';
  h += '      <div class="form-group" style="flex: 1; min-width: 150px;">';
  h += '        <label class="form-label">Competência</label>';
  h += '        <input type="month" id="cp-filtro-mes" class="form-control">';
  h += '      </div>';
  h += '      <div class="form-group" style="flex: 1; min-width: 150px;">';
  h += '        <label class="form-label">Categoria</label>';
  h += '        <select id="cp-filtro-categoria" class="form-control"></select>';
  h += '      </div>';
  h += '      <div class="form-group" style="flex: 1; min-width: 150px;">';
  h += '        <label class="form-label">Status</label>';
  h += '        <select id="cp-filtro-status" class="form-control">';
  h += '          <option value="todos">Todos</option>';
  h += '          <option value="pendente">Pendente</option>';
  h += '          <option value="atrasado">Atrasado</option>';
  h += '          <option value="pago">Pago</option>';
  h += '        </select>';
  h += '      </div>';
  h += '      <div class="form-group" style="width: 120px;">';
  h += '        <button class="btn-primary" style="width: 100%; justify-content: center; height: 42px;" onclick="window.filtrarContasPagar()">Filtrar</button>';
  h += '      </div>';
  h += '    </div>';

  // Card Tabela
  h += '    <div class="form-card" style="padding: 24px; flex: 1;">';
  h += '      <h3 style="font-weight: 600; color: var(--text-primary); margin-bottom: 16px;">Histórico do Mês</h3>';
  h += '      <div class="table-container">';
  h += '        <table class="table">';
  h += '          <thead><tr><th>Vencimento</th><th>Nome</th><th>Categoria</th><th>Forma</th><th>Valor</th><th>Recorrência</th><th>Status</th><th>Ações</th></tr></thead>';
  h += '          <tbody id="tbody-contas-pagar"></tbody>';
  h += '        </table>';
  h += '      </div>';
  h += '    </div>';

  h += '  </div>'; // fim direita
  h += '</div>';

  return h;
}
