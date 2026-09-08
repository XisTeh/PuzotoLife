import { apiFetch } from '../services/http.js';
import { formatarMoedaBR, formatarDataBR, dataAtualISO } from '../utils/formatters.js';
import { legacyStringArgument } from '../security/legacyHandlers.js';
import { escapeHtml, setIconMessage } from '../security/safeDom.js';

const API_BASE = '/api';

// Estado
let abaAtiva = 'pagador'; // 'lancamentos', 'ranon' ou 'pagador'
let lancamentos = [];
let ranonHistorico = [];
let empresas = [];
let historicoResumo = null;
let recebimentosPendentes = [];

// Filtros
let mesFiltro = dataAtualISO().substring(0, 7);
let statusFiltro = 'todos';
let empresaFiltro = 'todas';

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

async function fetchAPI(endpoint, options = {}) {
  const res = await apiFetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Erro na requisição');
  return data.data;
}

export async function initHistorico() {
  document.getElementById('hist-filtro-mes').value = mesFiltro;
  await loadEmpresas();
  await loadDados();
}

async function loadEmpresas() {
  try {
    empresas = await fetchAPI('/empresas');
    const select = document.getElementById('hist-filtro-empresa');
    if (select) {
      select.innerHTML = '<option value="todas">Todas Empresas</option>' +
        empresas.map(e => `<option value="${e.id}">${escapeHtml(e.nome)}</option>`).join('');
    }
  } catch (e) {
    console.error('Erro ao carregar empresas:', e);
  }
}

async function loadDados() {
  try {
    const queryResumo = new URLSearchParams({ mes: mesFiltro });
    if (empresaFiltro !== 'todas') queryResumo.append('empresa_id', empresaFiltro);
    if (statusFiltro !== 'todos') queryResumo.append('status', statusFiltro);
    
    historicoResumo = await fetchAPI(`/trabalho/historico/resumo?${queryResumo.toString()}`);

    if (abaAtiva === 'lancamentos') {
      const query = new URLSearchParams({
        mes: mesFiltro,
      });
      if (empresaFiltro !== 'todas') query.append('empresa_id', empresaFiltro);
      if (statusFiltro !== 'todos') query.append('status', statusFiltro);
      
      lancamentos = await fetchAPI(`/lancamentos?${query.toString()}`);
      renderLancamentosTab();
    } else {
      const query = new URLSearchParams();
      if (mesFiltro) query.append('mes', mesFiltro);
      if (statusFiltro !== 'todos') query.append('status', statusFiltro);
      
      ranonHistorico = await fetchAPI(`/ranon/historico?${query.toString()}`);
      renderRanonTab();
    }

    if (abaAtiva === 'pagador') {
      recebimentosPendentes = await fetchAPI(`/pagadores/recebimentos-pendentes?mes=${mesFiltro}`);
      renderPagadorTab();
    }
    
    renderMetrics();
  } catch (e) {
    showToast('Erro ao carregar dados: ' + e.message, 'error');
  }
}

window.filtrarHistorico = async function() {
  mesFiltro = document.getElementById('hist-filtro-mes').value;
  statusFiltro = document.getElementById('hist-filtro-status').value;
  empresaFiltro = document.getElementById('hist-filtro-empresa').value;
  await loadDados();
};

window.mudarAbaHistorico = function(aba) {
  abaAtiva = aba;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`tab-btn-${aba}`).classList.add('active');
  
  if (aba === 'ranon') {
    document.getElementById('hist-filtro-empresa').parentElement.style.display = 'none';
    empresaFiltro = 'todas';
    document.getElementById('hist-filtro-empresa').value = 'todas';
  } else if (aba === 'pagador') {
    document.getElementById('hist-filtro-empresa').parentElement.style.display = 'none';
    document.getElementById('hist-filtro-status').parentElement.style.display = 'none';
  } else {
    document.getElementById('hist-filtro-empresa').parentElement.style.display = 'block';
    document.getElementById('hist-filtro-status').parentElement.style.display = 'block';
  }
  
  loadDados();
};

// ============================================================================
// RECEBIMENTO
// ============================================================================

// Modal variables
let modalResolve = null;

