import { apiFetch } from '../services/http.js';
import { formatarMoedaBR, formatarDataBR, dataAtualISO } from '../utils/formatters.js';
import { Chart, registerables } from 'chart.js';
import { legacyStringArgument } from '../security/legacyHandlers.js';
import { escapeHtml, setIconMessage } from '../security/safeDom.js';

Chart.register(...registerables);

const API_BASE = '/api/financas';

// Estado
let registros = [];
let resumo = null;
let pessoas = [];
let dividasParceladas = [];
let chartComparativo = null;
let formModo = 'simples'; // 'simples' ou 'parcelada'

// Filtros Atuais
let mesAtual = dataAtualISO().substring(0, 7); // YYYY-MM
let filtroTipo = 'todos';
let filtroStatus = 'todos';
let filtroPessoa = '';

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

export async function initPessoasDividas() {
  document.getElementById('pd-filtro-mes').value = mesAtual;
  await loadPessoas();
  await loadDados();
}

async function loadPessoas() {
  try {
    pessoas = await fetchAPI('/pessoas-dividas/nomes');
    const datalist = document.getElementById('pessoas-list');
    if (datalist) {
      datalist.innerHTML = pessoas.map(p => `<option value="${escapeHtml(p)}">`).join('');
    }
  } catch (err) {
    console.error('Erro ao carregar pessoas:', err);
  }
}

window.filtrarPessoasDividas = async function() {
  mesAtual = document.getElementById('pd-filtro-mes').value;
  filtroTipo = document.getElementById('pd-filtro-tipo').value;
  filtroStatus = document.getElementById('pd-filtro-status').value;
  filtroPessoa = document.getElementById('pd-filtro-pessoa').value;
  await loadDados();
};

async function loadDados() {
  try {
    const query = new URLSearchParams({
      mes: mesAtual,
      tipo: filtroTipo,
      status: filtroStatus,
      pessoa: filtroPessoa
    }).toString();

    const [cData, rData, dpData] = await Promise.all([
      fetchAPI(`/pessoas-dividas?${query}`),
      fetchAPI(`/pessoas-dividas/resumo?mes=${mesAtual}`),
      fetchAPI('/dividas-parceladas')
    ]);
    
    registros = cData;
    resumo = rData;
    dividasParceladas = dpData;

    renderMetrics();
    renderChart();
    renderProximosVencimentos();
    renderTabela();
    renderDividasParceladas();
  } catch (err) {
    showToast('Erro ao carregar dados: ' + err.message, 'error');
  }
}

// ═══════════════════════════════════════
// RENDERS
// ═══════════════════════════════════════

function renderMetrics() {
  if (!resumo) return;
  document.getElementById('metrica-pd-eudevo').textContent = formatarMoedaBR(resumo.euDevoPendenteTotalGeral);
  document.getElementById('metrica-pd-medeve').textContent = formatarMoedaBR(resumo.meDevemPendenteTotalGeral);
  document.getElementById('metrica-pd-paguei').textContent = formatarMoedaBR(resumo.jaPagueiMes);
  document.getElementById('metrica-pd-recebi').textContent = formatarMoedaBR(resumo.jaRecebiMes);
  document.getElementById('metrica-pd-atrasadas').textContent = resumo.pendenciasAtrasadasQtd;
  
  const slEl = document.getElementById('metrica-pd-saldo');
  slEl.textContent = formatarMoedaBR(resumo.saldoLiquido);
  slEl.style.color = resumo.saldoLiquido >= 0 ? 'var(--color-teal)' : 'var(--color-red)';
}

function renderChart() {
  if (!resumo) return;
  
  const canvas = document.getElementById('chart-pd-comparativo');
  if (!canvas) return;

  if (chartComparativo) {
    chartComparativo.destroy();
  }

  chartComparativo = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: ['Eu Devo', 'Me Devem'],
      datasets: [{
        label: 'Valor Pendente (Total)',
        data: [resumo.euDevoPendenteTotalGeral, resumo.meDevemPendenteTotalGeral],
        backgroundColor: ['rgba(239, 68, 68, 0.8)', 'rgba(20, 184, 166, 0.8)'],
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
          ticks: { color: '#e2e8f0', font: { weight: 'bold' } },
          grid: { display: false }
        }
      }
    }
  });
}

function renderProximosVencimentos() {
  const container = document.getElementById('lista-pd-proximos');
  if (!container) return;

  const hojeStr = dataAtualISO();
  const proximaSemana = new Date();
  proximaSemana.setDate(proximaSemana.getDate() + 7);
  const proximaSemanaStr = proximaSemana.toISOString().split('T')[0];

  // Mostra também atrasados
  const proximos = registros.filter(r => 
    r.status === 'pendente' && 
    r.data_combinada <= proximaSemanaStr
  ).sort((a,b) => a.data_combinada.localeCompare(b.data_combinada));

  if (proximos.length === 0) {
    container.innerHTML = '<p style="color: var(--text-muted); font-size: 0.9rem;">Nenhuma pendência para os próximos 7 dias.</p>';
    return;
  }

  let html = '';
  proximos.forEach(r => {
    const d1 = new Date(hojeStr + 'T00:00:00');
    const d2 = new Date(r.data_combinada + 'T00:00:00');
    const diffTime = d2.getTime() - d1.getTime();
    const diasObj = Math.round(diffTime / (1000 * 3600 * 24));
    
    const diasTexto = diasObj === 0 ? 'Hoje!' : (diasObj < 0 ? `Vencida há ${Math.abs(diasObj)}d` : `Em ${diasObj} dias`);
    const corDias = diasObj < 0 ? 'var(--color-red)' : (diasObj === 0 ? 'var(--color-yellow)' : 'var(--text-muted)');
    const tipoTexto = r.tipo === 'eu_devo' ? 'Eu Devo' : 'Me Deve';
    const corValor = r.tipo === 'eu_devo' ? 'var(--color-red)' : 'var(--color-teal)';

    html += `
      <div style="padding: 12px; background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: 8px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div style="font-weight: 600; color: var(--text-primary); font-size: 0.95rem;">${escapeHtml(r.nome_pessoa)}</div>
          <div style="font-size: 0.8rem; color: ${corDias}; font-weight: 500;">${tipoTexto} - ${diasTexto} (${formatarDataBR(r.data_combinada)})</div>
        </div>
        <div style="font-weight: 600; color: ${corValor};">
          ${formatarMoedaBR(r.valor)}
        </div>
      </div>
    `;
  });
  container.innerHTML = html;
}

