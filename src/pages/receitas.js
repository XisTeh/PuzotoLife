import { apiFetch } from '../services/http.js';
import { escapeHtml, setIconMessage } from '../security/safeDom.js';
import { formatarMoedaBR, formatarDataBR, dataAtualISO } from '../utils/formatters.js';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

const API_BASE = '/api';

// Estado
let registros = [];
let resumo = null;
let origens = [];
let categorias = [];
let chartReceitas = null;

// Filtros
let mesAtual = dataAtualISO().substring(0, 7); // YYYY-MM
let filtroCategoria = 'todas';
let filtroStatus = 'todos';
let filtroOrigem = 'todas';

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
  setIconMessage(toast, type === 'success' ? 'check-circle' : 'alert-circle', message);
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

export async function initReceitas() {
  document.getElementById('rec-filtro-mes').value = mesAtual;
  
  await Promise.all([loadCategorias(), loadOrigens(), loadDados()]);
}

async function loadCategorias() {
  try {
    const allCat = await fetchAPI('/financas/categorias');
    categorias = allCat.filter(c => c.tipo === 'receita' || c.tipo === 'ambos');
    
    // Popula select formulário
    const selectForm = document.getElementById('form-rec-categoria');
    if (selectForm) {
      selectForm.innerHTML = categorias.map(c => `<option value="${escapeHtml(c.nome)}">${escapeHtml(c.nome)}</option>`).join('');
    }
    
    // Popula select filtro
    const selectFiltro = document.getElementById('rec-filtro-categoria');
    if (selectFiltro) {
      selectFiltro.innerHTML = '<option value="todas">Todas Categorias</option>' + 
        categorias.map(c => `<option value="${escapeHtml(c.nome)}">${escapeHtml(c.nome)}</option>`).join('');
    }
  } catch (err) {
    console.error('Erro ao carregar categorias:', err);
  }
}