function openConfirmModal(title, message, resumo, btnText) {
  return new Promise((resolve) => {
    let modal = document.getElementById('hist-confirm-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'hist-confirm-modal';
      modal.className = 'modal-backdrop';
      modal.style.display = 'flex';
      modal.style.alignItems = 'center';
      modal.style.justifyContent = 'center';
      modal.style.position = 'fixed';
      modal.style.top = '0';
      modal.style.left = '0';
      modal.style.width = '100%';
      modal.style.height = '100%';
      modal.style.backgroundColor = 'rgba(0,0,0,0.6)';
      modal.style.zIndex = '9999';
      document.body.appendChild(modal);
    }
    
    modal.innerHTML = `
      <div class="form-card animate-in" style="width: 400px; padding: 24px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
        <h3 style="font-size: 1.25rem; font-weight: 600; margin-bottom: 8px; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
          <i data-lucide="check-circle" style="color: var(--color-teal);"></i> ${title}
        </h3>
        <p style="font-size: 0.95rem; color: var(--text-muted); margin-bottom: 16px; line-height: 1.5;">${message}</p>
        
        <div style="background: var(--bg-body); border: 1px solid var(--border-subtle); border-radius: 8px; padding: 16px; margin-bottom: 24px;">
          ${resumo}
        </div>
        
        <div style="display: flex; gap: 12px; justify-content: flex-end;">
          <button class="btn-secondary" id="hist-modal-cancel">Cancelar</button>
          <button class="btn-primary" id="hist-modal-confirm" style="background: var(--color-teal); border-color: var(--color-teal);">${btnText}</button>
        </div>
      </div>
    `;
    
    modal.style.display = 'flex';
    lucide.createIcons();
    
    document.getElementById('hist-modal-cancel').onclick = () => {
      modal.style.display = 'none';
      resolve(false);
    };
    
    document.getElementById('hist-modal-confirm').onclick = () => {
      modal.style.display = 'none';
      resolve(true);
    };
  });
}

window.receberLancamento = async function(id) {
  const l = lancamentos.find(x => x.id === id);
  if (!l) return;
  
  const resumoHtml = `
    <div style="display: grid; grid-template-columns: 1fr; gap: 8px; font-size: 0.9rem;">
      <div style="display: flex; justify-content: space-between;">
        <span style="color: var(--text-muted);">Empresa</span>
        <span style="font-weight: 600;">${escapeHtml(l.empresa_nome)}</span>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span style="color: var(--text-muted);">Data</span>
        <span style="font-weight: 500;">${formatarDataBR(l.data)}</span>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span style="color: var(--text-muted);">Quantidade</span>
        <span style="font-weight: 500;">${l.quantidade} exames</span>
      </div>
      <div style="display: flex; justify-content: space-between; border-top: 1px solid var(--border-subtle); padding-top: 8px; margin-top: 4px;">
        <span style="color: var(--text-muted);">Valor total</span>
        <span style="font-weight: 600; color: var(--color-teal);">${formatarMoedaBR(l.total)}</span>
      </div>
    </div>
  `;
  
  const conf = await openConfirmModal(
    'Marcar como recebido?',
    'Esta ação vai marcar este lançamento como recebido e criar uma receita automática em Finanças > Receitas.',
    resumoHtml,
    'Sim, marcar como recebido'
  );
  
  if (!conf) return;

  try {
    const res = await fetchAPI(`/trabalho/lancamentos/${id}/receber`, { method: 'POST' });
    showToast(res.message || 'Marcado como recebido!');
    await loadDados();
  } catch (err) {
    showToast('Erro: ' + err.message, 'error');
  }
};

window.receberLaudoRanon = async function(id) {
  const l = ranonHistorico.find(x => x.id === id);
  if (!l) return;
  
  const resumoHtml = `
    <div style="display: grid; grid-template-columns: 1fr; gap: 8px; font-size: 0.9rem;">
      <div style="display: flex; justify-content: space-between;">
        <span style="color: var(--text-muted);">Registro (Paciente)</span>
        <span style="font-weight: 600;">${escapeHtml(l.registro_paciente)}</span>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span style="color: var(--text-muted);">Data</span>
        <span style="font-weight: 500;">${formatarDataBR(l.data)}</span>
      </div>
      <div style="display: flex; justify-content: space-between; border-top: 1px solid var(--border-subtle); padding-top: 8px; margin-top: 4px;">
        <span style="color: var(--text-muted);">Valor total</span>
        <span style="font-weight: 600; color: var(--color-teal);">${formatarMoedaBR(l.total)}</span>
      </div>
    </div>
  `;
  
  const conf = await openConfirmModal(
    'Marcar como recebido?',
    'Esta ação vai marcar este laudo como recebido e criar uma receita automática em Finanças > Receitas.',
    resumoHtml,
    'Sim, marcar como recebido'
  );
  
  if (!conf) return;

  try {
    const res = await fetchAPI(`/ranon/historico/${id}/receber`, { method: 'POST' });
    showToast(res.message || 'Laudo RX marcado como recebido!');
    await loadDados();
  } catch (err) {
    showToast('Erro: ' + err.message, 'error');
  }
};