function renderTabela() {
  const tbody = document.getElementById('tbody-pessoas-dividas');
  if (!tbody) return;

  if (registros.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: var(--text-muted);">Nenhum registro encontrado.</td></tr>';
    return;
  }

  let html = '';
  registros.forEach(r => {
    let badgeColor = 'var(--text-muted)';
    if (r.status === 'pendente') badgeColor = 'var(--color-blue)';
    if (r.status === 'pago') badgeColor = 'var(--color-teal)';
    if (r.status === 'recebido') badgeColor = 'var(--color-teal)';
    if (r.status === 'cancelado') badgeColor = 'var(--text-muted)';

    const tipoBadge = r.tipo === 'eu_devo' 
      ? '<span style="color: var(--color-red); font-weight: 500;">Eu Devo</span>'
      : '<span style="color: var(--color-teal); font-weight: 500;">Me Deve</span>';

    html += `
      <tr>
        <td style="${r.atrasado ? 'color: var(--color-red); font-weight: 600;' : ''}">${formatarDataBR(r.data_combinada)}</td>
        <td style="font-weight: 500; cursor: pointer; color: var(--color-purple);" onclick="window.abrirHistoricoPessoa(${legacyStringArgument(r.nome_pessoa)})" title="Ver Histórico">${escapeHtml(r.nome_pessoa)}</td>
        <td>${tipoBadge}</td>
        <td>${escapeHtml(r.motivo)}</td>
        <td style="font-weight: 600;">${formatarMoedaBR(r.valor)}</td>
        <td>
          <span style="display: inline-flex; align-items: center; gap: 6px; font-size: 0.75rem; padding: 4px 10px; border-radius: 100px; background: var(--bg-surface); border: 1px solid var(--border-subtle); font-weight: 500; text-transform: uppercase;">
            <span style="width: 6px; height: 6px; border-radius: 50%; background: ${badgeColor};"></span>
            ${escapeHtml(r.status)}
          </span>
        </td>
        <td>${r.pago_recebido_em ? formatarDataBR(r.pago_recebido_em.split(' ')[0]) : '-'}</td>
        <td style="font-size: 0.8rem; color: var(--text-muted); max-width: 150px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(r.observacao || '')}">${escapeHtml(r.observacao || '-')}</td>
        <td>
          <div style="display: flex; gap: 8px;">
            ${r.status === 'pendente' ? `<button class="btn-icon" style="color: var(--color-teal);" onclick="window.resolverPD(${legacyStringArgument(r.id)})" title="${r.tipo === 'eu_devo' ? 'Marcar como Pago' : 'Marcar como Recebido'}"><i data-lucide="check"></i></button>` : ''}
            ${r.status !== 'cancelado' ? `<button class="btn-icon" style="color: var(--color-orange);" onclick="window.cancelarPD(${legacyStringArgument(r.id)}, ${legacyStringArgument(r.grupo_parcelas_id || '')})" title="Cancelar Pendência"><i data-lucide="x"></i></button>` : ''}
            <button class="btn-icon" style="color: var(--color-blue);" onclick="window.editarValorPD(${legacyStringArgument(r.id)}, ${r.valor})" title="Editar Valor"><i data-lucide="edit-2"></i></button>
            <button class="btn-icon" style="color: var(--color-red);" onclick="window.excluirPD(${legacyStringArgument(r.id)}, ${legacyStringArgument(r.grupo_parcelas_id || '')})" title="Excluir"><i data-lucide="trash-2"></i></button>
          </div>
        </td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
  lucide.createIcons();
}

function renderDividasParceladas() {
  const container = document.getElementById('dividas-parceladas-container');
  if (!container) return;
  if (!dividasParceladas || dividasParceladas.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted);font-size:0.9rem;">Nenhuma dívida parcelada ativa.</p>';
    return;
  }
  let html = '';
  dividasParceladas.forEach(g => {
    const tipoLabel = g.tipo === 'eu_devo' ? 'Eu Devo' : 'Me Deve';
    const tipoCor = g.tipo === 'eu_devo' ? 'var(--color-rose)' : 'var(--color-teal)';
    const pct = g.total_parcelas > 0 ? Math.round((g.parcelas_pagas / g.total_parcelas) * 100) : 0;
    const [pAno, pMes] = (g.prox_competencia || '').split('-');
    html += `
      <div style="background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:16px;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <div style="font-weight:600;color:var(--text-primary);font-size:1rem;">${escapeHtml(g.nome_pessoa)}</div>
          <span style="font-size:0.75rem;padding:3px 8px;border-radius:100px;background:var(--bg-surface);border:1px solid var(--border-subtle);color:${tipoCor};font-weight:500;">${tipoLabel}</span>
        </div>
        <div style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:8px;">${escapeHtml(g.motivo)}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:8px;">
          <div><span style="font-size:0.75rem;color:var(--text-muted);">Parcelas</span><div style="font-weight:600;font-size:0.9rem;">${g.parcelas_pagas}/${g.total_parcelas}</div></div>
          <div><span style="font-size:0.75rem;color:var(--text-muted);">Mensal</span><div style="font-weight:600;font-size:0.9rem;">${formatarMoedaBR(g.valor_parcela)}</div></div>
          <div><span style="font-size:0.75rem;color:var(--text-muted);">Saldo Rest.</span><div style="font-weight:600;font-size:0.9rem;color:${tipoCor};">${formatarMoedaBR(g.saldo_restante)}</div></div>
        </div>
        <div style="height:4px;background:var(--border-subtle);border-radius:2px;margin-bottom:8px;overflow:hidden;"><div style="height:100%;width:${pct}%;background:var(--color-teal);border-radius:2px;"></div></div>
        <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:10px;">Próxima: <strong>${g.prox_numero}/${g.total_parcelas}</strong> em <strong>${pMes || ''}/${pAno || ''}</strong></div>
        <div style="display:flex;gap:8px;">
          <button style="flex:1;padding:6px 10px;background:var(--color-teal);color:white;font-weight:500;font-size:0.8rem;border-radius:var(--radius-sm);border:none;cursor:pointer;" onclick="window.abrirModalPagarParcelaDivida(${g.id})">Pagar Próxima</button>
          <button class="btn-icon" style="color:var(--color-blue);" onclick="window.editarValorPD('dp_${g.id}', ${g.valor_parcela})" title="Editar Valor da Parcela"><i data-lucide="edit-2" style="width:14px;height:14px;"></i></button>
          <button class="btn-icon" onclick="window.verParcelasDivida(${g.id})" title="Ver Parcelas"><i data-lucide="list" style="width:14px;height:14px;"></i></button>
          <button class="btn-icon" style="color:var(--color-rose);" onclick="window.excluirDividaParcelada(${g.id})" title="Excluir"><i data-lucide="trash-2" style="width:14px;height:14px;"></i></button>
        </div>
      </div>`;
  });
  container.innerHTML = html;
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ═══════════════════════════════════════
// FORM TOGGLE
// ═══════════════════════════════════════

window.setFormModoPD = function(modo) {
  formModo = modo;
  document.getElementById('pd-form-simples').style.display = modo === 'simples' ? 'block' : 'none';
  document.getElementById('pd-form-parcelada').style.display = modo === 'parcelada' ? 'block' : 'none';
  document.querySelectorAll('.pd-modo-btn').forEach(btn => {
    btn.style.background = btn.dataset.modo === modo ? 'var(--color-teal)' : 'var(--bg-surface)';
    btn.style.color = btn.dataset.modo === modo ? 'white' : 'var(--text-secondary)';
  });
};

window.calcResumoParcelada = function() {
  const vp = parseFloat(document.getElementById('form-dp-valor-parcela').value) || 0;
  const tp = parseInt(document.getElementById('form-dp-total-parcelas').value) || 0;
  const pp = parseInt(document.getElementById('form-dp-parcelas-pagas').value) || 0;
  const rest = Math.max(0, tp - pp);
  document.getElementById('form-dp-restantes').value = rest;
  
  const ref = document.getElementById('form-dp-comp-ref').value;
  let pMes = '', pAno = '', proxNum = '';
  if (ref && tp > 0) {
    const [aStr, mStr] = ref.split('-');
    const d = new Date(Number(aStr), Number(mStr) - 1, 1);
    if (pp > 0) {
      d.setMonth(d.getMonth() + 1); // a próxima é 1 mês depois da última paga
      proxNum = pp + 1;
    } else {
      proxNum = 1; // a primeira é a própria informada
    }
    pMes = String(d.getMonth() + 1).padStart(2, '0');
    pAno = d.getFullYear();
  }

  const resumoEl = document.getElementById('dp-resumo-preview');
  if (resumoEl && vp > 0 && tp > 0) {
    const nome = document.getElementById('form-dp-nome').value || '---';
    resumoEl.innerHTML = `<div style="background:var(--bg-surface);padding:12px;border-radius:8px;border:1px solid var(--border-subtle);font-size:0.85rem;">
      <strong>${nome}</strong><br>${pp}/${tp} pagas · ${rest} restantes<br>Mensal: ${formatarMoedaBR(vp)}<br>Total restante: <strong>${formatarMoedaBR(rest * vp)}</strong><br>
      <span style="color:var(--color-teal);font-weight:600;">Próxima: ${proxNum}/${tp} em ${pMes}/${pAno}</span>
      </div>`;
  }
};

window.salvarDividaParcelada = async function() {
  const nome_pessoa = document.getElementById('form-dp-nome').value.trim();
  const motivo = document.getElementById('form-dp-motivo').value.trim();
  const valor_parcela = parseFloat(document.getElementById('form-dp-valor-parcela').value);
  const total_parcelas = parseInt(document.getElementById('form-dp-total-parcelas').value);
  const parcelas_pagas = parseInt(document.getElementById('form-dp-parcelas-pagas').value) || 0;
  const ref = document.getElementById('form-dp-comp-ref').value;
  
  if (!nome_pessoa || !motivo || isNaN(valor_parcela) || isNaN(total_parcelas) || !ref) {
    showToast('Preencha os campos obrigatórios corretamente!', 'error'); return;
  }

  // Calcular competencia_inicio baseada na ref
  const [aStr, mStr] = ref.split('-');
  const d = new Date(Number(aStr), Number(mStr) - 1, 1);
  if (parcelas_pagas > 0) {
    d.setMonth(d.getMonth() - (parcelas_pagas - 1));
  }
  const competencia_inicio = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');

  const dados = {
    nome_pessoa,
    tipo: document.getElementById('form-dp-tipo').value,
    motivo,
    valor_parcela,
    valor_total_original: parseFloat(document.getElementById('form-dp-valor-total').value) || 0,
    total_parcelas,
    parcelas_pagas,
    dia_vencimento: parseInt(document.getElementById('form-dp-dia-venc').value) || 5,
    competencia_inicio,
    observacao: document.getElementById('form-dp-obs').value.trim()
  };
  
  try {
    await fetchAPI('/dividas-parceladas', { method: 'POST', body: JSON.stringify(dados) });
    showToast('Dívida parcelada cadastrada com sucesso!');
    document.getElementById('form-dp-nome').value = '';
    document.getElementById('form-dp-motivo').value = '';
    document.getElementById('form-dp-valor-parcela').value = '';
    document.getElementById('form-dp-valor-total').value = '';
    document.getElementById('form-dp-total-parcelas').value = '';
    document.getElementById('form-dp-parcelas-pagas').value = '0';
    document.getElementById('form-dp-obs').value = '';
    document.getElementById('dp-resumo-preview').innerHTML = '';
    await loadPessoas(); await loadDados();
  } catch (err) { showToast('Erro: ' + err.message, 'error'); }
};

window.abrirModalPagarParcelaDivida = function(id) {
  const g = dividasParceladas.find(d => d.id === id);
  if (!g) return;
  const [pAno, pMes] = (g.prox_competencia || '').split('-');
  document.getElementById('modal-pagar-dp-id').value = id;
  document.getElementById('modal-pagar-dp-info').innerHTML = `
    <p style="margin-bottom:8px;"><strong>${g.nome_pessoa}</strong> — ${g.motivo}</p>
    <p style="margin-bottom:8px;">Parcela <strong>${g.prox_numero}/${g.total_parcelas}</strong></p>
    <p style="margin-bottom:8px;">Competência: <strong>${pMes || ''}/${pAno || ''}</strong></p>
    <p style="font-size:1.2rem;font-weight:700;color:var(--color-teal);">Valor: ${formatarMoedaBR(g.valor_parcela)}</p>`;
  document.getElementById('modal-pagar-dp').style.display = 'flex';
};

window.confirmarPagarParcelaDivida = async function() {
  const id = document.getElementById('modal-pagar-dp-id').value;
  try {
    const res = await fetchAPI(`/dividas-parceladas/${id}/pagar`, { method: 'POST' });
    showToast(`Parcela ${res.parcela_paga}/${res.total_parcelas} paga!`);
    document.getElementById('modal-pagar-dp').style.display = 'none';
    await loadDados();
  } catch (err) { showToast('Erro: ' + err.message, 'error'); }
};

window.verParcelasDivida = async function(id) {
  try {
    const data = await fetchAPI(`/dividas-parceladas/${id}`);
    const modal = document.getElementById('modal-ver-parcelas-dp');
    document.getElementById('modal-ver-parcelas-dp-titulo').textContent = `${data.nome_pessoa} — ${data.motivo}`;
    let html = '<div style="max-height:400px;overflow-y:auto;"><table class="table"><thead><tr><th>#</th><th>Comp.</th><th>Valor</th><th>Status</th></tr></thead><tbody>';
    data.parcelas_lista.forEach(p => {
      const cor = p.status === 'paga' ? 'var(--color-teal)' : 'var(--color-blue)';
      const [a,m] = p.competencia.split('-');
      html += `<tr><td>${p.numero}/${p.total}</td><td>${m}/${a}</td><td>${formatarMoedaBR(p.valor)}</td><td><span style="display:inline-flex;align-items:center;gap:4px;font-size:0.75rem;padding:2px 8px;border-radius:100px;background:var(--bg-surface);border:1px solid var(--border-subtle);"><span style="width:6px;height:6px;border-radius:50%;background:${cor};"></span>${p.status}</span></td></tr>`;
    });
    html += '</tbody></table></div>';
    document.getElementById('modal-ver-parcelas-dp-body').innerHTML = html;
    modal.style.display = 'flex';
  } catch (err) { showToast('Erro: ' + err.message, 'error'); }
};

window.excluirDividaParcelada = async function(id) {
  if (!confirm('Deseja realmente EXCLUIR esta dívida parcelada? Isso não pode ser desfeito.')) return;
  try {
    await fetchAPI(`/dividas-parceladas/${id}`, { method: 'DELETE' });
    showToast('Dívida parcelada excluída!');
    await loadDados();
  } catch (err) { showToast('Erro: ' + err.message, 'error'); }
};

// ═══════════════════════════════════════
// ACTIONS (originais)
// ═══════════════════════════════════════

window.salvarPessoaDivida = async function() {
  const nome_pessoa = document.getElementById('form-pd-nome').value.trim();
  const tipo = document.getElementById('form-pd-tipo').value;
  const valor = parseFloat(document.getElementById('form-pd-valor').value);
  const motivo = document.getElementById('form-pd-motivo').value.trim();
  const data_combinada = document.getElementById('form-pd-data').value;
  const observacao = document.getElementById('form-pd-obs').value.trim();
  const parcelas = parseInt(document.getElementById('form-pd-parcelas').value) || 1;
  const frequencia = document.getElementById('form-pd-frequencia').value;

  if (!nome_pessoa || !tipo || isNaN(valor) || valor <= 0 || !motivo || !data_combinada) {
    showToast('Preencha os campos obrigatórios corretamente!', 'error');
    return;
  }

  try {
    const btn = document.getElementById('btn-salvar-pd');
    btn.disabled = true;
    btn.innerHTML = 'Salvando...';

    await fetchAPI('/pessoas-dividas', {
      method: 'POST',
      body: JSON.stringify({ nome_pessoa, tipo, valor, motivo, data_combinada, observacao, parcelas, frequencia })
    });
    
    showToast('Pendência adicionada com sucesso!');
    
    // Limpar form
    document.getElementById('form-pd-nome').value = '';
    document.getElementById('form-pd-valor').value = '';
    document.getElementById('form-pd-motivo').value = '';
    document.getElementById('form-pd-obs').value = '';

    await loadPessoas();
    await loadDados();
  } catch (err) {
    showToast('Erro ao salvar: ' + err.message, 'error');
  } finally {
    const btn = document.getElementById('btn-salvar-pd');
    btn.disabled = false;
    btn.innerHTML = 'Adicionar Pendência';
  }
};

window.resolverPD = async function(id) {
  const isParcela = String(id).startsWith('dp_');
  const confirmMsg = isParcela
    ? 'Deseja pagar a próxima parcela desta dívida parcelada?'
    : 'Deseja realmente marcar esta pendência como resolvida (paga/recebida)?';
  if (!confirm(confirmMsg)) return;
  try {
    await fetchAPI(`/pessoas-dividas/${id}/resolver`, { method: 'POST' });
    showToast(isParcela ? 'Parcela paga com sucesso!' : 'Pendência resolvida com sucesso!');
    loadDados();
  } catch (err) {
    showToast('Erro ao resolver: ' + err.message, 'error');
  }
};

window.cancelarPD = async function(id, grupoId) {
  const isParcela = String(id).startsWith('dp_');

  if (isParcela) {
    // Para parcelas virtuais de dívidas parceladas, o cancelamento exclui o grupo inteiro
    if (!confirm('Esta é uma parcela de uma dívida parcelada. Isso cancelará o grupo inteiro. Deseja continuar?')) return;
    try {
      await fetchAPI(`/pessoas-dividas/${id}/cancelar`, { method: 'POST', body: JSON.stringify({ todasParcelas: true }) });
      showToast('Dívida parcelada cancelada!');
      loadDados();
    } catch (err) {
      showToast('Erro ao cancelar: ' + err.message, 'error');
    }
    return;
  }

  let todasParcelas = false;
  if (grupoId && grupoId !== 'null' && !grupoId.startsWith('dp_')) {
    todasParcelas = confirm('Esta dívida faz parte de um parcelamento. Deseja CANCELAR TODAS as parcelas vinculadas? (OK = Todas, Cancelar = Apenas esta)');
  } else {
    if (!confirm('Deseja realmente CANCELAR esta pendência? Ela continuará no histórico.')) return;
  }
  try {
    await fetchAPI(`/pessoas-dividas/${id}/cancelar`, { 
      method: 'POST',
      body: JSON.stringify({ todasParcelas })
    });
    showToast('Pendência cancelada!');
    loadDados();
  } catch (err) {
    showToast('Erro ao cancelar: ' + err.message, 'error');
  }
};

window.excluirPD = async function(id, grupoId) {
  const isParcela = String(id).startsWith('dp_');

  if (isParcela) {
    if (!confirm('Esta é uma parcela de uma dívida parcelada. Isso excluirá o grupo inteiro permanentemente. Deseja continuar?')) return;
    try {
      await fetchAPI(`/pessoas-dividas/${id}?todasParcelas=true`, { method: 'DELETE' });
      showToast('Dívida parcelada excluída!');
      loadDados();
    } catch (err) {
      showToast('Erro ao excluir: ' + err.message, 'error');
    }
    return;
  }

  let todasParcelas = false;
  if (grupoId && grupoId !== 'null' && !grupoId.startsWith('dp_')) {
    todasParcelas = confirm('Esta dívida faz parte de um parcelamento. Deseja EXCLUIR TODAS as parcelas do banco de dados? (OK = Todas, Cancelar = Apenas esta)');
    if (!todasParcelas && !confirm('Tem certeza que deseja excluir apenas esta parcela?')) return;
  } else {
    if (!confirm('ATENÇÃO: Deseja realmente EXCLUIR fisicamente esta pendência do banco de dados? A ação recomendada é Cancelar.')) return;
  }
  
  try {
    await fetchAPI(`/pessoas-dividas/${id}?todasParcelas=${todasParcelas}`, { method: 'DELETE' });
    showToast('Pendência excluída!');
    loadDados();
  } catch (err) {
    showToast('Erro ao excluir: ' + err.message, 'error');
  }
};

window.editarValorPD = function(id, valorAtual) {
  document.getElementById('modal-editar-valor-id').value = id;
  document.getElementById('modal-editar-valor-input').value = valorAtual;
  document.getElementById('modal-editar-valor-pd').style.display = 'flex';
};

window.confirmarEditarValorPD = async function() {
  const id = document.getElementById('modal-editar-valor-id').value;
  const valor = parseFloat(document.getElementById('modal-editar-valor-input').value);

  if (isNaN(valor) || valor <= 0) {
    showToast('Por favor, informe um valor válido maior que zero.', 'error');
    return;
  }

  try {
    await fetchAPI(`/pessoas-dividas/${id}/valor`, {
      method: 'PUT',
      body: JSON.stringify({ valor })
    });
    showToast('Valor atualizado com sucesso!');
    document.getElementById('modal-editar-valor-pd').style.display = 'none';
    await loadDados();
  } catch (err) {
    showToast('Erro ao atualizar valor: ' + err.message, 'error');
  }
};


// ═══════════════════════════════════════
// MODAL HISTÓRICO
// ═══════════════════════════════════════

window.abrirHistoricoPessoa = async function(nome) {
  const modal = document.getElementById('modal-historico-pd');
  const conteudo = document.getElementById('modal-historico-pd-body');
  
  try {
    conteudo.innerHTML = '<p style="color: var(--text-muted);">Carregando...</p>';
    modal.style.display = 'flex';
    
    const data = await fetchAPI(`/pessoas-dividas/historico/${encodeURIComponent(nome)}`);
    const { resumo, registros } = data;
    
    let html = `<h2 style="margin-bottom: 16px; color: var(--text-primary);">Histórico: ${nome}</h2>`;
    
    // Cards Resumo Modal
    html += `
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px;">
        <div style="background: var(--bg-surface); padding: 12px; border-radius: 8px; border: 1px solid var(--border-subtle);">
          <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 4px;">Eu Devo</div>
          <div style="font-weight: 600; color: var(--color-red); font-size: 1.1rem;">${formatarMoedaBR(resumo.euDevo)}</div>
        </div>
        <div style="background: var(--bg-surface); padding: 12px; border-radius: 8px; border: 1px solid var(--border-subtle);">
          <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 4px;">Me Deve</div>
          <div style="font-weight: 600; color: var(--color-teal); font-size: 1.1rem;">${formatarMoedaBR(resumo.meDeve)}</div>
        </div>
        <div style="background: var(--bg-surface); padding: 12px; border-radius: 8px; border: 1px solid var(--border-subtle);">
          <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 4px;">Saldo Líquido</div>
          <div style="font-weight: 600; color: ${resumo.saldo >= 0 ? 'var(--color-teal)' : 'var(--color-red)'}; font-size: 1.1rem;">${formatarMoedaBR(resumo.saldo)}</div>
        </div>
        <div style="background: var(--bg-surface); padding: 12px; border-radius: 8px; border: 1px solid var(--border-subtle);">
          <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 4px;">Pendências</div>
          <div style="font-weight: 600; color: var(--text-primary); font-size: 1.1rem;">${resumo.abertas} abertas</div>
        </div>
      </div>
    `;

    // Tabela Modal
    html += `
      <div class="table-container" style="max-height: 400px; overflow-y: auto;">
        <table class="table">
          <thead><tr><th>Data</th><th>Tipo</th><th>Motivo</th><th>Valor</th><th>Status</th></tr></thead>
          <tbody>
            ${registros.map(r => `
              <tr>
                <td>${formatarDataBR(r.data_combinada)}</td>
                <td><span style="color: ${r.tipo === 'eu_devo' ? 'var(--color-red)' : 'var(--color-teal)'};">${r.tipo === 'eu_devo' ? 'Eu Devo' : 'Me Deve'}</span></td>
                <td>${r.motivo}</td>
                <td style="font-weight: 600;">${formatarMoedaBR(r.valor)}</td>
                <td><span style="font-size: 0.75rem; text-transform: uppercase; padding: 2px 6px; border-radius: 4px; background: var(--border-subtle);">${r.status}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    conteudo.innerHTML = html;
  } catch (err) {
    conteudo.innerHTML = `<p style="color: var(--color-red);">Erro ao carregar histórico: ${err.message}</p>`;
  }
};

window.fecharModalHistoricoPD = function() {
  document.getElementById('modal-historico-pd').style.display = 'none';
};

// ═══════════════════════════════════════
// ESTRUTURA HTML
// ═══════════════════════════════════════

export function renderPessoasDividasPage() {


  let h = '';
  
  // Datalist para autocomplete de pessoas
  h += '<datalist id="pessoas-list"></datalist>';

  // TOAST CONTAINER
  h += '<div id="toast-container" class="toast-container"></div>';

  // MODAL HISTÓRICO
  h += `
    <div id="modal-historico-pd" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 1000; justify-content: center; align-items: center;">
      <div style="background: var(--bg-panel); padding: 24px; border-radius: 12px; width: 90%; max-width: 700px; border: 1px solid var(--border-subtle); box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
        <div style="display: flex; justify-content: flex-end; margin-bottom: -20px;">
          <button class="btn-icon" onclick="window.fecharModalHistoricoPD()" style="position: relative; z-index: 2;"><i data-lucide="x"></i></button>
        </div>
        <div id="modal-historico-pd-body"></div>
      </div>
    </div>
  `;

  // MODAL EDITAR VALOR
  h += `
    <div id="modal-editar-valor-pd" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 1000; justify-content: center; align-items: center;">
      <div style="background: var(--bg-panel); padding: 24px; border-radius: 12px; width: 90%; max-width: 420px; border: 1px solid var(--border-subtle); box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
        <h3 style="font-weight: 600; color: var(--text-primary); margin-bottom: 16px; font-size: 1.2rem;">Editar Valor</h3>
        <input type="hidden" id="modal-editar-valor-id">
        <div class="form-group" style="margin-bottom: 20px;">
          <label class="form-label" style="display: block; margin-bottom: 8px;">Novo Valor (R$)*</label>
          <input type="number" id="modal-editar-valor-input" class="form-control" step="0.01" placeholder="0,00" style="width: 100%;">
        </div>
        <div style="display: flex; gap: 12px;">
          <button class="btn-secondary" style="flex: 1; justify-content: center; height: 38px;" onclick="document.getElementById('modal-editar-valor-pd').style.display='none'">Cancelar</button>
          <button class="btn-primary" style="flex: 1; justify-content: center; height: 38px; background: var(--color-teal); border: none;" onclick="window.confirmarEditarValorPD()">Confirmar</button>
        </div>
      </div>
    </div>
  `;

  // HEADER
  h += '<div class="page-header animate-in">';
  h += '  <h1 class="page-header__title">Pessoas / Dívidas</h1>';
  h += '  <p class="page-header__subtitle">Controle quem você precisa pagar, quem precisa te pagar e acompanhe pendências pessoais.</p>';
  h += '</div>';

  // METRICS GRID (6 cards)
  h += '<div class="metrics-grid animate-in" style="grid-template-columns: repeat(6, 1fr); gap: 16px;">';
  h += '  <div class="metric-card">';
  h += '    <div class="metric-card__header"><div class="metric-card__label-top">Eu Devo (Geral)</div></div>';
  h += '    <div class="metric-card__body"><div class="metric-card__value" id="metrica-pd-eudevo" style="color: var(--color-red);">R$ 0,00</div></div>';
  h += '  </div>';
  h += '  <div class="metric-card">';
  h += '    <div class="metric-card__header"><div class="metric-card__label-top">Me Devem (Geral)</div></div>';
  h += '    <div class="metric-card__body"><div class="metric-card__value" id="metrica-pd-medeve" style="color: var(--color-teal);">R$ 0,00</div></div>';
  h += '  </div>';
  h += '  <div class="metric-card">';
  h += '    <div class="metric-card__header"><div class="metric-card__label-top">Já Paguei (Mês)</div></div>';
  h += '    <div class="metric-card__body"><div class="metric-card__value" id="metrica-pd-paguei" style="color: var(--color-blue);">R$ 0,00</div></div>';
  h += '  </div>';
  h += '  <div class="metric-card">';
  h += '    <div class="metric-card__header"><div class="metric-card__label-top">Já Recebi (Mês)</div></div>';
  h += '    <div class="metric-card__body"><div class="metric-card__value" id="metrica-pd-recebi" style="color: var(--color-blue);">R$ 0,00</div></div>';
  h += '  </div>';
  h += '  <div class="metric-card">';
  h += '    <div class="metric-card__header"><div class="metric-card__label-top">Atrasadas</div></div>';
  h += '    <div class="metric-card__body"><div class="metric-card__value" id="metrica-pd-atrasadas" style="font-size: 1.6rem; color: var(--color-yellow);">0</div></div>';
  h += '  </div>';
  h += '  <div class="metric-card">';
  h += '    <div class="metric-card__header"><div class="metric-card__label-top">Saldo Líquido (Geral)</div></div>';
  h += '    <div class="metric-card__body"><div class="metric-card__value" id="metrica-pd-saldo">R$ 0,00</div></div>';
  h += '  </div>';
  h += '</div>';

  // MAIN LAYOUT
  h += '<div class="dashboard-grid animate-in" style="grid-template-columns: 350px 1fr; gap: 24px; margin-bottom: 32px;">';
  
  // ESQUERDA: FORMULÁRIO E PRÓXIMOS VENCIMENTOS E GRÁFICO
  h += '  <div style="display: flex; flex-direction: column; gap: 24px;">';
  
  // Card Nova Pendência (com toggle)
  h += '    <div class="form-card" style="padding: 24px;">';
  h += '      <h3 style="font-weight:600;color:var(--text-primary);margin-bottom:16px;">Nova Pendência</h3>';
  h += '      <div style="display:flex;gap:8px;margin-bottom:20px;">';
  h += '        <button class="pd-modo-btn" data-modo="simples" style="flex:1;padding:8px;border:none;border-radius:var(--radius-sm);font-size:0.85rem;font-weight:500;cursor:pointer;background:var(--color-teal);color:white;" onclick="window.setFormModoPD(\'simples\')">Pendência Simples</button>';
  h += '        <button class="pd-modo-btn" data-modo="parcelada" style="flex:1;padding:8px;border:none;border-radius:var(--radius-sm);font-size:0.85rem;font-weight:500;cursor:pointer;background:var(--bg-surface);color:var(--text-secondary);" onclick="window.setFormModoPD(\'parcelada\')">Dívida Parcelada</button>';
  h += '      </div>';

  // FORM SIMPLES
  h += '      <div id="pd-form-simples">';
  h += '        <div class="form-group" style="margin-bottom:12px;"><label class="form-label">Pessoa*</label><input type="text" id="form-pd-nome" class="form-control" list="pessoas-list" placeholder="Ex: João"></div>';
  h += '        <div class="form-group" style="margin-bottom:12px;"><label class="form-label">Tipo*</label><select id="form-pd-tipo" class="form-control"><option value="eu_devo">Eu Devo</option><option value="me_deve">Me Deve</option></select></div>';
  h += '        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">';
  h += '          <div class="form-group"><label class="form-label">Valor*</label><input type="number" id="form-pd-valor" class="form-control" step="0.01" placeholder="0,00"></div>';
  h += '          <div class="form-group"><label class="form-label">Data*</label><input type="date" id="form-pd-data" class="form-control" value="'+dataAtualISO()+'"></div>';
  h += '        </div>';
  h += '        <div class="form-group" style="margin-bottom:12px;"><label class="form-label">Motivo*</label><input type="text" id="form-pd-motivo" class="form-control" placeholder="Empréstimo, Pix..."></div>';
  h += '        <input type="hidden" id="form-pd-parcelas" value="1"><input type="hidden" id="form-pd-frequencia" value="mensal">';
  h += '        <div class="form-group" style="margin-bottom:16px;"><label class="form-label">Observação</label><input type="text" id="form-pd-obs" class="form-control" placeholder="Opcional..."></div>';
  h += '        <button id="btn-salvar-pd" class="btn-primary" style="width:100%;justify-content:center;" onclick="window.salvarPessoaDivida()">Adicionar Pendência</button>';
  h += '      </div>';

  // FORM PARCELADA
  const compAtual = dataAtualISO().substring(0, 7);
  h += '      <div id="pd-form-parcelada" style="display:none;">';
  h += '        <div class="form-group" style="margin-bottom:12px;"><label class="form-label">Pessoa*</label><input type="text" id="form-dp-nome" class="form-control" list="pessoas-list" placeholder="Ex: Mãe" oninput="window.calcResumoParcelada()"></div>';
  h += '        <div class="form-group" style="margin-bottom:12px;"><label class="form-label">Tipo*</label><select id="form-dp-tipo" class="form-control"><option value="eu_devo">Eu Devo</option><option value="me_deve">Me Deve</option></select></div>';
  h += '        <div class="form-group" style="margin-bottom:12px;"><label class="form-label">Motivo*</label><input type="text" id="form-dp-motivo" class="form-control" placeholder="Ex: Empréstimo"></div>';
  h += '        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">';
  h += '          <div class="form-group"><label class="form-label">Valor da Parcela*</label><input type="number" id="form-dp-valor-parcela" class="form-control" step="0.01" placeholder="126,21" oninput="window.calcResumoParcelada()"></div>';
  h += '          <div class="form-group"><label class="form-label">Valor Total Original</label><input type="number" id="form-dp-valor-total" class="form-control" step="0.01" placeholder="12.116,16"></div>';
  h += '        </div>';
  h += '        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px;">';
  h += '          <div class="form-group"><label class="form-label">Total Parcelas*</label><input type="number" id="form-dp-total-parcelas" class="form-control" min="2" placeholder="96" oninput="window.calcResumoParcelada()"></div>';
  h += '          <div class="form-group"><label class="form-label">Já Pagas</label><input type="number" id="form-dp-parcelas-pagas" class="form-control" min="0" value="0" oninput="window.calcResumoParcelada()"></div>';
  h += '          <div class="form-group"><label class="form-label">Restantes</label><input type="number" id="form-dp-restantes" class="form-control" disabled></div>';
  h += '        </div>';
  h += '        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">';
  h += '          <div class="form-group"><label class="form-label" title="Se já pagou alguma, informe o mês da última paga. Se não pagou nenhuma, informe o mês da primeira.">Competência de Referência* ℹ️</label><input type="month" id="form-dp-comp-ref" class="form-control" value="'+compAtual+'" onchange="window.calcResumoParcelada()"></div>';
  h += '          <div class="form-group"><label class="form-label">Dia Vencimento</label><input type="number" id="form-dp-dia-venc" class="form-control" min="1" max="31" value="5"></div>';
  h += '        </div>';
  h += '        <div class="form-group" style="margin-bottom:12px;"><label class="form-label">Observação</label><input type="text" id="form-dp-obs" class="form-control" placeholder="Opcional..."></div>';
  h += '        <div id="dp-resumo-preview" style="margin-bottom:16px;"></div>';
  h += '        <button class="btn-primary" style="width:100%;justify-content:center;" onclick="window.salvarDividaParcelada()">Cadastrar Dívida Parcelada</button>';
  h += '      </div>';
  h += '    </div>';

  // Card Próximas Pendências
  h += '    <div class="form-card" style="padding: 24px;">';
  h += '      <h3 style="font-weight: 600; color: var(--text-primary); margin-bottom: 16px; font-size: 1.1rem;">Próximas Pendências</h3>';
  h += '      <div id="lista-pd-proximos"></div>';
  h += '    </div>';
  
  // Card Gráfico Comparativo
  h += '    <div class="form-card" style="padding: 24px;">';
  h += '      <h3 style="font-weight: 600; color: var(--text-primary); margin-bottom: 16px; font-size: 1.1rem;">Balanço Pendente</h3>';
  h += '      <div style="height: 180px; width: 100%; position: relative;">';
  h += '        <canvas id="chart-pd-comparativo"></canvas>';
  h += '      </div>';
  h += '    </div>';

  h += '  </div>'; // fim esquerda

  // DIREITA: FILTROS E TABELA
  h += '  <div style="display: flex; flex-direction: column; gap: 24px;">';
  
  // Filtros
  h += '    <div class="form-card" style="padding: 16px; display: flex; gap: 16px; flex-wrap: wrap; align-items: flex-end;">';
  h += '      <div class="form-group" style="flex: 1; min-width: 130px;">';
  h += '        <label class="form-label">Período</label>';
  h += '        <input type="month" id="pd-filtro-mes" class="form-control">';
  h += '      </div>';
  h += '      <div class="form-group" style="flex: 1; min-width: 130px;">';
  h += '        <label class="form-label">Pessoa</label>';
  h += '        <input type="text" id="pd-filtro-pessoa" class="form-control" list="pessoas-list" placeholder="Todas as pessoas">';
  h += '      </div>';
  h += '      <div class="form-group" style="flex: 1; min-width: 130px;">';
  h += '        <label class="form-label">Tipo</label>';
  h += '        <select id="pd-filtro-tipo" class="form-control">';
  h += '          <option value="todos">Todos</option>';
  h += '          <option value="eu_devo">Eu Devo</option>';
  h += '          <option value="me_deve">Me Deve</option>';
  h += '        </select>';
  h += '      </div>';
  h += '      <div class="form-group" style="flex: 1; min-width: 130px;">';
  h += '        <label class="form-label">Status</label>';
  h += '        <select id="pd-filtro-status" class="form-control">';
  h += '          <option value="todos">Todos</option>';
  h += '          <option value="pendente">Pendente</option>';
  h += '          <option value="pago">Pago</option>';
  h += '          <option value="recebido">Recebido</option>';
  h += '          <option value="cancelado">Cancelado</option>';
  h += '        </select>';
  h += '      </div>';
  h += '      <div class="form-group" style="width: 100px;">';
  h += '        <button class="btn-primary" style="width: 100%; justify-content: center; height: 42px;" onclick="window.filtrarPessoasDividas()">Filtrar</button>';
  h += '      </div>';
  h += '    </div>';

  // Card Tabela
  h += '    <div class="form-card" style="padding: 24px; flex: 1;">';
  h += '      <h3 style="font-weight: 600; color: var(--text-primary); margin-bottom: 16px;">Pendências do Período</h3>';
  h += '      <div class="table-container">';
  h += '        <table class="table">';
  h += '          <thead><tr><th>Data C.</th><th>Pessoa</th><th>Tipo</th><th>Motivo</th><th>Valor</th><th>Status</th><th>Resolvido Em</th><th>Obs</th><th>Ações</th></tr></thead>';
  h += '          <tbody id="tbody-pessoas-dividas"></tbody>';
  h += '        </table>';
  h += '      </div>';
  h += '    </div>';

  h += '  </div>'; // fim direita
  h += '</div>';

  // SEÇÃO DÍVIDAS PARCELADAS ATIVAS
  h += '<div class="form-card animate-in" style="padding:24px;margin-bottom:32px;">';
  h += '  <h3 style="font-weight:600;color:var(--text-primary);margin-bottom:16px;">Dívidas Parceladas Ativas</h3>';
  h += '  <div id="dividas-parceladas-container"></div>';
  h += '</div>';

  // Modal Pagar Parcela
  h += `<div id="modal-pagar-dp" style="display:none;position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,0.8);align-items:center;justify-content:center;">
    <div class="form-card" style="width:100%;max-width:420px;padding:32px;background:var(--bg-main);">
      <h3 style="font-weight:600;color:var(--text-primary);margin-bottom:16px;">Confirmar Pagamento</h3>
      <input type="hidden" id="modal-pagar-dp-id">
      <div id="modal-pagar-dp-info" style="margin-bottom:20px;"></div>
      <div style="display:flex;gap:12px;">
        <button class="btn-secondary" style="flex:1;justify-content:center;" onclick="document.getElementById('modal-pagar-dp').style.display='none'">Cancelar</button>
        <button style="flex:1;display:inline-flex;align-items:center;justify-content:center;padding:12px;background:var(--color-teal);color:white;font-weight:600;font-size:0.9rem;border-radius:var(--radius-sm);border:none;cursor:pointer;" onclick="window.confirmarPagarParcelaDivida()">Confirmar</button>
      </div>
    </div>
  </div>`;

  // Modal Ver Parcelas
  h += `<div id="modal-ver-parcelas-dp" style="display:none;position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,0.8);align-items:center;justify-content:center;">
    <div class="form-card" style="width:100%;max-width:500px;padding:32px;background:var(--bg-main);max-height:90vh;overflow-y:auto;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <h3 id="modal-ver-parcelas-dp-titulo" style="font-weight:600;color:var(--text-primary);">Parcelas</h3>
        <button class="btn-icon" onclick="document.getElementById('modal-ver-parcelas-dp').style.display='none'"><i data-lucide="x"></i></button>
      </div>
      <div id="modal-ver-parcelas-dp-body"></div>
    </div>
  </div>`;

  return h;
}