async function loadOrigens() {
  try {
    origens = await fetchAPI('/financas/receitas/origens');
    
    // Popula datalist form
    const datalist = document.getElementById('origens-list');
    if (datalist) {
      datalist.innerHTML = origens.map(o => `<option value="${escapeHtml(o)}">`).join('') +
        `<option value="Trabalho"><option value="Reembolso"><option value="Venda"><option value="Renda Extra"><option value="Salário"><option value="Presente"><option value="Devolução"><option value="Outros">`;
    }
    
    // Popula select filtro
    const selectFiltro = document.getElementById('rec-filtro-origem');
    if (selectFiltro) {
      selectFiltro.innerHTML = '<option value="todas">Todas Origens</option>' + 
        origens.map(o => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join('');
    }
  } catch (err) {
    console.error('Erro ao carregar origens:', err);
  }
}

window.filtrarReceitas = async function() {
  mesAtual = document.getElementById('rec-filtro-mes').value;
  filtroCategoria = document.getElementById('rec-filtro-categoria').value;
  filtroStatus = document.getElementById('rec-filtro-status').value;
  filtroOrigem = document.getElementById('rec-filtro-origem').value;
  await loadDados();
};

async function loadDados() {
  try {
    const query = new URLSearchParams({
      mes: mesAtual,
      categoria: filtroCategoria,
      status: filtroStatus,
      origem: filtroOrigem
    }).toString();

    const [cData, rData] = await Promise.all([
      fetchAPI(`/financas/receitas?${query}`),
      fetchAPI(`/financas/receitas/resumo?mes=${mesAtual}`)
    ]);
    
    registros = cData;
    resumo = rData;

    renderMetrics();
    renderChart();
    renderProximasReceitas();
    renderTabela();
  } catch (err) {
    showToast('Erro ao carregar dados: ' + err.message, 'error');
  }
}

// ═══════════════════════════════════════
// RENDERS
// ═══════════════════════════════════════

function renderMetrics() {
  if (!resumo) return;
  document.getElementById('metrica-rec-recebido').textContent = formatarMoedaBR(resumo.totalRecebido);
  document.getElementById('metrica-rec-previsto').textContent = formatarMoedaBR(resumo.totalPrevisto);
  document.getElementById('metrica-rec-qtd').textContent = resumo.quantidadeEntradas;
  document.getElementById('metrica-rec-maior').textContent = resumo.maiorOrigem.valor > 0 ? `${resumo.maiorOrigem.nome} (${formatarMoedaBR(resumo.maiorOrigem.valor)})` : '-';
  document.getElementById('metrica-rec-media').textContent = formatarMoedaBR(resumo.mediaDiaria) + '/dia';
  
  const slEl = document.getElementById('metrica-rec-saldo');
  slEl.textContent = formatarMoedaBR(resumo.saldoEntradas);
}

function renderChart() {
  if (!resumo) return;
  
  const canvas = document.getElementById('chart-rec-origens');
  if (!canvas) return;

  if (chartReceitas) {
    chartReceitas.destroy();
  }

  // Pegar top origens
  const dadosGrafico = [...resumo.origens].sort((a,b) => b.valor - a.valor).slice(0, 5);

  chartReceitas = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: dadosGrafico.map(d => d.origem),
      datasets: [{
        label: 'Valor',
        data: dadosGrafico.map(d => d.valor),
        backgroundColor: 'rgba(20, 184, 166, 0.8)',
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${formatarMoedaBR(ctx.parsed.y)}`
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
          ticks: { color: '#e2e8f0', font: { weight: '500' } },
          grid: { display: false }
        }
      }
    }
  });
}

function renderProximasReceitas() {
  const container = document.getElementById('lista-rec-proximas');
  if (!container) return;

  const hojeStr = dataAtualISO();

  // Mostra previstas (ordena data crescente)
  const proximos = registros.filter(r => r.status === 'previsto')
                            .sort((a,b) => a.data.localeCompare(b.data))
                            .slice(0, 5); // top 5

  if (proximos.length === 0) {
    container.innerHTML = '<p style="color: var(--text-muted); font-size: 0.9rem;">Nenhuma receita prevista encontrada neste período.</p>';
    return;
  }

  let html = '';
  proximos.forEach(r => {
    const d1 = new Date(hojeStr + 'T00:00:00');
    const d2 = new Date(r.data + 'T00:00:00');
    const diffTime = d2.getTime() - d1.getTime();
    const diasObj = Math.round(diffTime / (1000 * 3600 * 24));
    
    const diasTexto = diasObj === 0 ? 'Hoje!' : (diasObj < 0 ? `Atrasada ${Math.abs(diasObj)}d` : `Em ${diasObj} dias`);
    const corDias = diasObj < 0 ? 'var(--color-yellow)' : (diasObj === 0 ? 'var(--color-teal)' : 'var(--text-muted)');

    html += `
      <div style="padding: 12px; background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: 8px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div style="font-weight: 600; color: var(--text-primary); font-size: 0.95rem;">${escapeHtml(r.descricao)}</div>
          <div style="font-size: 0.8rem; color: ${corDias}; font-weight: 500;">${escapeHtml(r.origem)} - ${diasTexto} (${formatarDataBR(r.data)})</div>
        </div>
        <div style="font-weight: 600; color: var(--color-blue);">
          ${formatarMoedaBR(r.valor)}
        </div>
      </div>
    `;
  });
  container.innerHTML = html;
}

function renderTabela() {
  const tbody = document.getElementById('tbody-receitas');
  if (!tbody) return;

  if (registros.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: var(--text-muted);">Nenhuma receita encontrada.</td></tr>';
    return;
  }

  let html = '';
  registros.forEach(r => {
    let badgeColor = 'var(--text-muted)';
    if (r.status === 'previsto') badgeColor = 'var(--color-blue)';
    if (r.status === 'recebido') badgeColor = 'var(--color-teal)';
    if (r.status === 'cancelado') badgeColor = 'var(--text-muted)';

    let badgeOrigem = escapeHtml(r.origem);
    if (r.vinculado_trabalho) {
      badgeOrigem = `<span style="display:inline-flex; align-items:center; gap:4px; font-size:0.75rem; padding:2px 6px; border-radius:4px; background:rgba(59, 130, 246, 0.1); color:var(--color-blue); border:1px solid rgba(59, 130, 246, 0.2);"><i data-lucide="briefcase" style="width:12px; height:12px;"></i> Trabalho</span><br><span style="font-size:0.75rem; color:var(--text-muted);">${r.referencia_trabalho_tipo === 'laudo_ranon' ? 'Dr. Ranon' : 'Lançamento'} #${r.referencia_trabalho_id}</span>`;
    }

    html += `
      <tr>
        <td>${formatarDataBR(r.data)}</td>
        <td style="font-weight: 500;">${escapeHtml(r.descricao)}</td>
        <td>${badgeOrigem}</td>
        <td><span style="font-size: 0.8rem; padding: 2px 8px; border-radius: 12px; background: var(--bg-surface); border: 1px solid var(--border-subtle);">${escapeHtml(r.categoria_nome)}</span></td>
        <td style="font-weight: 600; color: var(--color-teal);">${formatarMoedaBR(r.valor)}</td>
        <td>
          <span style="display: inline-flex; align-items: center; gap: 6px; font-size: 0.75rem; padding: 4px 10px; border-radius: 100px; background: var(--bg-surface); border: 1px solid var(--border-subtle); font-weight: 500; text-transform: uppercase;">
            <span style="width: 6px; height: 6px; border-radius: 50%; background: ${badgeColor};"></span>
            ${escapeHtml(r.status)}
          </span>
        </td>
        <td>${r.recebido_em ? formatarDataBR(r.recebido_em.split(' ')[0]) : '-'}</td>
        <td style="font-size: 0.8rem; color: var(--text-muted); max-width: 150px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(r.observacao || '')}">${escapeHtml(r.observacao || '-')}</td>
        <td>
          <div style="display: flex; gap: 8px;">
            ${r.status === 'previsto' ? `<button class="btn-icon" style="color: var(--color-teal);" onclick="window.receberRec(${r.id})" title="Marcar como Recebida"><i data-lucide="check"></i></button>` : ''}
            <button class="btn-icon" style="color: var(--color-purple);" onclick="window.editarRec(${r.id})" title="Editar"><i data-lucide="edit-2"></i></button>
            ${r.status !== 'cancelado' ? `<button class="btn-icon" style="color: var(--color-orange);" onclick="window.cancelarRec(${r.id})" title="Cancelar Receita"><i data-lucide="x"></i></button>` : ''}
            ${!r.vinculado_trabalho ? `<button class="btn-icon" style="color: var(--color-red);" onclick="window.excluirRec(${r.id})" title="Excluir"><i data-lucide="trash-2"></i></button>` : ''}
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

let editandoId = null;

window.salvarReceita = async function() {
  const data = document.getElementById('form-rec-data').value;
  const descricao = document.getElementById('form-rec-desc').value.trim();
  let valorStr = document.getElementById('form-rec-valor').value.toString().trim();
  if (valorStr.includes(',') && valorStr.includes('.')) {
    valorStr = valorStr.replace(/\./g, '');
  }
  valorStr = valorStr.replace(',', '.');
  const valor = parseFloat(valorStr);

  const origem = document.getElementById('form-rec-origem').value.trim();
  const categoria_nome = document.getElementById('form-rec-categoria').value;
  const status = document.getElementById('form-rec-status').value;
  const observacao = document.getElementById('form-rec-obs').value.trim();

  if (!data || !descricao || isNaN(valor) || valor <= 0 || !origem || !categoria_nome) {
    showToast('Preencha os campos obrigatórios corretamente!', 'error');
    return;
  }

  try {
    const btn = document.getElementById('btn-salvar-rec');
    btn.disabled = true;
    btn.innerHTML = 'Salvando...';

    const payload = { data, descricao, valor, origem, categoria_nome, status, observacao };

    if (editandoId) {
      await fetchAPI(`/financas/receitas/${editandoId}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      showToast('Receita atualizada!');
      editandoId = null;
      btn.innerHTML = 'Adicionar Receita';
      document.getElementById('form-title-rec').textContent = 'Nova Receita';
    } else {
      await fetchAPI('/financas/receitas', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      showToast('Receita adicionada com sucesso!');
    }
    
    // Limpar form
    document.getElementById('form-rec-desc').value = '';
    document.getElementById('form-rec-valor').value = '';
    document.getElementById('form-rec-obs').value = '';

    await loadDados();
    // reload origens for auto complete
    await loadOrigens(); 
  } catch (err) {
    showToast('Erro ao salvar: ' + err.message, 'error');
  } finally {
    const btn = document.getElementById('btn-salvar-rec');
    btn.disabled = false;
    if(!editandoId) btn.innerHTML = 'Adicionar Receita';
  }
};

window.editarRec = function(id) {
  const r = registros.find(x => x.id === id);
  if (!r) return;

  editandoId = id;
  document.getElementById('form-title-rec').textContent = 'Editar Receita #' + id;
  
  document.getElementById('form-rec-data').value = r.data;
  document.getElementById('form-rec-desc').value = r.descricao;
  document.getElementById('form-rec-valor').value = r.valor.toString().replace('.', ',');
  document.getElementById('form-rec-origem').value = r.origem;
  document.getElementById('form-rec-categoria').value = r.categoria_nome;
  document.getElementById('form-rec-status').value = r.status;
  document.getElementById('form-rec-obs').value = r.observacao || '';

  document.getElementById('btn-salvar-rec').innerHTML = 'Atualizar Receita';
  document.getElementById('form-rec-data').scrollIntoView({ behavior: 'smooth', block: 'center' });
};

window.receberRec = async function(id) {
  if (!confirm('Deseja marcar esta receita como recebida? A data de recebimento será hoje.')) return;
  try {
    await fetchAPI(`/financas/receitas/${id}/receber`, { method: 'POST' });
    showToast('Receita recebida!');
    loadDados();
  } catch (err) {
    showToast('Erro ao receber: ' + err.message, 'error');
  }
};

window.cancelarRec = async function(id) {
  const r = registros.find(x => x.id === id);
  const msg = r && r.vinculado_trabalho 
    ? 'Esta receita veio do módulo Trabalho.\nCancelar a receita NÃO altera automaticamente o lançamento original.\n\nDeseja CANCELAR esta receita?' 
    : 'Deseja CANCELAR esta receita? Ela continuará no histórico como cancelada.';
  
  if (!confirm(msg)) return;
  try {
    await fetchAPI(`/financas/receitas/${id}/cancelar`, { method: 'POST' });
    showToast('Receita cancelada!');
    loadDados();
  } catch (err) {
    showToast('Erro ao cancelar: ' + err.message, 'error');
  }
};

window.excluirRec = async function(id) {
  if (!confirm('ATENÇÃO: Deseja realmente EXCLUIR fisicamente esta receita do banco de dados?')) return;
  try {
    await fetchAPI(`/financas/receitas/${id}`, { method: 'DELETE' });
    showToast('Receita excluída!');
    loadDados();
  } catch (err) {
    showToast('Erro ao excluir: ' + err.message, 'error');
  }
};

// ═══════════════════════════════════════
// ESTRUTURA HTML
// ═══════════════════════════════════════

export function renderReceitasPage() {


  let h = '';
  
  // Datalist para autocomplete de origens
  h += '<datalist id="origens-list"></datalist>';

  // TOAST CONTAINER
  h += '<div id="toast-container" class="toast-container"></div>';

  // HEADER
  h += '<div class="page-header animate-in">';
  h += '  <h1 class="page-header__title">Receitas</h1>';
  h += '  <p class="page-header__subtitle">Registre entradas de dinheiro, acompanhe valores previstos e controle recebimentos.</p>';
  h += '</div>';

  // METRICS GRID (6 cards)
  h += '<div class="metrics-grid animate-in" style="grid-template-columns: repeat(6, 1fr); gap: 16px;">';
  h += '  <div class="metric-card">';
  h += '    <div class="metric-card__header"><div class="metric-card__label-top">Total Recebido</div></div>';
  h += '    <div class="metric-card__body"><div class="metric-card__value" id="metrica-rec-recebido" style="color: var(--color-teal);">R$ 0,00</div></div>';
  h += '  </div>';
  h += '  <div class="metric-card">';
  h += '    <div class="metric-card__header"><div class="metric-card__label-top">Total Previsto</div></div>';
  h += '    <div class="metric-card__body"><div class="metric-card__value" id="metrica-rec-previsto" style="color: var(--color-blue);">R$ 0,00</div></div>';
  h += '  </div>';
  h += '  <div class="metric-card">';
  h += '    <div class="metric-card__header"><div class="metric-card__label-top">Saldo de Entradas</div></div>';
  h += '    <div class="metric-card__body"><div class="metric-card__value" id="metrica-rec-saldo" style="color: var(--text-primary);">R$ 0,00</div></div>';
  h += '  </div>';
  h += '  <div class="metric-card">';
  h += '    <div class="metric-card__header"><div class="metric-card__label-top">Entradas Totais</div></div>';
  h += '    <div class="metric-card__body"><div class="metric-card__value" id="metrica-rec-qtd" style="font-size: 1.6rem; color: var(--text-primary);">0</div></div>';
  h += '  </div>';
  h += '  <div class="metric-card">';
  h += '    <div class="metric-card__header"><div class="metric-card__label-top">Maior Origem</div></div>';
  h += '    <div class="metric-card__body"><div class="metric-card__value" id="metrica-rec-maior" style="font-size: 1.2rem; color: var(--color-purple);">-</div></div>';
  h += '  </div>';
  h += '  <div class="metric-card">';
  h += '    <div class="metric-card__header"><div class="metric-card__label-top">Média Diária</div></div>';
  h += '    <div class="metric-card__body"><div class="metric-card__value" id="metrica-rec-media" style="font-size: 1.2rem;">R$ 0,00</div></div>';
  h += '  </div>';
  h += '</div>';

  // MAIN LAYOUT
  h += '<div class="dashboard-grid animate-in" style="grid-template-columns: 350px 1fr; gap: 24px; margin-bottom: 32px;">';
  
  // ESQUERDA: FORMULÁRIO E PRÓXIMOS VENCIMENTOS E GRÁFICO
  h += '  <div style="display: flex; flex-direction: column; gap: 24px;">';
  
  // Card Nova Receita
  h += '    <div class="form-card" style="padding: 24px;">';
  h += '      <h3 id="form-title-rec" style="font-weight: 600; color: var(--text-primary); margin-bottom: 24px;">Nova Receita</h3>';
  
  h += '      <div class="form-group" style="margin-bottom: 16px;">';
  h += '        <label class="form-label">Descrição*</label>';
  h += '        <input type="text" id="form-rec-desc" class="form-control" placeholder="Ex: Venda monitor, Reembolso consulta...">';
  h += '      </div>';

  h += '      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">';
  h += '        <div class="form-group">';
  h += '          <label class="form-label">Valor*</label>';
  h += '          <input type="text" id="form-rec-valor" class="form-control" placeholder="0,00">';
  h += '        </div>';
  h += '        <div class="form-group">';
  h += '          <label class="form-label">Data*</label>';
  h += '          <input type="date" id="form-rec-data" class="form-control" value="'+dataAtualISO()+'">';
  h += '        </div>';
  h += '      </div>';

  h += '      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">';
  h += '        <div class="form-group">';
  h += '          <label class="form-label">Origem*</label>';
  h += '          <input type="text" id="form-rec-origem" class="form-control" list="origens-list" placeholder="Ex: Pix, Nubank, Venda">';
  h += '        </div>';
  h += '        <div class="form-group">';
  h += '          <label class="form-label">Categoria*</label>';
  h += '          <select id="form-rec-categoria" class="form-control"></select>';
  h += '        </div>';
  h += '      </div>';

  h += '      <div class="form-group" style="margin-bottom: 16px;">';
  h += '        <label class="form-label">Status*</label>';
  h += '        <select id="form-rec-status" class="form-control">';
  h += '          <option value="recebido">Recebido</option>';
  h += '          <option value="previsto">Previsto (A receber)</option>';
  h += '        </select>';
  h += '      </div>';

  h += '      <div class="form-group" style="margin-bottom: 24px;">';
  h += '        <label class="form-label">Observação</label>';
  h += '        <input type="text" id="form-rec-obs" class="form-control" placeholder="Detalhes opcionais...">';
  h += '      </div>';

  h += '      <button id="btn-salvar-rec" class="btn-primary" style="width: 100%; justify-content: center;" onclick="window.salvarReceita()">Adicionar Receita</button>';
  h += '    </div>';

  // Card Próximas Receitas
  h += '    <div class="form-card" style="padding: 24px;">';
  h += '      <h3 style="font-weight: 600; color: var(--text-primary); margin-bottom: 16px; font-size: 1.1rem;">Próximas Entradas</h3>';
  h += '      <div id="lista-rec-proximas"></div>';
  h += '    </div>';
  
  // Card Gráfico Comparativo
  h += '    <div class="form-card" style="padding: 24px;">';
  h += '      <h3 style="font-weight: 600; color: var(--text-primary); margin-bottom: 16px; font-size: 1.1rem;">Receitas por Origem</h3>';
  h += '      <div style="height: 180px; width: 100%; position: relative;">';
  h += '        <canvas id="chart-rec-origens"></canvas>';
  h += '      </div>';
  h += '    </div>';

  h += '  </div>'; // fim esquerda

  // DIREITA: FILTROS E TABELA
  h += '  <div style="display: flex; flex-direction: column; gap: 24px;">';
  
  // Filtros
  h += '    <div class="form-card" style="padding: 16px; display: flex; gap: 16px; flex-wrap: wrap; align-items: flex-end;">';
  h += '      <div class="form-group" style="flex: 1; min-width: 130px;">';
  h += '        <label class="form-label">Período</label>';
  h += '        <input type="month" id="rec-filtro-mes" class="form-control">';
  h += '      </div>';
  h += '      <div class="form-group" style="flex: 1; min-width: 130px;">';
  h += '        <label class="form-label">Origem</label>';
  h += '        <select id="rec-filtro-origem" class="form-control"><option value="todas">Todas Origens</option></select>';
  h += '      </div>';
  h += '      <div class="form-group" style="flex: 1; min-width: 130px;">';
  h += '        <label class="form-label">Categoria</label>';
  h += '        <select id="rec-filtro-categoria" class="form-control"><option value="todas">Todas Categorias</option></select>';
  h += '      </div>';
  h += '      <div class="form-group" style="flex: 1; min-width: 130px;">';
  h += '        <label class="form-label">Status</label>';
  h += '        <select id="rec-filtro-status" class="form-control">';
  h += '          <option value="todos">Todos</option>';
  h += '          <option value="recebido">Recebido</option>';
  h += '          <option value="previsto">Previsto</option>';
  h += '          <option value="cancelado">Cancelado</option>';
  h += '        </select>';
  h += '      </div>';
  h += '      <div class="form-group" style="width: 100px;">';
  h += '        <button class="btn-primary" style="width: 100%; justify-content: center; height: 42px;" onclick="window.filtrarReceitas()">Filtrar</button>';
  h += '      </div>';
  h += '    </div>';

  // Card Tabela
  h += '    <div class="form-card" style="padding: 24px; flex: 1;">';
  h += '      <h3 style="font-weight: 600; color: var(--text-primary); margin-bottom: 16px;">Entradas do Período</h3>';
  h += '      <div class="table-container">';
  h += '        <table class="table">';
  h += '          <thead><tr><th>Data</th><th>Descrição</th><th>Origem</th><th>Categoria</th><th>Valor</th><th>Status</th><th>Recebido Em</th><th>Obs</th><th>Ações</th></tr></thead>';
  h += '          <tbody id="tbody-receitas"></tbody>';
  h += '        </table>';
  h += '      </div>';
  h += '    </div>';

  h += '  </div>'; // fim direita
  h += '</div>';

  return h;
}