window.receberPorPagador = async function(pagador, tipo, referencia, valor, dataExibicao) {
  const dataMostrada = dataExibicao || referencia;
  const resumoHtml = `
    <div style="display: grid; grid-template-columns: 1fr; gap: 8px; font-size: 0.9rem;">
      <div style="display: flex; justify-content: space-between;">
        <span style="color: var(--text-muted);">Pagador</span>
        <span style="font-weight: 600;">${pagador}</span>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span style="color: var(--text-muted);">Referência</span>
        <span style="font-weight: 500;">${tipo === 'remessa' ? formatarDataBR(dataMostrada) : (tipo === 'mensal' ? dataMostrada : (dataMostrada.replace('.xlsx','')))}</span>
      </div>
      <div style="display: flex; justify-content: space-between; border-top: 1px solid var(--border-subtle); padding-top: 8px; margin-top: 4px;">
        <span style="color: var(--text-muted);">Valor total a receber</span>
        <span style="font-weight: 600; color: var(--color-teal);">${formatarMoedaBR(valor)}</span>
      </div>
    </div>
  `;
  
  const conf = await openConfirmModal(
    'Marcar como recebido?',
    'Esta ação vai marcar os itens correspondentes como recebidos e criar uma receita automática em Finanças > Receitas.',
    resumoHtml,
    'Sim, marcar como recebido'
  );
  
  if (!conf) return;

  try {
    const res = await fetchAPI('/pagadores/receber', { 
      method: 'POST',
      body: JSON.stringify({ pagador, tipo, referencia, mes: mesFiltro })
    });
    showToast(res.message || 'Recebimento processado com sucesso!');
    await loadDados();
  } catch (err) {
    showToast('Erro: ' + err.message, 'error');
  }
};

// ============================================================================
// RENDERS
// ============================================================================

function badgeStatus(status) {
  let cor = 'var(--text-muted)';
  if (status === 'produzido') cor = 'var(--color-yellow)';
  if (status === 'fechado') cor = 'var(--color-purple)';
  if (status === 'recebido') cor = 'var(--color-teal)';
  if (status === 'pendente') cor = '#f97316';
  
  return `
    <span style="display: inline-flex; align-items: center; gap: 6px; font-size: 0.75rem; padding: 4px 10px; border-radius: 100px; background: var(--bg-surface); border: 1px solid var(--border-subtle); font-weight: 500; text-transform: uppercase;">
      <span style="width: 6px; height: 6px; border-radius: 50%; background: ${cor};"></span>
      ${status}
    </span>
  `;
}

function renderMetrics() {
  if (!historicoResumo) return;
  
  const elFechado = document.getElementById('hist-metrica-fechado');
  const elRecebido = document.getElementById('hist-metrica-recebido');
  const elAReceber = document.getElementById('hist-metrica-areceber');
  const elQtdTotal = document.getElementById('hist-metrica-qtd');
  const elRecMes = document.getElementById('hist-metrica-recmes');
  
  if (elFechado) elFechado.textContent = formatarMoedaBR(historicoResumo.totalFechado);
  if (elRecebido) elRecebido.textContent = formatarMoedaBR(historicoResumo.totalRecebido);
  if (elAReceber) elAReceber.textContent = formatarMoedaBR(historicoResumo.aReceber);
  if (elQtdTotal) elQtdTotal.textContent = historicoResumo.quantidadeTotal;
  if (elRecMes) elRecMes.textContent = formatarMoedaBR(historicoResumo.recebimentosMes);
}

