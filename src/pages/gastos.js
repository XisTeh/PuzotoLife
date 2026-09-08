import { apiFetch } from '../services/http.js';
import { escapeHtml, setIconMessage } from '../security/safeDom.js';
import { Chart, registerables } from 'chart.js';
import { formatarMoedaBR, formatarDataBR, dataAtualISO } from '../utils/formatters.js';

Chart.register(...registerables);

const API_BASE = '/api/financas';
let categorias = [];
let gastosAtuais = [];
let resumoAtual = null;
let chartInstancia = null;

function showToast(message, type) {
  if (!type) type = 'success';
  var container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  var toast = document.createElement('div');
  toast.className = 'toast ' + type;
  var iconName = type === 'success' ? 'check-circle' : (type === 'error' ? 'alert-circle' : 'info');
  setIconMessage(toast, iconName, message);
  container.appendChild(toast);
  if (window.lucide) window.lucide.createIcons();
  setTimeout(function() {
    toast.style.animation = 'slideOutRight 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards';
    setTimeout(function() { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
  }, 3000);
}

function getMesAtualInput() {
  var agora = new Date();
  var y = agora.getFullYear();
  var m = String(agora.getMonth() + 1).padStart(2, '0');
  return y + '-' + m;
}

function parseReferenciaVisivel(mesYYYYMM) {
  if (!mesYYYYMM) return '';
  var partes = mesYYYYMM.split('-');
  var ano = partes[0];
  var mes = parseInt(partes[1], 10);
  var meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  return meses[mes - 1] + ' ' + ano;
}

export async function initGastos() {
  var mesInput = document.getElementById('filtro-mes');
  if (mesInput) mesInput.value = getMesAtualInput();

  var dataHoje = document.getElementById('form-gasto-data');
  if (dataHoje) dataHoje.value = dataAtualISO();

  await carregarPainelInicial();

  // Listeners de filtros
  var fm = document.getElementById('filtro-mes');
  var fc = document.getElementById('filtro-categoria');
  var fs = document.getElementById('filtro-status');
  var fp = document.getElementById('filtro-pagamento');
  if (fm) fm.addEventListener('change', atualizarPainel);
  if (fc) fc.addEventListener('change', atualizarPainel);
  if (fs) fs.addEventListener('change', atualizarPainel);
  if (fp) fp.addEventListener('change', atualizarPainel);
}

async function carregarPainelInicial() {
  const queryParams = new URLSearchParams({
    mes: document.getElementById('filtro-mes').value,
    categoria: document.getElementById('filtro-categoria').value,
    status: document.getElementById('filtro-status').value,
    forma_pagamento: document.getElementById('filtro-pagamento').value,
  });
  try {
    const resposta = await apiFetch(`${API_BASE}/gastos-painel?${queryParams}`);
    const json = await resposta.json();
    if (!json.ok) throw new Error(json.error || 'Erro ao carregar dados');
    aplicarCategorias(json.data.categorias);
    gastosAtuais = json.data.gastos;
    resumoAtual = json.data.resumo;
    renderCards();
    renderTabela();
    renderGrafico();
  } catch (err) {
    showToast('Erro ao atualizar dados: ' + err.message, 'error');
  }
}

function aplicarCategorias(novasCategorias) {
  categorias = novasCategorias;
  const opcoes = categorias.map(categoria => `<option value="${categoria.id}">${escapeHtml(categoria.nome)}</option>`).join('');
  const selectFiltro = document.getElementById('filtro-categoria');
  if (selectFiltro) selectFiltro.innerHTML = `<option value="todas">Todas as categorias</option>${opcoes}`;
  const selectForm = document.getElementById('form-gasto-categoria');
  if (selectForm) selectForm.innerHTML = `<option value="">Selecione...</option>${opcoes}`;
  const selectFormEdit = document.getElementById('modal-edit-gasto-categoria');
  if (selectFormEdit) selectFormEdit.innerHTML = `<option value="">Selecione...</option>${opcoes}`;
}

async function atualizarPainel() {
  var mes = document.getElementById('filtro-mes').value;
  var categoria = document.getElementById('filtro-categoria').value;
  var status = document.getElementById('filtro-status').value;
  var pagamento = document.getElementById('filtro-pagamento').value;

  var queryParams = new URLSearchParams({ mes: mes, categoria: categoria, status: status, forma_pagamento: pagamento });

  try {
    const resposta = await apiFetch(`${API_BASE}/gastos-painel?${queryParams}`);
    const json = await resposta.json();
    if (!json.ok) throw new Error(json.error || 'Erro ao carregar dados');
    gastosAtuais = json.data.gastos;
    resumoAtual = json.data.resumo;

    renderCards();
    renderTabela();
    renderGrafico();
  } catch (err) {
    showToast('Erro ao atualizar dados: ' + err.message, 'error');
  }
}

function renderCards() {
  if (!resumoAtual) return;

  var refTexto = parseReferenciaVisivel(document.getElementById('filtro-mes').value);
  document.getElementById('resumo-ref-texto').textContent = refTexto;

  document.getElementById('card-total-pago').textContent = formatarMoedaBR(resumoAtual.totalPago);
  document.getElementById('card-total-pendente').textContent = formatarMoedaBR(resumoAtual.totalPendente);
  document.getElementById('card-qtd-lancamentos').textContent = resumoAtual.qtdLancamentos;
  document.getElementById('card-media-dia').textContent = formatarMoedaBR(resumoAtual.mediaPorDia);
  document.getElementById('card-maior-categoria').textContent = resumoAtual.maiorCategoria ? resumoAtual.maiorCategoria.nome : '-';
}

function getStatusBadge(status) {
  if (status === 'pago') return '<span class="status-badge" style="background: rgba(34,197,94,0.15); color: #4ade80;">Pago</span>';
  if (status === 'pendente') return '<span class="status-badge" style="background: rgba(234,179,8,0.15); color: #facc15;">Pendente</span>';
  if (status === 'cancelado') return '<span class="status-badge" style="background: rgba(100,116,139,0.15); color: #94a3b8;">Cancelado</span>';
  return escapeHtml(status);
}

function renderTabela() {
  var container = document.getElementById('gastos-tabela-body');
  if (!container) return;

  if (gastosAtuais.length === 0) {
    container.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px 20px; color: var(--text-muted);">Nenhum gasto encontrado para os filtros selecionados.</td></tr>';
    return;
  }

  var html = '';
  for (var i = 0; i < gastosAtuais.length; i++) {
    var g = gastosAtuais[i];
    var rowStyle = g.status === 'cancelado' ? 'opacity: 0.5;' : '';
    var obsHtml = g.observacao ? '<div style="font-size: 0.8rem; color: var(--text-muted);">' + escapeHtml(g.observacao) + '</div>' : '';
    var valorColor = g.status === 'pago' ? 'var(--text-primary)' : 'var(--text-secondary)';

    var btnEditar = '';
    if (g.status !== 'cancelado') {
      btnEditar = '<button class="btn-icon" title="Editar Gasto" onclick="window.abrirEditarGasto(' + g.id + ')" style="margin-right: 4px;"><i data-lucide="edit-2"></i></button>';
    }

    html += '<tr style="' + rowStyle + '">';
    html += '<td style="color: var(--text-secondary);">' + formatarDataBR(g.data) + '</td>';
    html += '<td><div style="font-weight: 500; color: var(--text-primary);">' + escapeHtml(g.descricao) + '</div>' + obsHtml + '</td>';
    html += '<td><div style="display: flex; align-items: center; gap: 8px;"><span style="display:inline-block; width:8px; height:8px; border-radius:50%; background: var(--border-subtle);"></span>' + escapeHtml(g.categoria_nome) + '</div></td>';
    html += '<td style="color: var(--text-secondary);">' + escapeHtml(g.forma_pagamento) + '</td>';
    html += '<td style="font-weight: 600; color: ' + valorColor + ';">' + formatarMoedaBR(g.valor) + '</td>';
    html += '<td>' + getStatusBadge(g.status) + '</td>';
    html += '<td style="text-align: right;">' + btnEditar;
    html += '<button class="btn-icon" title="Excluir" onclick="window.excluirGasto(' + g.id + ')"><i data-lucide="trash-2" style="color: var(--color-danger);"></i></button>';
    html += '</td></tr>';
  }
  container.innerHTML = html;

  if (window.lucide) window.lucide.createIcons();
}

function renderGrafico() {
  var canvas = document.getElementById('grafico-categorias');
  if (!canvas || !resumoAtual || !resumoAtual.gastosPorCategoria) return;

  var dadosCores = resumoAtual.gastosPorCategoria.map(function(c) {
    var catDb = categorias.find(function(x) { return x.nome === c.nome; });
    return {
      nome: c.nome,
      valor: c.valor,
      cor: catDb ? catDb.cor : '#64748b'
    };
  });

  var labels = dadosCores.map(function(d) { return d.nome; });
  var data = dadosCores.map(function(d) { return d.valor; });
  var backgroundColors = dadosCores.map(function(d) { return d.cor; });

  if (chartInstancia) {
    chartInstancia.destroy();
  }

  if (!Chart) {
    console.warn('Chart.js nao encontrado.');
    return;
  }

  chartInstancia = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: backgroundColors,
        borderWidth: 0,
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '75%',
      plugins: {
        legend: {
          position: 'right',
          labels: {
            color: '#94a3b8',
            font: { family: "'Inter', sans-serif", size: 12 },
            padding: 20,
            usePointStyle: true,
            pointStyle: 'circle'
          }
        },
        tooltip: {
          backgroundColor: '#1e293b',
          titleColor: '#f8fafc',
          bodyColor: '#cbd5e1',
          borderColor: '#334155',
          borderWidth: 1,
          padding: 12,
          callbacks: {
            label: function(context) {
              return ' ' + formatarMoedaBR(context.raw);
            }
          }
        }
      }
    }
  });
}

// =======================================
// ACOES
// =======================================

window.salvarGasto = async function() {
  var btn = document.getElementById('btn-salvar-gasto');
  var originalHtml = btn.innerHTML;

  var data = document.getElementById('form-gasto-data').value;
  var descricao = document.getElementById('form-gasto-desc').value.trim();
  var valorStr = document.getElementById('form-gasto-valor').value.toString().trim();
  if (valorStr.includes(',') && valorStr.includes('.')) {
    valorStr = valorStr.replace(/\./g, '');
  }
  valorStr = valorStr.replace(',', '.');
  var valor = parseFloat(valorStr);

  var categoria_id = parseInt(document.getElementById('form-gasto-categoria').value);
  var forma_pagamento = document.getElementById('form-gasto-pgto').value;
  var status = document.getElementById('form-gasto-status').value;
  var observacao = document.getElementById('form-gasto-obs').value.trim();

  if (!data || !descricao || isNaN(valor) || valor <= 0 || !categoria_id || !forma_pagamento || !status) {
    showToast('Preencha os campos obrigatorios.', 'error');
    return;
  }

  var categoriaObj = categorias.find(function(c) { return c.id === categoria_id; });

  var payload = {
    data: data, descricao: descricao, valor: valor,
    categoria_id: categoria_id, categoria_nome: categoriaObj.nome,
    forma_pagamento: forma_pagamento, status: status, observacao: observacao
  };

  btn.innerHTML = '<i data-lucide="loader" class="spin"></i>';

  try {
    var res = await apiFetch(API_BASE + '/gastos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    var json = await res.json();
    if (!json.ok) throw new Error(json.error || 'Erro ao salvar');

    showToast('Gasto registrado!', 'success');

    document.getElementById('form-gasto-desc').value = '';
    document.getElementById('form-gasto-valor').value = '';
    document.getElementById('form-gasto-obs').value = '';
    document.getElementById('form-gasto-categoria').value = '';
    document.getElementById('form-gasto-desc').focus();

    await atualizarPainel();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.innerHTML = originalHtml;
    if (window.lucide) window.lucide.createIcons();
  }
};

window.excluirGasto = async function(id) {
  if (!confirm('Tem certeza que deseja excluir este gasto? Acao irreversivel.')) return;

  try {
    var res = await apiFetch(API_BASE + '/gastos/' + id, { method: 'DELETE' });
    var json = await res.json();
    if (!json.ok) throw new Error(json.error || 'Erro ao excluir');

    showToast('Gasto excluido', 'success');
    await atualizarPainel();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.abrirEditarGasto = function(id) {
  var gasto = gastosAtuais.find(function(g) { return g.id === id; });
  if (!gasto) return;

  document.getElementById('modal-edit-gasto-id').value = gasto.id;
  document.getElementById('modal-edit-gasto-data').value = gasto.data;
  
  var valorBR = gasto.valor.toFixed(2).replace('.', ',');
  document.getElementById('modal-edit-gasto-valor').value = valorBR;
  
  document.getElementById('modal-edit-gasto-desc').value = gasto.descricao;
  document.getElementById('modal-edit-gasto-categoria').value = gasto.categoria_id;
  document.getElementById('modal-edit-gasto-pgto').value = gasto.forma_pagamento;
  document.getElementById('modal-edit-gasto-status').value = gasto.status;
  document.getElementById('modal-edit-gasto-obs').value = gasto.observacao || '';

  document.getElementById('modal-editar-gasto-overlay').style.display = 'flex';
};

window.confirmarEditarGasto = async function() {
  var btn = document.getElementById('btn-atualizar-gasto');
  var originalHtml = btn.innerHTML;

  var id = document.getElementById('modal-edit-gasto-id').value;
  var data = document.getElementById('modal-edit-gasto-data').value;
  var descricao = document.getElementById('modal-edit-gasto-desc').value.trim();
  var valorStr = document.getElementById('modal-edit-gasto-valor').value.toString().trim();
  if (valorStr.includes(',') && valorStr.includes('.')) {
    valorStr = valorStr.replace(/\./g, '');
  }
  valorStr = valorStr.replace(',', '.');
  var valor = parseFloat(valorStr);

  var categoria_id = parseInt(document.getElementById('modal-edit-gasto-categoria').value);
  var forma_pagamento = document.getElementById('modal-edit-gasto-pgto').value;
  var status = document.getElementById('modal-edit-gasto-status').value;
  var observacao = document.getElementById('modal-edit-gasto-obs').value.trim();

  if (!data || !descricao || isNaN(valor) || valor <= 0 || !categoria_id || !forma_pagamento || !status) {
    showToast('Preencha os campos obrigatorios.', 'error');
    return;
  }

  var categoriaObj = categorias.find(function(c) { return c.id === categoria_id; });
  var gastoExistente = gastosAtuais.find(function(g) { return String(g.id) === String(id); });
  var conta_carteira = (gastoExistente && gastoExistente.conta_carteira) ? gastoExistente.conta_carteira : 'Principal';

  var payload = {
    data: data,
    descricao: descricao,
    valor: valor,
    categoria_id: categoria_id,
    categoria_nome: categoriaObj ? categoriaObj.nome : '',
    forma_pagamento: forma_pagamento,
    conta_carteira: conta_carteira,
    status: status,
    observacao: observacao
  };

  btn.innerHTML = '<i data-lucide="loader" class="spin"></i>';

  try {
    var res = await apiFetch(API_BASE + '/gastos/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    var json = await res.json();
    if (!json.ok) throw new Error(json.error || 'Erro ao atualizar');

    showToast('Gasto atualizado!', 'success');
    document.getElementById('modal-editar-gasto-overlay').style.display = 'none';

    await atualizarPainel();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.innerHTML = originalHtml;
    if (window.lucide) window.lucide.createIcons();
  }
};

// =======================================
// HTML DA PAGINA
// =======================================

export function renderGastos() {


  var h = '';
  h += '<div class="page-header animate-in">';
  h += '  <div style="display: flex; justify-content: space-between; align-items: flex-end;">';
  h += '    <div>';
  h += '      <h1 class="page-header__title">Gastos</h1>';
  h += '      <p class="page-header__subtitle">Registre suas despesas, acompanhe seus gastos e entenda para onde seu dinheiro esta indo.</p>';
  h += '    </div>';
  h += '  </div>';
  h += '</div>';

  // FILTROS
  h += '<div class="filters-bar animate-in">';
  h += '  <div class="form-group" style="margin-bottom: 0;">';
  h += '    <label class="form-label" style="font-size: 0.75rem;">M\u00eas</label>';
  h += '    <input type="month" id="filtro-mes" class="form-control">';
  h += '  </div>';
  h += '  <div class="form-group" style="margin-bottom: 0;">';
  h += '    <label class="form-label" style="font-size: 0.75rem;">Categoria</label>';
  h += '    <select id="filtro-categoria" class="form-control">';
  h += '      <option value="todas">Carregando...</option>';
  h += '    </select>';
  h += '  </div>';
  h += '  <div class="form-group" style="margin-bottom: 0;">';
  h += '    <label class="form-label" style="font-size: 0.75rem;">Status</label>';
  h += '    <select id="filtro-status" class="form-control">';
  h += '      <option value="nao_cancelado">N\u00e3o Cancelados</option>';
  h += '      <option value="pago">Apenas Pagos</option>';
  h += '      <option value="pendente">Apenas Pendentes</option>';
  h += '      <option value="todos">Todos (incluir cancelados)</option>';
  h += '    </select>';
  h += '  </div>';
  h += '  <div class="form-group" style="margin-bottom: 0;">';
  h += '    <label class="form-label" style="font-size: 0.75rem;">Forma de Pgto</label>';
  h += '    <select id="filtro-pagamento" class="form-control">';
  h += '      <option value="todas">Todas</option>';
  h += '      <option value="Pix">Pix</option>';
  h += '      <option value="D\u00e9bito">D\u00e9bito</option>';
  h += '      <option value="Dinheiro">Dinheiro</option>';
  h += '      <option value="Cr\u00e9dito">Cr\u00e9dito</option>';
  h += '      <option value="Boleto">Boleto</option>';
  h += '      <option value="Transfer\u00eancia">Transfer\u00eancia</option>';
  h += '      <option value="Outro">Outro</option>';
  h += '    </select>';
  h += '  </div>';
  h += '</div>';

  // RESUMO MENSAL
  h += '<section class="expense-summary animate-in" aria-labelledby="resumo-gastos-titulo">';
  h += '  <div class="expense-summary__header">';
  h += '    <span class="expense-summary__header-icon" aria-hidden="true"><i data-lucide="calendar"></i></span>';
  h += '    <div><span class="expense-summary__eyebrow">RESUMO DO MÊS</span><h2 class="expense-summary__month" id="resumo-gastos-titulo"><span id="resumo-ref-texto">Carregando...</span></h2></div>';
  h += '  </div>';
  h += '  <div class="expense-summary__grid">';
  h += '    <article class="expense-summary__tile expense-summary__tile--primary"><span class="expense-summary__icon" aria-hidden="true"><i data-lucide="wallet"></i></span><div><span class="expense-summary__label">Total pago</span><strong class="expense-summary__value" id="card-total-pago">R$ 0,00</strong></div></article>';
  h += '    <article class="expense-summary__tile expense-summary__tile--warning"><span class="expense-summary__icon" aria-hidden="true"><i data-lucide="clock"></i></span><div><span class="expense-summary__label">Gastos pendentes</span><strong class="expense-summary__value" id="card-total-pendente">R$ 0,00</strong></div></article>';
  h += '    <article class="expense-summary__tile"><span class="expense-summary__icon" aria-hidden="true"><i data-lucide="list"></i></span><div><span class="expense-summary__label">Lançamentos</span><strong class="expense-summary__value" id="card-qtd-lancamentos">0</strong></div></article>';
  h += '    <article class="expense-summary__tile"><span class="expense-summary__icon" aria-hidden="true"><i data-lucide="activity"></i></span><div><span class="expense-summary__label">Média diária</span><strong class="expense-summary__value" id="card-media-dia">R$ 0,00</strong></div></article>';
  h += '    <article class="expense-summary__tile"><span class="expense-summary__icon" aria-hidden="true"><i data-lucide="tags"></i></span><div><span class="expense-summary__label">Maior categoria</span><strong class="expense-summary__value expense-summary__value--text" id="card-maior-categoria">-</strong></div></article>';
  h += '  </div>';
  h += '</section>';

  // GRID PRINCIPAL
  h += '<div class="dashboard-grid" style="grid-template-columns: 1fr 400px;">';

  // TABELA
  h += '  <div class="form-card animate-in" style="grid-column: 1;">';
  h += '    <h3 style="margin-bottom: 16px; font-weight: 600; color: var(--text-primary);">Hist\u00f3rico de Gastos</h3>';
  h += '    <div class="table-container" style="max-height: 500px; overflow-y: auto;">';
  h += '      <table class="table">';
  h += '        <thead><tr>';
  h += '          <th style="min-width: 90px;">Data</th>';
  h += '          <th>Descri\u00e7\u00e3o</th>';
  h += '          <th>Categoria</th>';
  h += '          <th>Pagamento</th>';
  h += '          <th>Valor</th>';
  h += '          <th>Status</th>';
  h += '          <th style="text-align: right;">A\u00e7\u00f5es</th>';
  h += '        </tr></thead>';
  h += '        <tbody id="gastos-tabela-body">';
  h += '          <tr><td colspan="7" style="text-align: center; padding: 20px; color: var(--text-muted);">Carregando...</td></tr>';
  h += '        </tbody>';
  h += '      </table>';
  h += '    </div>';
  h += '  </div>';

  // SIDEBAR DIREITA
  h += '  <div style="grid-column: 2; display: flex; flex-direction: column; gap: 24px;">';

  // FORM NOVO GASTO
  h += '    <div class="form-card animate-in">';
  h += '      <h3 style="margin-bottom: 20px; font-weight: 600; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">';
  h += '        <i data-lucide="plus-circle" style="color: var(--color-teal); width: 20px;"></i>';
  h += '        Novo Gasto';
  h += '      </h3>';
  h += '      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">';
  h += '        <div>';
  h += '          <label class="form-label" style="font-size: 0.75rem;">Data*</label>';
  h += '          <input type="date" id="form-gasto-data" class="form-control">';
  h += '        </div>';
  h += '        <div>';
  h += '          <label class="form-label" style="font-size: 0.75rem;">Valor*</label>';
  h += '          <input type="text" id="form-gasto-valor" class="form-control" placeholder="0,00">';
  h += '        </div>';
  h += '      </div>';
  h += '      <div style="margin-bottom: 12px;">';
  h += '        <label class="form-label" style="font-size: 0.75rem;">Descri\u00e7\u00e3o*</label>';
  h += '        <input type="text" id="form-gasto-desc" class="form-control" placeholder="Ex: Supermercado Assai">';
  h += '      </div>';
  h += '      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">';
  h += '        <div>';
  h += '          <label class="form-label" style="font-size: 0.75rem;">Categoria*</label>';
  h += '          <select id="form-gasto-categoria" class="form-control"></select>';
  h += '        </div>';
  h += '        <div>';
  h += '          <label class="form-label" style="font-size: 0.75rem;">Forma Pgto*</label>';
  h += '          <select id="form-gasto-pgto" class="form-control">';
  h += '            <option value="Pix">Pix</option>';
  h += '            <option value="D\u00e9bito">D\u00e9bito</option>';
  h += '            <option value="Dinheiro">Dinheiro</option>';
  h += '            <option value="Cr\u00e9dito">Cr\u00e9dito</option>';
  h += '            <option value="Boleto">Boleto</option>';
  h += '            <option value="Transfer\u00eancia">Transfer\u00eancia</option>';
  h += '            <option value="Outro">Outro</option>';
  h += '          </select>';
  h += '        </div>';
  h += '      </div>';
  h += '      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">';
  h += '        <div>';
  h += '          <label class="form-label" style="font-size: 0.75rem;">Status*</label>';
  h += '          <select id="form-gasto-status" class="form-control">';
  h += '            <option value="pago">Pago</option>';
  h += '            <option value="pendente">Pendente</option>';
  h += '          </select>';
  h += '        </div>';
  h += '        <div>';
  h += '          <label class="form-label" style="font-size: 0.75rem;">Obs opcional</label>';
  h += '          <input type="text" id="form-gasto-obs" class="form-control" placeholder="Detalhes...">';
  h += '        </div>';
  h += '      </div>';
  h += '      <button id="btn-salvar-gasto" class="btn-primary" onclick="window.salvarGasto()" style="width: 100%; justify-content: center; height: 44px;">';
  h += '        Adicionar Gasto';
  h += '      </button>';
  h += '    </div>';

  // GRAFICO
  h += '    <div class="form-card animate-in" style="animation-delay: 0.1s; display: flex; flex-direction: column;">';
  h += '      <h3 style="margin-bottom: 20px; font-weight: 600; color: var(--text-primary);">Por Categoria</h3>';
  h += '      <div style="flex: 1; min-height: 250px; position: relative;">';
  h += '        <canvas id="grafico-categorias"></canvas>';
  h += '      </div>';
  h += '    </div>';

  h += '  </div>';
  h += '</div>';

  // MODAL EDITAR GASTO
  h += '<!-- Modal Editar Gasto Styles -->';
  h += '<style>';
  h += '  @keyframes modalFadeIn {';
  h += '    from { opacity: 0; }';
  h += '    to { opacity: 1; }';
  h += '  }';
  h += '  @keyframes modalZoomIn {';
  h += '    from { transform: scale(0.95); opacity: 0; }';
  h += '    to { transform: scale(1); opacity: 1; }';
  h += '  }';
  h += '  .gasto-modal-overlay {';
  h += '    position: fixed;';
  h += '    top: 0;';
  h += '    left: 0;';
  h += '    width: 100%;';
  h += '    height: 100%;';
  h += '    background: rgba(11, 12, 16, 0.65) !important;';
  h += '    z-index: 1000;';
  h += '    justify-content: center;';
  h += '    align-items: center;';
  h += '    backdrop-filter: blur(8px);';
  h += '    -webkit-backdrop-filter: blur(8px);';
  h += '    animation: modalFadeIn 0.2s ease-out forwards;';
  h += '  }';
  h += '  .gasto-modal-content {';
  h += '    background: #12141a !important;';
  h += '    padding: 24px;';
  h += '    border-radius: 12px;';
  h += '    width: 95%;';
  h += '    max-width: 460px;';
  h += '    border: 1px solid rgba(255, 255, 255, 0.08) !important;';
  h += '    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);';
  h += '    animation: modalZoomIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;';
  h += '  }';
  h += '</style>';
  h += '<!-- Modal Editar Gasto -->';
  h += '<div id="modal-editar-gasto-overlay" class="gasto-modal-overlay" style="display: none;">';
  h += '  <div class="gasto-modal-content">';
  h += '    <h3 style="font-weight: 600; color: var(--text-primary); margin-bottom: 20px; font-size: 1.2rem; display: flex; align-items: center; gap: 8px;">';
  h += '      <i data-lucide="edit" style="color: var(--color-teal); width: 20px;"></i>';
  h += '      Editar Gasto';
  h += '    </h3>';
  h += '    ';
  h += '    <input type="hidden" id="modal-edit-gasto-id">';
  h += '    ';
  h += '    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">';
  h += '      <div>';
  h += '        <label class="form-label" style="font-size: 0.75rem;">Data*</label>';
  h += '        <input type="date" id="modal-edit-gasto-data" class="form-control">';
  h += '      </div>';
  h += '      <div>';
  h += '        <label class="form-label" style="font-size: 0.75rem;">Valor*</label>';
  h += '        <input type="text" id="modal-edit-gasto-valor" class="form-control" placeholder="0,00">';
  h += '      </div>';
  h += '    </div>';
  h += '    ';
  h += '    <div style="margin-bottom: 12px;">';
  h += '      <label class="form-label" style="font-size: 0.75rem;">Descrição*</label>';
  h += '      <input type="text" id="modal-edit-gasto-desc" class="form-control" placeholder="Ex: Supermercado Assai">';
  h += '    </div>';
  h += '    ';
  h += '    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">';
  h += '      <div>';
  h += '        <label class="form-label" style="font-size: 0.75rem;">Categoria*</label>';
  h += '        <select id="modal-edit-gasto-categoria" class="form-control"></select>';
  h += '      </div>';
  h += '      <div>';
  h += '        <label class="form-label" style="font-size: 0.75rem;">Forma Pgto*</label>';
  h += '        <select id="modal-edit-gasto-pgto" class="form-control">';
  h += '          <option value="Pix">Pix</option>';
  h += '          <option value="Débito">Débito</option>';
  h += '          <option value="Dinheiro">Dinheiro</option>';
  h += '          <option value="Crédito">Crédito</option>';
  h += '          <option value="Boleto">Boleto</option>';
  h += '          <option value="Transferência">Transferência</option>';
  h += '          <option value="Outro">Outro</option>';
  h += '        </select>';
  h += '      </div>';
  h += '    </div>';
  h += '    ';
  h += '    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px;">';
  h += '      <div>';
  h += '        <label class="form-label" style="font-size: 0.75rem;">Status*</label>';
  h += '        <select id="modal-edit-gasto-status" class="form-control">';
  h += '          <option value="pago">Pago</option>';
  h += '          <option value="pendente">Pendente</option>';
  h += '          <option value="cancelado">Cancelado</option>';
  h += '        </select>';
  h += '      </div>';
  h += '      <div>';
  h += '        <label class="form-label" style="font-size: 0.75rem;">Obs opcional</label>';
  h += '        <input type="text" id="modal-edit-gasto-obs" class="form-control" placeholder="Detalhes...">';
  h += '      </div>';
  h += '    </div>';
  h += '    ';
  h += '    <div style="display: flex; gap: 12px;">';
  h += '      <button class="btn-secondary" style="flex: 1; justify-content: center; height: 40px;" onclick="document.getElementById(\'modal-editar-gasto-overlay\').style.display=\'none\'">Cancelar</button>';
  h += '      <button id="btn-atualizar-gasto" class="btn-primary" style="flex: 1; justify-content: center; height: 40px; background: var(--color-teal); border: none;" onclick="window.confirmarEditarGasto()">Salvar Alterações</button>';
  h += '    </div>';
  h += '  </div>';
  h += '</div>';

  return h;
}