function renderLancamentosTab() {
  const tbody = document.getElementById('tbody-historico');
  const thead = document.getElementById('thead-historico');
  
  thead.innerHTML = `<tr><th>Data</th><th>Empresa</th><th>Qtd</th><th>V. Unitário</th><th>Total</th><th>Status</th><th>Recebido Em</th><th>Obs</th><th>Ações</th></tr>`;

  if (lancamentos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: var(--text-muted);">Nenhum lançamento encontrado.</td></tr>';
    return;
  }

  let html = '';
  lancamentos.forEach(l => {
    const isCancelado = l.status === 'cancelado';
    const isRecebido = l.status === 'recebido';
    
    html += `
      <tr style="${isCancelado ? 'opacity: 0.5;' : ''}">
        <td>${formatarDataBR(l.data)} <span style="font-size:0.8rem; color:var(--text-muted);">${l.horario || ''}</span></td>
        <td style="font-weight: 500;">${escapeHtml(l.empresa_nome)}</td>
        <td>${l.quantidade}</td>
        <td>${formatarMoedaBR(l.valor_unitario)}</td>
        <td style="font-weight: 600; color: var(--color-blue);">${formatarMoedaBR(l.total)}</td>
        <td>${badgeStatus(l.status)}</td>
        <td>${l.recebido_em ? formatarDataBR(l.recebido_em) : '-'}</td>
        <td style="font-size: 0.8rem; color: var(--text-muted); max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(l.observacao || '')}">${escapeHtml(l.observacao || '-')}</td>
        <td>
          <div style="display: flex; gap: 8px;">
            ${isRecebido ? `<span style="font-size: 0.8rem; color: var(--color-teal); display: flex; align-items: center; gap: 4px;"><i data-lucide="check" style="width: 14px;"></i> Pago</span>` : `<span style="font-size: 0.8rem; color: var(--text-muted);">-</span>`}
          </div>
        </td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
  lucide.createIcons();
}

function renderRanonTab() {
  const tbody = document.getElementById('tbody-historico');
  const thead = document.getElementById('thead-historico');
  
  thead.innerHTML = `<tr><th>Data</th><th>Paciente (Registro)</th><th>V. Unitário</th><th>Total</th><th>Status</th><th>Recebido Em</th><th>Excel</th><th>Obs</th><th>Ações</th></tr>`;

  if (ranonHistorico.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: var(--text-muted);">Nenhum laudo RX encontrado.</td></tr>';
    return;
  }

  let html = '';
  ranonHistorico.forEach(l => {
    const isCancelado = l.status === 'cancelado';
    const isRecebido = l.status === 'recebido';
    
    html += `
      <tr style="${isCancelado ? 'opacity: 0.5;' : ''}">
        <td>${formatarDataBR(l.data)} <span style="font-size:0.8rem; color:var(--text-muted);">${l.horario || ''}</span></td>
        <td style="font-weight: 500;">${escapeHtml(l.registro_paciente)}</td>
        <td>${formatarMoedaBR(l.valor_unitario)}</td>
        <td style="font-weight: 600; color: var(--color-blue);">${formatarMoedaBR(l.total)}</td>
        <td>${badgeStatus(l.status)}</td>
        <td>${l.recebido_em ? formatarDataBR(l.recebido_em) : '-'}</td>
        <td>${l.arquivo_excel_backup ? `<span style="font-size:0.8rem; color:var(--color-green);"><i data-lucide="file-spreadsheet" style="width:14px; margin-bottom:-2px;"></i> Salvo</span>` : '-'}</td>
        <td style="font-size: 0.8rem; color: var(--text-muted); max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(l.observacao || '')}">${escapeHtml(l.observacao || '-')}</td>
        <td>
          <div style="display: flex; gap: 8px;">
            ${isRecebido ? `<span style="font-size: 0.8rem; color: var(--color-teal); display: flex; align-items: center; gap: 4px;"><i data-lucide="check" style="width: 14px;"></i> Pago</span>` : `<span style="font-size: 0.8rem; color: var(--text-muted);">-</span>`}
          </div>
        </td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
  lucide.createIcons();
}

// ============================================================================
// ABA: POR PAGADOR
// ============================================================================

async function renderPagadorTab() {
  const thead = document.getElementById('thead-historico');
  const tbody = document.getElementById('tbody-historico');
  if (!thead || !tbody) return;

  thead.innerHTML = `
    <tr>
      <th>Pagador</th>
      <th>Tipo</th>
      <th>Referência</th>
      <th>Qtd Exames</th>
      <th>Valor Total</th>
      <th>Status</th>
      <th style="text-align: right;">Ações</th>
    </tr>
  `;

  if (!recebimentosPendentes || recebimentosPendentes.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:24px; color:var(--text-muted);">Nenhum dado encontrado para o mês.</td></tr>';
    return;
  }

  const colors = { 'Dr. Alexandre': '#14b8a6', 'Dr. Ranon / RX': '#06b6d4', 'Padrão': '#f59e0b' };

  tbody.innerHTML = recebimentosPendentes.map(p => `
    <tr>
      <td>
        <div style="display: flex; align-items: center; gap: 8px;">
          <div style="width: 8px; height: 8px; border-radius: 50%; background: ${colors[p.pagador] || '#64748b'};"></div>
          <strong style="color: var(--text-primary);">${escapeHtml(p.pagador)}</strong>
        </div>
      </td>
      <td style="color: var(--text-secondary); font-size: 0.85rem; text-transform: capitalize;">${p.tipo === 'pendente' ? 'Em Aberto' : p.tipo}</td>
      <td style="font-weight: 500; ${p.tipo === 'pendente' ? 'color: #f97316; font-style: italic;' : ''}">${p.tipo === 'remessa' ? formatarDataBR(p.data_referencia || p.referencia) : (p.tipo === 'mensal' ? p.referencia : p.referencia.replace('.xlsx',''))}</td>
      <td>${p.qtd}</td>
      <td style="font-weight: 600; color: ${p.tipo === 'pendente' ? '#f97316' : 'var(--color-blue)'}">${formatarMoedaBR(p.valor)}</td>
      <td>${badgeStatus(p.status)}</td>
      <td style="text-align: right;">
        ${p.status === 'fechado' 
          ? `<button class="btn-primary" style="padding: 4px 12px; font-size: 0.8rem; background: var(--color-teal); border-color: var(--color-teal);" onclick="window.receberPorPagador(${legacyStringArgument(p.pagador)}, ${legacyStringArgument(p.tipo)}, ${legacyStringArgument(p.referencia)}, ${p.valor}, ${legacyStringArgument(p.data_referencia || p.referencia)})">Receber</button>`
          : p.status === 'pendente'
            ? `<span style="font-size: 0.75rem; color: #f97316;">Salve a planilha para receber</span>`
            : `<span style="font-size: 0.8rem; color: var(--color-teal); display: flex; align-items: center; gap: 4px; justify-content: flex-end;"><i data-lucide="check" style="width: 14px;"></i> Pago</span>`
        }
      </td>
    </tr>
  `).join('');
  
  lucide.createIcons();
}

// ============================================================================
// ESTRUTURA HTML
// ============================================================================

export function renderHistoricoPage() {


  let h = '';
  
  h += '<div id="toast-container" class="toast-container"></div>';

  h += '<div class="page-header animate-in">';
  h += '  <h1 class="page-header__title">Histórico e Recebimentos</h1>';
  h += '  <p class="page-header__subtitle">Consulte os registros fechados do trabalho e controle o que já virou dinheiro recebido.</p>';
  h += '</div>';

  // METRICS GRID (5 cards)
  h += '<div class="metrics-grid animate-in" style="grid-template-columns: repeat(5, 1fr); gap: 16px; margin-bottom: 24px;">';
  h += '  <div class="metric-card">';
  h += '    <div class="metric-card__header"><div class="metric-card__label-top">Total Fechado</div></div>';
  h += '    <div class="metric-card__body"><div class="metric-card__value" id="hist-metrica-fechado" style="color: var(--color-purple);">R$ 0,00</div></div>';
  h += '  </div>';
  h += '  <div class="metric-card">';
  h += '    <div class="metric-card__header"><div class="metric-card__label-top">Total Recebido</div></div>';
  h += '    <div class="metric-card__body"><div class="metric-card__value" id="hist-metrica-recebido" style="color: var(--color-teal);">R$ 0,00</div></div>';
  h += '  </div>';
  h += '  <div class="metric-card">';
  h += '    <div class="metric-card__header"><div class="metric-card__label-top">A Receber</div></div>';
  h += '    <div class="metric-card__body"><div class="metric-card__value" id="hist-metrica-areceber" style="color: var(--color-blue);">R$ 0,00</div></div>';
  h += '  </div>';
  h += '  <div class="metric-card">';
  h += '    <div class="metric-card__header"><div class="metric-card__label-top">Quantidade Total</div></div>';
  h += '    <div class="metric-card__body"><div class="metric-card__value" id="hist-metrica-qtd" style="color: var(--text-primary); font-size: 1.6rem;">0</div></div>';
  h += '  </div>';
  h += '  <div class="metric-card">';
  h += '    <div class="metric-card__header"><div class="metric-card__label-top">Recebimentos do Mês</div></div>';
  h += '    <div class="metric-card__body"><div class="metric-card__value" id="hist-metrica-recmes" style="color: var(--color-teal); font-size: 1.2rem;">R$ 0,00</div></div>';
  h += '  </div>';
  h += '</div>';

  // ABAS
  h += '<div class="tabs animate-in" style="margin-bottom: 24px; display: flex; gap: 8px; border-bottom: 1px solid var(--border-subtle); padding-bottom: 8px;">';
  h += '  <button id="tab-btn-pagador" class="tab-btn active" onclick="window.mudarAbaHistorico(\'pagador\')" style="background:none; border:none; color:var(--text-primary); font-size:1rem; font-weight:500; cursor:pointer; padding:8px 16px; border-radius:6px; transition:0.2s;">Por Pagador</button>';
  h += '  <button id="tab-btn-ranon" class="tab-btn" onclick="window.mudarAbaHistorico(\'ranon\')" style="background:none; border:none; color:var(--text-primary); font-size:1rem; font-weight:500; cursor:pointer; padding:8px 16px; border-radius:6px; transition:0.2s;">Dr. Ranon / RX</button>';
  h += '  <button id="tab-btn-lancamentos" class="tab-btn" onclick="window.mudarAbaHistorico(\'lancamentos\')" style="background:none; border:none; color:var(--text-primary); font-size:1rem; font-weight:500; cursor:pointer; padding:8px 16px; border-radius:6px; transition:0.2s;">Lançamentos</button>';
  h += '</div>';

  // ESTILOS DAS ABAS
  h += '<style>.tab-btn.active { background: var(--bg-surface); border: 1px solid var(--border-subtle); color: var(--color-blue) !important; }</style>';

  // FILTROS
  h += '<div class="form-card animate-in" style="padding: 16px; margin-bottom: 24px; display: flex; gap: 16px; flex-wrap: wrap; align-items: flex-end;">';
  h += '  <div class="form-group" style="flex: 1; min-width: 150px;">';
  h += '    <label class="form-label">Mês</label>';
  h += '    <input type="month" id="hist-filtro-mes" class="form-control">';
  h += '  </div>';
  h += '  <div class="form-group" style="flex: 1; min-width: 150px;">';
  h += '    <label class="form-label">Empresa</label>';
  h += '    <select id="hist-filtro-empresa" class="form-control"><option value="todas">Todas Empresas</option></select>';
  h += '  </div>';
  h += '  <div class="form-group" style="flex: 1; min-width: 150px;">';
  h += '    <label class="form-label">Status</label>';
  h += '    <select id="hist-filtro-status" class="form-control">';
  h += '      <option value="todos">Todos</option>';
  h += '      <option value="produzido">Produzido</option>';
  h += '      <option value="fechado">Fechado</option>';
  h += '      <option value="recebido">Recebido</option>';
  h += '      <option value="cancelado">Cancelado</option>';
  h += '    </select>';
  h += '  </div>';
  h += '  <div class="form-group" style="width: 100px;">';
  h += '    <button class="btn-primary" style="width: 100%; justify-content: center; height: 42px;" onclick="window.filtrarHistorico()">Filtrar</button>';
  h += '  </div>';
  h += '</div>';

  // TABELA
  h += '<div class="form-card animate-in" style="padding: 24px;">';
  h += '  <div class="table-container">';
  h += '    <table class="table">';
  h += '      <thead id="thead-historico"></thead>';
  h += '      <tbody id="tbody-historico"></tbody>';
  h += '    </table>';
  h += '  </div>';
  h += '</div>';

  return h;
}
