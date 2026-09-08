import { apiFetch } from '../services/http.js';
import { escapeHtml, setIconMessage } from '../security/safeDom.js';
import { formatarMoedaBR, formatarDataBR, dataAtualISO } from '../utils/formatters.js';

const API_BASE = '/api/financas';
const safeColor = (value, fallback) => /^#[0-9a-f]{6}$/i.test(String(value ?? '')) ? value : fallback;

// Estado
let cartoes = [];
let faturas = [];
let faturasResumo = null;
let parcelasRecentes = [];
let categorias = [];
let comprasParceladas = [];

// Filtros
let filtroCartaoFatura = '';
let filtroStatusFatura = '';
let filtroPeriodoFatura = 'proximas_3';
let filtroCartaoCompra = 'todos';

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

export async function initCartoes() {
  try {
    const [cData, frData, fData, pData, catData, cpData] = await Promise.all([
      fetchAPI('/cartoes'),
      fetchAPI('/cartoes/faturas/resumo'),
      fetchAPI('/cartoes/faturas'),
      fetchAPI('/cartoes/parcelas/recentes'),
      fetchAPI('/categorias'),
      fetchAPI('/cartoes/compras-parceladas')
    ]);
    
    cartoes = cData;
    faturasResumo = frData;
    faturas = fData;
    parcelasRecentes = pData;
    categorias = catData.filter(c => c.tipo === 'gasto' || c.tipo === 'ambos');
    comprasParceladas = cpData;

    renderMetrics();
    renderListaCartoes();
    renderFormSelects();
    renderFaturas();
    renderComprasParceladas();
  } catch (error) {
    showToast('Erro ao carregar dados: ' + error.message, 'error');
  }
}

// ═══════════════════════════════════════
// RENDERS
// ═══════════════════════════════════════

function renderMetrics() {
  if (!faturasResumo) return;
  document.getElementById('metrica-fatura-atual').textContent = formatarMoedaBR(faturasResumo.faturaAtual);
  document.getElementById('metrica-faturas-proximas').textContent = formatarMoedaBR(faturasResumo.faturasProximas);
  document.getElementById('metrica-total-aberto').textContent = formatarMoedaBR(faturasResumo.totalAberto);
  document.getElementById('metrica-limite-usado').textContent = formatarMoedaBR(faturasResumo.limiteUsado);
  
  const proxEl = document.getElementById('metrica-prox-vencimento');
  if (faturasResumo.proximoVencimento && faturasResumo.proximoVencimento.vencimento) {
    const pv = faturasResumo.proximoVencimento;
    const cartaoProx = cartoes.find(c => c.nome === pv.cartao_nome);
    const corProx = safeColor(cartaoProx?.cor, 'var(--text-secondary)');
    proxEl.innerHTML = `<span style="font-size:0.85rem;font-weight:600;color:${corProx};display:block;margin-bottom:4px;">${escapeHtml(pv.cartao_nome)}</span><span style="font-size:1.3rem;">${formatarDataBR(pv.vencimento)}</span><span style="font-size:0.85rem;color:var(--color-teal);display:block;margin-top:4px;">${formatarMoedaBR(pv.total)}</span>`;
  } else {
    proxEl.innerHTML = '<span style="font-size:0.9rem;color:var(--text-muted);">Nenhuma fatura pendente</span>';
  }
}

function renderListaCartoes() {
  const container = document.getElementById('lista-cartoes-container');
  if (!container) return;

  if (cartoes.length === 0) {
    container.innerHTML = '<p style="color: var(--text-muted); font-size: 0.9rem;">Nenhum cartão cadastrado.</p>';
    return;
  }

  let html = '<div class="form-grid">';
  cartoes.forEach(c => {
    const opacity = c.ativo ? '1' : '0.5';
    const btnAtivar = c.ativo
      ? `<button class="btn-secondary" style="flex: 1; padding: 6px; font-size: 0.8rem;" onclick="window.desativarCartao(${c.id})">Desativar</button>`
      : `<button class="btn-primary" style="flex: 1; padding: 6px; font-size: 0.8rem;" onclick="window.ativarCartao(${c.id})">Ativar</button>`;
    
    // Calcular limite disponível: limite total - soma das faturas abertas/fechadas deste cartão
    const gastoAberto = faturas.filter(f => f.cartao_id === c.id && (f.status === 'aberta' || f.status === 'fechada')).reduce((sum, f) => sum + (f.total || 0), 0);
    const limiteDisponivel = Math.max(0, (c.limite || 0) - gastoAberto);
    const percentUsado = c.limite > 0 ? Math.min(100, (gastoAberto / c.limite) * 100) : 0;
    const barColor = percentUsado > 80 ? 'var(--color-rose)' : percentUsado > 50 ? 'var(--color-gold)' : 'var(--color-teal)';
      
    html += `
      <div class="metric-card" style="padding: 16px; opacity: ${opacity}; position: relative;">
        ${!c.ativo ? '<div style="position: absolute; top: -8px; right: -8px; background: var(--color-rose); color: white; font-size: 0.65rem; padding: 2px 6px; border-radius: 4px; font-weight: bold; text-transform: uppercase;">Inativo</div>' : ''}
        <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
          <div style="font-weight: 600; color: ${safeColor(c.cor, 'var(--text-primary)')}; font-size: 1.1rem;">${escapeHtml(c.nome)}</div>
          <div class="header__badge"><div class="header__badge-dot" style="background: ${safeColor(c.cor, 'var(--color-teal)')};"></div></div>
        </div>
        <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 12px;">${escapeHtml(c.banco || '')}</div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
          <span style="font-size: 0.8rem; color: var(--text-secondary);">Limite total:</span>
          <span style="font-weight: 600;">${formatarMoedaBR(c.limite)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
          <span style="font-size: 0.8rem; color: var(--text-secondary);">Disponível:</span>
          <span style="font-weight: 600; color: ${barColor};">${formatarMoedaBR(limiteDisponivel)}</span>
        </div>
        <div style="height:4px; background:var(--border-subtle); border-radius:2px; margin-bottom:8px; overflow:hidden;"><div style="height:100%; width:${percentUsado}%; background:${barColor}; border-radius:2px;"></div></div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
          <span style="font-size: 0.8rem; color: var(--text-secondary);">Fecha dia:</span>
          <span style="font-weight: 600;">${c.dia_fechamento}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
          <span style="font-size: 0.8rem; color: var(--text-secondary);">Vence dia:</span>
          <span style="font-weight: 600;">${c.dia_vencimento}</span>
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="btn-icon" style="padding: 6px; font-size: 0.8rem;" onclick="window.abrirModalListaFaturasCartao(${c.id})" title="Ver Faturas"><i data-lucide="file-text" style="width: 14px; height: 14px;"></i></button>
          <button class="btn-icon" style="padding: 6px; font-size: 0.8rem;" onclick="window.editarCartao(${c.id})" title="Editar"><i data-lucide="edit-2" style="width: 14px; height: 14px;"></i></button>
          ${btnAtivar}
          <button class="btn-icon" style="padding: 6px; font-size: 0.8rem; color: var(--color-rose);" onclick="window.excluirCartao(${c.id})" title="Excluir"><i data-lucide="trash-2" style="width: 14px; height: 14px;"></i></button>
        </div>
      </div>
    `;
  });
  html += '</div>';
  container.innerHTML = html;
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function renderFormSelects() {
  const opts = cartoes.map(c => `<option value="${c.id}">${escapeHtml(c.nome)}</option>`).join('');
  const catOpts = categorias.map(c => `<option value="${c.id}">${escapeHtml(c.nome)}</option>`).join('');
  ['form-compra-cartao', 'form-ea-cartao'].forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = opts; });
  ['form-compra-categoria', 'form-ea-categoria'].forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = catOpts; });
}

export function restaurarCartaoSelecionado(selectElement, cartaoId) {
  if (!selectElement || !cartaoId) return false;
  const valor = String(cartaoId);
  const existeOpcao = Array.from(selectElement.options || []).some(opcao => String(opcao.value) === valor);
  if (!existeOpcao) return false;
  selectElement.value = valor;
  return selectElement.value === valor;
}

function renderFaturas() {
  const container = document.getElementById('faturas-lista-container');
  if (!container) return;

  if (faturas.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: var(--text-muted);">Nenhuma fatura encontrada.</p>';
    return;
  }

  // Agrupar por cartão
  let grupos = {};
  faturas.forEach(f => {
    if (!grupos[f.cartao_id]) grupos[f.cartao_id] = { cartao_nome: f.cartao_nome, faturas: [] };
    grupos[f.cartao_id].faturas.push(f);
  });

  let html = '';
  Object.keys(grupos).forEach(cartaoId => {
    const g = grupos[cartaoId];
    g.faturas.sort((a,b) => a.competencia.localeCompare(b.competencia));
    
    // fatura atual: primeira aberta ou fechada. Se não, a mais recente
    let faturaAtual = g.faturas.find(f => f.status === 'aberta' || f.status === 'fechada');
    if (!faturaAtual) faturaAtual = g.faturas[g.faturas.length - 1];
    
    let proximas = g.faturas.filter(f => f.competencia > faturaAtual.competencia).slice(0,3);
    
    const cartaoCor = safeColor(cartoes.find(c => String(c.id) === String(cartaoId))?.cor, 'var(--color-teal)');
    const [anoA, mesA] = faturaAtual.competencia.split('-');
    
    let proximasStr = proximas.length > 0 ? proximas.map(p => {
       const [a,m] = p.competencia.split('-');
       return `${m}/${a}`;
    }).join(', ') : 'Nenhuma';

    html += `
      <div style="border: 1px solid var(--border-subtle); border-radius: 8px; padding: 16px; margin-bottom: 16px; background: var(--bg-surface);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <div style="font-weight:600; font-size:1.1rem; display:flex; align-items:center; gap:8px;">
            <div style="width:10px; height:10px; border-radius:50%; background:${cartaoCor};"></div>
            <span style="color:${cartaoCor};">${escapeHtml(g.cartao_nome)}</span>
          </div>
          <button class="btn-secondary" style="padding:4px 12px; font-size:0.8rem;" onclick="window.abrirModalListaFaturasCartao(${cartaoId})">Ver Faturas</button>
        </div>
        <div style="margin-bottom:8px;">
          <span style="font-size:0.85rem; color:var(--text-secondary);">Fatura atual:</span> 
          <strong style="color:var(--text-primary);">${mesA}/${anoA} — ${formatarMoedaBR(faturaAtual.total)}</strong> 
          <span style="font-size:0.85rem; color:var(--text-muted);">— vence ${formatarDataBR(faturaAtual.vencimento)}</span>
        </div>
        <div>
          <span style="font-size:0.85rem; color:var(--text-secondary);">Próximas:</span> 
          <span style="font-size:0.85rem; color:var(--text-primary);">${proximasStr}</span>
        </div>
      </div>
    `;
  });
  
  container.innerHTML = html;
}

function renderComprasParceladas() {
  const tbody = document.getElementById('tbody-compras');
  if (!tbody) return;

  // Render filter tabs if container exists
  const filtroContainer = document.getElementById('compras-filtro-container');
  if (filtroContainer) {
    let tabsHtml = `
      <button class="btn-tab ${filtroCartaoCompra === 'todos' ? 'active' : ''}" 
              style="padding: 6px 12px; font-size: 0.8rem; border-radius: 20px; border: 1px solid ${filtroCartaoCompra === 'todos' ? 'var(--color-teal)' : 'var(--border-subtle)'}; background: ${filtroCartaoCompra === 'todos' ? 'var(--color-teal)' : 'transparent'}; color: ${filtroCartaoCompra === 'todos' ? '#fff' : 'var(--text-secondary)'}; cursor: pointer; transition: all 0.2s; font-weight: 500;"
              onclick="window.setFiltroCartaoCompra('todos')">
        Todos
      </button>
    `;
    
    cartoes.forEach(c => {
      if (!c.ativo) return;
      const isSelected = String(filtroCartaoCompra) === String(c.id);
      const activeColor = safeColor(c.cor, 'var(--color-teal)');
      tabsHtml += `
        <button class="btn-tab ${isSelected ? 'active' : ''}" 
                style="padding: 6px 12px; font-size: 0.8rem; border-radius: 20px; border: 1px solid ${isSelected ? activeColor : 'var(--border-subtle)'}; background: ${isSelected ? activeColor : 'transparent'}; color: ${isSelected ? '#fff' : 'var(--text-secondary)'}; cursor: pointer; transition: all 0.2s; font-weight: 500; display: flex; align-items: center; gap: 6px;"
                onclick="window.setFiltroCartaoCompra(${c.id})">
          <span style="width: 8px; height: 8px; border-radius: 50%; background: ${isSelected ? '#fff' : activeColor};"></span>
          ${escapeHtml(c.nome)}
        </button>
      `;
    });
    
    filtroContainer.innerHTML = tabsHtml;
  }

  // Filter purchases
  const filteredCompras = comprasParceladas.filter(c => {
    if (filtroCartaoCompra === 'todos') return true;
    return String(c.cartao_id) === String(filtroCartaoCompra);
  });

  // Render summary card
  const resumoCard = document.getElementById('compras-resumo-card');
  if (resumoCard) {
    if (filtroCartaoCompra !== 'todos') {
      const selectedCartao = cartoes.find(c => String(c.id) === String(filtroCartaoCompra));
      const totalRestante = filteredCompras.reduce((sum, c) => sum + (c.valor_restante || 0), 0);
      document.getElementById('compras-resumo-nome').textContent = selectedCartao ? selectedCartao.nome : '';
      document.getElementById('compras-resumo-valor').textContent = formatarMoedaBR(totalRestante);
      resumoCard.style.display = 'flex';
    } else {
      resumoCard.style.display = 'none';
    }
  }

  if (filteredCompras.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 24px 0;">Nenhuma compra parcelada ativa para o filtro selecionado.</td></tr>';
    return;
  }

  let html = '';
  filteredCompras.forEach(c => {
    const cartaoCor = safeColor(cartoes.find(x => String(x.id) === String(c.cartao_id))?.cor, 'var(--color-teal)');
    
    // Parcela (ex: 6/9 a 9/9)
    const pagas = c.parcelas_pagas || 0;
    const prox = pagas + 1 > c.total_parcelas_geradas ? c.total_parcelas_geradas : pagas + 1;
    const parcelaStr = `${prox}/${c.total_parcelas_geradas} até ${c.total_parcelas_geradas}/${c.total_parcelas_geradas}`;
    
    // Próxima (ex: 6/9 em 05/2026)
    let proxStr = '-';
    if (c.prox_competencia) {
       const [a,m] = c.prox_competencia.split('-');
       proxStr = `${prox}/${c.total_parcelas_geradas} em ${m}/${a}`;
    }
    
    // Valor da parcela
    const valorParc = c.prox_valor || (c.valor_total / c.total_parcelas_geradas);

    html += `<tr>
      <td style="font-weight: 500;">${escapeHtml(c.descricao)}</td>
      <td><div style="display:flex;align-items:center;gap:6px;"><div style="width:8px;height:8px;border-radius:50%;background:${cartaoCor};"></div>${escapeHtml(c.cartao_nome)}</div></td>
      <td>${parcelaStr}</td>
      <td style="font-weight: 600;">${formatarMoedaBR(valorParc)}</td>
      <td style="color:var(--text-secondary);">${formatarMoedaBR(c.valor_restante || 0)}</td>
      <td>${proxStr}</td>
      <td><div style="display:flex;gap:6px;">
        <button class="btn-icon" onclick="window.abrirModalVerParcelasCompra(${c.id})" title="Ver Parcelas"><i data-lucide="list" style="width:14px;height:14px;"></i></button>
        <button class="btn-icon" onclick="window.editarCompraParcelada(${c.id})" title="Editar"><i data-lucide="edit-2" style="width:14px;height:14px;"></i></button>
        <button class="btn-icon danger" style="color:var(--color-rose);" onclick="window.abrirModalExcluirCompra(${c.id})" title="Excluir"><i data-lucide="trash-2" style="width:14px;height:14px;"></i></button>
      </div></td>
    </tr>`;
  });
  tbody.innerHTML = html;
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ═══════════════════════════════════════
// ACTIONS
// ═══════════════════════════════════════

window.salvarCartao = async function() {
  const id = document.getElementById('modal-cartao-id').value;
  const nome = document.getElementById('modal-cartao-nome').value;
  const banco = document.getElementById('modal-cartao-banco').value;
  const limite = parseFloat(document.getElementById('modal-cartao-limite').value) || 0;
  const dia_fechamento = parseInt(document.getElementById('modal-cartao-fechamento').value);
  const dia_vencimento = parseInt(document.getElementById('modal-cartao-vencimento').value);
  const cor = document.getElementById('modal-cartao-cor').value;

  if (!nome || !dia_fechamento || !dia_vencimento) {
    showToast('Preencha os campos obrigatórios!', 'error');
    return;
  }

  try {
    if (id) {
      await fetchAPI(`/cartoes/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ nome, banco, limite, dia_fechamento, dia_vencimento, cor })
      });
      showToast('Cartão atualizado com sucesso!');
    } else {
      await fetchAPI('/cartoes', {
        method: 'POST',
        body: JSON.stringify({ nome, banco, limite, dia_fechamento, dia_vencimento, cor, ativo: 1 })
      });
      showToast('Cartão cadastrado com sucesso!');
    }
    window.fecharModalCartao();
    initCartoes();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.abrirModalNovoCartao = function() {
  document.getElementById('modal-cartao-id').value = '';
  document.getElementById('modal-cartao-nome').value = '';
  document.getElementById('modal-cartao-banco').value = '';
  document.getElementById('modal-cartao-limite').value = '';
  document.getElementById('modal-cartao-fechamento').value = '';
  document.getElementById('modal-cartao-vencimento').value = '';
  document.getElementById('modal-cartao-cor').value = '#8b5cf6';
  document.getElementById('modal-cartao-titulo').textContent = 'Cadastrar Cartão';
  document.getElementById('modal-novo-cartao').style.display = 'flex';
};

window.editarCartao = function(id) {
  const c = cartoes.find(x => x.id === id);
  if (!c) return;
  document.getElementById('modal-cartao-id').value = c.id;
  document.getElementById('modal-cartao-nome').value = c.nome;
  document.getElementById('modal-cartao-banco').value = c.banco || '';
  document.getElementById('modal-cartao-limite').value = c.limite || '';
  document.getElementById('modal-cartao-fechamento').value = c.dia_fechamento;
  document.getElementById('modal-cartao-vencimento').value = c.dia_vencimento;
  document.getElementById('modal-cartao-cor').value = c.cor || '#8b5cf6';
  document.getElementById('modal-cartao-titulo').textContent = 'Editar Cartão';
  document.getElementById('modal-novo-cartao').style.display = 'flex';
};

window.fecharModalCartao = function() {
  document.getElementById('modal-novo-cartao').style.display = 'none';
};

window.salvarCompra = async function() {
  const cartao_id = parseInt(document.getElementById('form-compra-cartao').value);
  const categoria_id = parseInt(document.getElementById('form-compra-categoria').value);
  const data_compra = document.getElementById('form-compra-data').value;
  const descricao = document.getElementById('form-compra-desc').value;
  const valor_total = parseFloat(document.getElementById('form-compra-valor').value);
  const quantidade_parcelas = parseInt(document.getElementById('form-compra-parcelas').value);
  const observacao = document.getElementById('form-compra-obs').value;

  if (!cartao_id || !categoria_id || !data_compra || !descricao || isNaN(valor_total) || valor_total <= 0 || isNaN(quantidade_parcelas) || quantidade_parcelas < 1) {
    showToast('Preencha os campos obrigatórios corretamente!', 'error');
    return;
  }

  try {
    const btn = document.getElementById('btn-salvar-compra');
    btn.disabled = true;
    btn.innerHTML = 'Salvando...';

    await fetchAPI('/cartoes/compras', {
      method: 'POST',
      body: JSON.stringify({ cartao_id, categoria_id, data_compra, descricao, valor_total, quantidade_parcelas, observacao })
    });
    
    showToast('Compra registrada com sucesso!');
    
    // Limpar form
    document.getElementById('form-compra-desc').value = '';
    document.getElementById('form-compra-valor').value = '';
    document.getElementById('form-compra-obs').value = '';
    document.getElementById('form-compra-parcelas').value = '1';
    
    await initCartoes();
    restaurarCartaoSelecionado(document.getElementById('form-compra-cartao'), cartao_id);
  } catch (err) {
    showToast('Erro ao salvar: ' + err.message, 'error');
  } finally {
    const btn = document.getElementById('btn-salvar-compra');
    btn.disabled = false;
    btn.innerHTML = 'Adicionar Compra Nova';
  }
};

window.setFiltroCartaoFatura = function(id) {
  filtroCartaoFatura = id;
  const sel = document.getElementById('filtro-fatura-cartao');
  if (sel) sel.value = id;
  renderFaturas();
  document.getElementById('faturas-section')?.scrollIntoView({behavior: 'smooth'});
};

window.setFiltroCartaoCompra = function(cartaoId) {
  filtroCartaoCompra = cartaoId;
  renderComprasParceladas();
};

window.setFiltroFatura = function(tipo, valor) {
  if (tipo === 'cartao') filtroCartaoFatura = valor;
  if (tipo === 'status') filtroStatusFatura = valor;
  if (tipo === 'periodo') filtroPeriodoFatura = valor;
  renderFaturas();
};

window.abrirModalPagarFatura = async function(id) {
  try {
    const fatura = await fetchAPI(`/cartoes/faturas/${id}`);
    if (fatura.status === 'paga') {
      showToast('Esta fatura já está paga.', 'error');
      return;
    }
    
    // Se o modal de faturas do cartão estiver aberto, fecha ele e lembra de reabrir caso cancele
    const faturasModal = document.getElementById('modal-lista-faturas-cartao');
    if (faturasModal && faturasModal.style.display === 'flex') {
      faturasModal.style.display = 'none';
      window.faturasModalEstavaAberto = true;
    } else {
      window.faturasModalEstavaAberto = false;
    }

    const modal = document.getElementById('modal-pagar-fatura');
    document.getElementById('modal-pagar-id').value = id;
    document.getElementById('modal-pagar-data').value = dataAtualISO();
    document.getElementById('modal-pagar-forma').value = '';
    document.getElementById('modal-pagar-obs').value = '';
    
    const [ano, mes] = fatura.competencia.split('-');
    
    document.getElementById('modal-pagar-info').innerHTML = `
      <p style="margin-bottom:8px;"><strong>Cartão:</strong> ${escapeHtml(fatura.cartao_nome)}</p>
      <p style="margin-bottom:8px;"><strong>Competência:</strong> ${mes}/${ano}</p>
      <p style="margin-bottom:8px;"><strong>Vencimento:</strong> ${formatarDataBR(fatura.vencimento)}</p>
      <p style="margin-bottom:16px; font-size:1.3rem; font-weight:700; color:var(--color-teal);">Valor: ${formatarMoedaBR(fatura.total)}</p>
      <p style="font-size:0.8rem; color:var(--text-muted);">Esta ação marcará a fatura inteira como paga e atualizará todas as parcelas vinculadas.</p>
    `;
    
    modal.style.display = 'flex';
  } catch (err) {
    showToast('Erro ao carregar fatura: ' + err.message, 'error');
  }
};

window.fecharModalPagarFatura = function() {
  document.getElementById('modal-pagar-fatura').style.display = 'none';
  if (window.faturasModalEstavaAberto) {
    document.getElementById('modal-lista-faturas-cartao').style.display = 'flex';
    window.faturasModalEstavaAberto = false;
  }
};

window.confirmarPagamentoFatura = async function() {
  const id = document.getElementById('modal-pagar-id').value;
  const data_pagamento = document.getElementById('modal-pagar-data').value;
  const forma_pagamento = document.getElementById('modal-pagar-forma').value;
  const observacao = document.getElementById('modal-pagar-obs').value;
  
  try {
    const res = await fetchAPI(`/cartoes/faturas/${id}/pagar`, {
      method: 'POST',
      body: JSON.stringify({ data_pagamento, forma_pagamento, observacao })
    });
    const comp = res.competencia ? res.competencia.split('-') : [];
    const descFatura = res.cartao_nome ? `${res.cartao_nome} ${comp[1] || ''}/${comp[0] || ''}` : '';
    showToast(`Fatura ${descFatura} paga com sucesso!`);
    window.faturasModalEstavaAberto = false; // Garante que não reabre
    window.fecharModalPagarFatura();
    initCartoes();
  } catch (err) {
    showToast('Não foi possível pagar a fatura: ' + err.message, 'error');
  }
};

function obterCompetenciaAtivaCartao(cartaoId) {
  const faturasCartao = faturas.filter(f => String(f.cartao_id) === String(cartaoId) && (f.status === 'aberta' || f.status === 'fechada'));
  if (faturasCartao.length === 0) {
    const hoje = new Date();
    return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
  }
  faturasCartao.sort((a,b) => a.competencia.localeCompare(b.competencia));
  return faturasCartao[0].competencia;
}

window.abrirModalVerParcelasCompra = async function(id) {
  try {
    const compra = await fetchAPI(`/cartoes/compras-parceladas/${id}`);
    const modal = document.getElementById('modal-ver-parcelas');
    const tbody = document.getElementById('tbody-ver-parcelas');
    
    document.getElementById('modal-parcelas-titulo').textContent = `Parcelas: ${compra.descricao}`;
    
    const compAtiva = obterCompetenciaAtivaCartao(compra.cartao_id);
    
    let html = '';
    compra.parcelas.forEach(p => {
      let badgeColor = p.status === 'paga' ? 'var(--color-teal)' : 'var(--color-blue)';
      const [ano, mes] = p.competencia.split('-');
      const competenciaFormatada = `${mes}/${ano}`;
      
      // Elegível se status aberta e competência posterior à ativa
      const elegivel = p.status === 'aberta' && p.competencia > compAtiva;
      
      const checkboxHtml = elegivel 
        ? `<input type="checkbox" class="chk-antecipar-parcela" data-id="${p.id}" data-valor="${p.valor_parcela}" onchange="window.atualizarTotalAntecipacao()">`
        : `<input type="checkbox" disabled style="opacity: 0.3;">`;

      html += `<tr>
        <td style="text-align:center;">${checkboxHtml}</td>
        <td>${p.numero_parcela}/${p.total_parcelas}</td>
        <td>${competenciaFormatada}</td>
        <td style="font-weight:600;">${formatarMoedaBR(p.valor_parcela)}</td>
        <td>
          <span style="display:inline-flex;align-items:center;gap:6px;font-size:0.75rem;padding:4px 10px;border-radius:100px;background:var(--bg-surface);border:1px solid var(--border-subtle);font-weight:500;text-transform:uppercase;">
            <span style="width:6px;height:6px;border-radius:50%;background:${badgeColor};"></span>
            ${escapeHtml(p.status)}
          </span>
        </td>
      </tr>`;
    });
    
    tbody.innerHTML = html;
    
    // Injeta ou limpa seção de ações do modal
    let actionDiv = document.getElementById('modal-parcelas-acoes');
    if (!actionDiv) {
      actionDiv = document.createElement('div');
      actionDiv.id = 'modal-parcelas-acoes';
      actionDiv.style.marginTop = '20px';
      actionDiv.style.padding = '12px 16px';
      actionDiv.style.background = 'var(--bg-surface)';
      actionDiv.style.borderRadius = '8px';
      actionDiv.style.border = '1px solid var(--border-subtle)';
      actionDiv.style.display = 'none';
      actionDiv.style.justifyContent = 'space-between';
      actionDiv.style.alignItems = 'center';
      
      const modalBody = modal.querySelector('.form-card');
      const closeButtonContainer = modalBody.querySelector('div[style*="justify-content: flex-end"]');
      modalBody.insertBefore(actionDiv, closeButtonContainer);
    }
    
    actionDiv.innerHTML = `
      <div style="font-size:0.85rem; color:var(--text-secondary);">
        Selecionados: <strong id="qtd-antecipar" style="color:var(--text-primary);">0</strong> | 
        Total: <strong id="total-antecipar" style="color:var(--color-teal);">R$ 0,00</strong>
      </div>
      <button class="btn-primary" id="btn-antecipar-confirmar" style="padding: 6px 12px; font-size: 0.8rem; background: var(--color-teal);" onclick="window.confirmarAntecipacaoParcelas(${compra.id})">Antecipar</button>
    `;
    actionDiv.style.display = 'none';
    
    modal.style.display = 'flex';
  } catch(err) {
    showToast('Erro ao carregar parcelas: ' + err.message, 'error');
  }
};

window.fecharModalVerParcelasCompra = function() {
  document.getElementById('modal-ver-parcelas').style.display = 'none';
  const actionDiv = document.getElementById('modal-parcelas-acoes');
  if (actionDiv) actionDiv.style.display = 'none';
};

window.atualizarTotalAntecipacao = function() {
  const checkboxes = document.querySelectorAll('.chk-antecipar-parcela:checked');
  const count = checkboxes.length;
  let total = 0;
  checkboxes.forEach(chk => {
    total += parseFloat(chk.getAttribute('data-valor'));
  });
  
  const actionDiv = document.getElementById('modal-parcelas-acoes');
  if (actionDiv) {
    if (count > 0) {
      actionDiv.style.display = 'flex';
      document.getElementById('qtd-antecipar').textContent = count;
      document.getElementById('total-antecipar').textContent = formatarMoedaBR(total);
    } else {
      actionDiv.style.display = 'none';
    }
  }
};

window.confirmarAntecipacaoParcelas = async function(compraId) {
  const checkboxes = document.querySelectorAll('.chk-antecipar-parcela:checked');
  const ids = Array.from(checkboxes).map(chk => parseInt(chk.getAttribute('data-id')));
  
  if (ids.length === 0) return;
  
  if (!confirm(`Deseja realmente antecipar as ${ids.length} parcelas selecionadas para a fatura aberta do cartão?`)) {
    return;
  }
  
  try {
    const btn = document.getElementById('btn-antecipar-confirmar');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Antecipando...';
    }
    
    await fetchAPI('/cartoes/parcelas/antecipar', {
      method: 'POST',
      body: JSON.stringify({ ids })
    });
    
    showToast('Parcelas antecipadas com sucesso!');
    window.fecharModalVerParcelasCompra();
    await initCartoes();
  } catch (err) {
    showToast('Erro ao antecipar parcelas: ' + err.message, 'error');
    const btn = document.getElementById('btn-antecipar-confirmar');
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Antecipar';
    }
  }
};

window.verDetalhesFatura = async function(id) {
  try {
    const fatura = await fetchAPI(`/cartoes/faturas/${id}`);
    const modal = document.getElementById('modal-fatura-detalhes');
    const tbody = document.getElementById('tbody-fatura-detalhes');
    const titulo = document.getElementById('modal-fatura-titulo');
    
    const [ano, mes] = fatura.competencia.split('-');
    titulo.textContent = `Fatura ${fatura.cartao_nome} - ${mes}/${ano}`;
    
    let html = '';
    fatura.parcelas.forEach(p => {
      html += `
        <tr>
          <td>${formatarDataBR(p.data_compra)}</td>
          <td>${escapeHtml(p.descricao)}</td>
          <td>${escapeHtml(p.categoria_nome)}</td>
          <td>${p.numero_parcela}/${p.total_parcelas}</td>
          <td style="font-weight: 600;">${formatarMoedaBR(p.valor_parcela)}</td>
          <td>${escapeHtml(p.status)}</td>
        </tr>
      `;
    });
    
    if (fatura.parcelas.length === 0) {
      html = '<tr><td colspan="6" style="text-align: center;">Nenhuma parcela nesta fatura.</td></tr>';
    }
    
    tbody.innerHTML = html;

    // Se o modal de faturas do cartão estiver aberto, fecha ele e lembra de reabrir
    const faturasModal = document.getElementById('modal-lista-faturas-cartao');
    if (faturasModal && faturasModal.style.display === 'flex') {
      faturasModal.style.display = 'none';
      window.detalhesFaturaModalEstavaAberto = true;
    } else {
      window.detalhesFaturaModalEstavaAberto = false;
    }

    modal.style.display = 'flex';
  } catch (err) {
    showToast('Erro ao abrir detalhes: ' + err.message, 'error');
  }
};

window.fecharModalFatura = function() {
  document.getElementById('modal-fatura-detalhes').style.display = 'none';
  if (window.detalhesFaturaModalEstavaAberto) {
    document.getElementById('modal-lista-faturas-cartao').style.display = 'flex';
    window.detalhesFaturaModalEstavaAberto = false;
  }
};

window.desativarCartao = async function(id) {
  if (!confirm('Deseja realmente desativar este cartão?')) return;
  try {
    await fetchAPI(`/cartoes/${id}/desativar`, { method: 'POST' });
    showToast('Cartão desativado.');
    initCartoes();
  } catch (err) {
    showToast('Erro ao desativar: ' + err.message, 'error');
  }
};

window.ativarCartao = async function(id) {
  try {
    await fetchAPI(`/cartoes/${id}/ativar`, { method: 'POST' });
    showToast('Cartão ativado.');
    initCartoes();
  } catch (err) {
    showToast('Erro ao ativar: ' + err.message, 'error');
  }
};

window.excluirCartao = async function(id) {
  if (!confirm('Tem certeza que deseja excluir este cartão? Essa ação deve ser usada apenas para cartões cadastrados por engano.')) return;
  try {
    const res = await fetchAPI(`/cartoes/${id}`, { method: 'DELETE' });
    
    // Se o backend avisou que apenas desativou por causa do histórico
    if (res.mensagem && res.mensagem.includes('desativado em vez de excluído')) {
      if (confirm('Este cartão possui histórico (compras ou faturas). Deseja APAGAR DEFINITIVAMENTE o cartão e TODO o seu histórico? Esta ação não pode ser desfeita.')) {
        const resForcada = await fetchAPI(`/cartoes/${id}?forcar=true`, { method: 'DELETE' });
        showToast(resForcada.mensagem || 'Cartão e histórico apagados!');
      } else {
        showToast('O cartão foi mantido e apenas desativado para preservar os dados.');
      }
    } else {
      showToast(res.mensagem || 'Operação realizada com sucesso!');
    }
    
    initCartoes();
  } catch (err) {
    showToast('Erro ao excluir: ' + err.message, 'error');
  }
};

// ═══════════════════════════════════════
// COMPRA EM ANDAMENTO + EDITAR/EXCLUIR
// ═══════════════════════════════════════

window.abrirModalListaFaturasCartao = function(cartaoId) {
  const modal = document.getElementById('modal-lista-faturas-cartao');
  const tbody = document.getElementById('tbody-modal-faturas');
  const cartao = cartoes.find(c => String(c.id) === String(cartaoId));
  if (!cartao || !modal || !tbody) return;

  document.getElementById('modal-lista-faturas-titulo').textContent = `Faturas: ${cartao.nome}`;

  let faturasCartao = faturas.filter(f => String(f.cartao_id) === String(cartaoId));
  faturasCartao.sort((a,b) => a.competencia.localeCompare(b.competencia));

  if (faturasCartao.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">Nenhuma fatura encontrada.</td></tr>';
  } else {
    let html = '';
    faturasCartao.forEach(f => {
      let badgeColor = 'var(--text-muted)';
      if (f.status === 'aberta') badgeColor = 'var(--color-blue)';
      if (f.status === 'fechada') badgeColor = 'var(--color-yellow)';
      if (f.status === 'paga') badgeColor = 'var(--color-teal)';
      if (f.status === 'cancelada') badgeColor = 'var(--color-rose)';

      const [ano, mes] = f.competencia.split('-');

      html += `
        <tr>
          <td>${mes}/${ano}</td>
          <td>${formatarDataBR(f.vencimento)}</td>
          <td style="font-weight: 600;">${formatarMoedaBR(f.total)}</td>
          <td>
            <span style="display: inline-flex; align-items: center; gap: 6px; font-size: 0.75rem; padding: 4px 10px; border-radius: 100px; background: var(--bg-surface); border: 1px solid var(--border-subtle); font-weight: 500; text-transform: uppercase;">
              <span style="width: 6px; height: 6px; border-radius: 50%; background: ${badgeColor};"></span>
              ${escapeHtml(f.status)}
            </span>
            ${f.status === 'paga' && f.pago_em ? `<span style="display:block;font-size:0.7rem;color:var(--text-muted);margin-top:4px;">Pago em: ${formatarDataBR(f.pago_em)}</span>` : ''}
          </td>
          <td>
            <div style="display: flex; gap: 8px; align-items:center;">
              <button class="btn-icon" onclick="window.verDetalhesFatura(${f.id})" title="Ver compras"><i data-lucide="list"></i></button>
              ${f.status !== 'paga' && f.status !== 'cancelada' ? `<button style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:var(--color-teal);color:white;font-weight:500;font-size:0.75rem;border-radius:var(--radius-sm);border:none;cursor:pointer;" onclick="window.abrirModalPagarFatura(${f.id})"><i data-lucide="check-circle" style="width:12px;height:12px;"></i> Pagar</button>` : ''}
            </div>
          </td>
        </tr>
      `;
    });
    tbody.innerHTML = html;
  }
  
  modal.style.display = 'flex';
  if (typeof lucide !== 'undefined') lucide.createIcons();
};

window.fecharModalListaFaturasCartao = function() {
  document.getElementById('modal-lista-faturas-cartao').style.display = 'none';
};

window.toggleModoCompra = function(modo) {
  const formNova = document.getElementById('form-compra-nova');
  const formEA = document.getElementById('form-compra-ea');
  const btnNova = document.getElementById('btn-modo-nova');
  const btnEA = document.getElementById('btn-modo-ea');
  if (modo === 'nova') {
    if(formNova) formNova.style.display = '';
    if(formEA) formEA.style.display = 'none';
    if(btnNova) { btnNova.classList.add('active'); btnNova.style.background = 'var(--color-teal)'; btnNova.style.color = '#fff'; }
    if(btnEA) { btnEA.classList.remove('active'); btnEA.style.background = ''; btnEA.style.color = ''; }
  } else {
    if(formNova) formNova.style.display = 'none';
    if(formEA) formEA.style.display = '';
    if(btnEA) { btnEA.classList.add('active'); btnEA.style.background = 'var(--color-teal)'; btnEA.style.color = '#fff'; }
    if(btnNova) { btnNova.classList.remove('active'); btnNova.style.background = ''; btnNova.style.color = ''; }
  }
};

window.calcRestantesEA = function() {
  const totalOriginal = parseInt(document.getElementById('form-ea-total-parcelas').value) || 0;
  const pagas = parseInt(document.getElementById('form-ea-pagas').value) || 0;
  const restantesEl = document.getElementById('form-ea-restantes');
  
  if (totalOriginal > 0) {
    let restantes = totalOriginal - pagas;
    if (restantes < 1) restantes = 1;
    restantesEl.value = restantes;
  }
};

window.salvarCompraEmAndamento = async function() {
  const cartao_id = parseInt(document.getElementById('form-ea-cartao').value);
  const descricao = document.getElementById('form-ea-desc').value;
  const categoria_id = parseInt(document.getElementById('form-ea-categoria').value);
  const valor_parcela = parseFloat(document.getElementById('form-ea-valor-parcela').value);
  const valor_total_original = parseFloat(document.getElementById('form-ea-valor-total').value);
  const total_parcelas_original = parseInt(document.getElementById('form-ea-total-parcelas').value);
  const pagas = parseInt(document.getElementById('form-ea-pagas').value);
  const quantidade_parcelas = parseInt(document.getElementById('form-ea-restantes').value);
  const comp = document.getElementById('form-ea-competencia').value;
  const dia_vencimento_fatura = parseInt(document.getElementById('form-ea-dia-venc').value) || 0;
  const observacao = document.getElementById('form-ea-obs').value;

  const parcela_inicial = pagas + 1;

  if (!descricao || isNaN(valor_parcela) || valor_parcela <= 0 || isNaN(total_parcelas_original) || total_parcelas_original < 1 || isNaN(pagas) || pagas < 0 || isNaN(quantidade_parcelas) || quantidade_parcelas < 1 || !comp) {
    showToast('Preencha todos os campos obrigatórios!', 'error'); return;
  }
  if (pagas >= total_parcelas_original) {
    showToast('Parcelas já pagas não pode ser maior ou igual ao total de parcelas.', 'error'); return;
  }
  const [cAno, cMes] = comp.split('-');
  const competencia_inicial = cAno + '-' + cMes;

  try {
    const btn = document.getElementById('btn-salvar-ea');
    btn.disabled = true; btn.textContent = 'Salvando...';
    await fetchAPI('/cartoes/compras/em-andamento', {
      method: 'POST',
      body: JSON.stringify({ cartao_id, descricao, categoria_id, valor_parcela, valor_total_original, total_parcelas_original, parcela_inicial, quantidade_parcelas, competencia_inicial, dia_vencimento_fatura, observacao })
    });
    showToast('Compra parcelada em andamento criada com sucesso!');
    ['form-ea-desc','form-ea-valor-parcela','form-ea-valor-total','form-ea-obs'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
    await initCartoes();
  } catch (err) {
    showToast('Erro: ' + err.message, 'error');
  } finally {
    const btn = document.getElementById('btn-salvar-ea');
    if(btn) { btn.disabled = false; btn.textContent = 'Registrar Compra em Andamento'; }
  }
};

window.editarCompraParcelada = async function(id) {
  try {
    const compra = await fetchAPI(`/cartoes/compras-parceladas/${id}`);
    const modal = document.getElementById('modal-editar-compra');
    document.getElementById('modal-edit-compra-id').value = compra.id;
    document.getElementById('modal-edit-desc').value = compra.descricao;
    document.getElementById('modal-edit-valor-total').value = compra.valor_total;
    document.getElementById('modal-edit-obs').value = compra.observacao || '';
    const selCat = document.getElementById('modal-edit-categoria');
    selCat.innerHTML = categorias.map(c => `<option value="${c.id}" ${c.id === compra.categoria_id ? 'selected' : ''}>${escapeHtml(c.nome)}</option>`).join('');
    const firstParc = compra.parcelas && compra.parcelas.length > 0 ? compra.parcelas[0] : null;
    document.getElementById('modal-edit-valor-parcela').value = firstParc ? firstParc.valor_parcela : '';
    const infoEl = document.getElementById('modal-edit-info');
    if (infoEl) {
      infoEl.innerHTML = `<div style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:16px;padding:12px;background:var(--bg-surface);border-radius:8px;border:1px solid var(--border-subtle);">
        <strong>Cartão:</strong> ${escapeHtml(compra.cartao_nome)} | <strong>Parcelas geradas:</strong> ${compra.parcelas.length} | <strong>Pagas:</strong> ${compra.temParcelasPagas ? 'Sim ⚠️' : 'Não'}
      </div>`;
    }
    modal.style.display = 'flex';
  } catch (err) { showToast('Erro ao carregar: ' + err.message, 'error'); }
};

window.salvarEdicaoCompra = async function() {
  const id = document.getElementById('modal-edit-compra-id').value;
  const descricao = document.getElementById('modal-edit-desc').value;
  const valor_total = parseFloat(document.getElementById('modal-edit-valor-total').value);
  const categoria_id = parseInt(document.getElementById('modal-edit-categoria').value);
  const valor_parcela = parseFloat(document.getElementById('modal-edit-valor-parcela').value);
  const observacao = document.getElementById('modal-edit-obs').value;
  try {
    await fetchAPI(`/cartoes/compras-parceladas/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ descricao, valor_total, categoria_id, valor_parcela: isNaN(valor_parcela) ? undefined : valor_parcela, observacao })
    });
    showToast('Compra parcelada atualizada com sucesso!');
    document.getElementById('modal-editar-compra').style.display = 'none';
    await initCartoes();
  } catch (err) { showToast('Erro: ' + err.message, 'error'); }
};

window.fecharModalEditarCompra = function() { document.getElementById('modal-editar-compra').style.display = 'none'; };

window.abrirModalExcluirCompra = async function(id) {
  try {
    const compra = await fetchAPI(`/cartoes/compras-parceladas/${id}`);
    const modal = document.getElementById('modal-excluir-compra');
    document.getElementById('modal-del-compra-id').value = id;
    const infoEl = document.getElementById('modal-del-info');
    const temPagas = compra.temParcelasPagas;
    const confText = temPagas ? 'EXCLUIR MESMO ASSIM' : 'EXCLUIR';
    document.getElementById('modal-del-confirmacao-esperada').value = confText;
    infoEl.innerHTML = `<p style="margin-bottom:12px;"><strong>${escapeHtml(compra.descricao)}</strong> — ${escapeHtml(compra.cartao_nome)}</p>
      <p style="margin-bottom:12px;font-size:0.9rem;color:var(--text-secondary);">Isso vai remover a compra, todas as ${compra.parcelas.length} parcelas vinculadas e recalcular as faturas afetadas.</p>
      ${temPagas ? '<p style="color:var(--color-rose);font-weight:600;margin-bottom:12px;">⚠️ Esta compra possui parcelas já PAGAS. A exclusão é irreversível.</p>' : ''}
      <p style="font-size:0.85rem;">Digite <strong>${confText}</strong> para confirmar:</p>`;
    document.getElementById('modal-del-input').value = '';
    modal.style.display = 'flex';
  } catch (err) { showToast('Erro: ' + err.message, 'error'); }
};

window.confirmarExcluirCompra = async function() {
  const id = document.getElementById('modal-del-compra-id').value;
  const input = document.getElementById('modal-del-input').value.trim();
  const esperado = document.getElementById('modal-del-confirmacao-esperada').value;
  if (input !== esperado) { showToast('Confirmação incorreta. Digite exatamente: ' + esperado, 'error'); return; }
  try {
    await fetchAPI(`/cartoes/compras-parceladas/${id}`, {
      method: 'DELETE', body: JSON.stringify({ confirmacao: input })
    });
    showToast('Compra parcelada excluída com sucesso!');
    document.getElementById('modal-excluir-compra').style.display = 'none';
    await initCartoes();
  } catch (err) { showToast('Erro: ' + err.message, 'error'); }
};

window.fecharModalExcluirCompra = function() { document.getElementById('modal-excluir-compra').style.display = 'none'; };

// ═══════════════════════════════════════
// ESTRUTURA HTML
// ═══════════════════════════════════════

export function renderCartoesPage() {
  filtroCartaoCompra = 'todos';


  let h = '';
  
  // TOAST CONTAINER INJECT
  h += '<div id="toast-container" class="toast-container"></div>';

  // HEADER
  h += '<div class="page-header animate-in">';
  h += '  <h1 class="page-header__title">Cartões</h1>';
  h += '  <p class="page-header__subtitle">Controle seus cartões de crédito, compras parceladas, faturas e vencimentos.</p>';
  h += '</div>';

  // METRICS GRID
  h += '<div class="metrics-grid animate-in" style="grid-template-columns: repeat(5, 1fr); gap: 16px;">';
  h += '  <div class="metric-card">';
  h += '    <div class="metric-card__header"><div class="metric-card__label-top">Total em Aberto</div></div>';
  h += '    <div class="metric-card__body"><div class="metric-card__value" id="metrica-total-aberto" style="color: var(--color-blue);">R$ 0,00</div></div>';
  h += '  </div>';
  h += '  <div class="metric-card">';
  h += '    <div class="metric-card__header"><div class="metric-card__label-top">Fatura Atual</div></div>';
  h += '    <div class="metric-card__body"><div class="metric-card__value" id="metrica-fatura-atual">R$ 0,00</div></div>';
  h += '  </div>';
  h += '  <div class="metric-card">';
  h += '    <div class="metric-card__header"><div class="metric-card__label-top">Próximas Faturas</div></div>';
  h += '    <div class="metric-card__body"><div class="metric-card__value" id="metrica-faturas-proximas">R$ 0,00</div></div>';
  h += '  </div>';
  h += '  <div class="metric-card">';
  h += '    <div class="metric-card__header"><div class="metric-card__label-top">Limite Usado</div></div>';
  h += '    <div class="metric-card__body"><div class="metric-card__value" id="metrica-limite-usado" style="color: var(--color-rose);">R$ 0,00</div></div>';
  h += '  </div>';
  h += '  <div class="metric-card">';
  h += '    <div class="metric-card__header"><div class="metric-card__label-top">Próx. Vencimento</div></div>';
  h += '    <div class="metric-card__body"><div class="metric-card__value" id="metrica-prox-vencimento" style="font-size: 1.4rem;">--/--/----</div></div>';
  h += '  </div>';
  h += '</div>';

  // CARDS (LISTA)
  h += '<div class="dashboard-grid animate-in" style="grid-template-columns: 1fr; margin-bottom: 32px;">';
  h += '  <div class="form-card" style="padding: 24px;">';
  h += '    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">';
  h += '      <h3 style="font-weight: 600; color: var(--text-primary);">Meus Cartões</h3>';
  h += '      <button class="btn-primary" onclick="window.abrirModalNovoCartao()">+ Novo Cartão</button>';
  h += '    </div>';
  h += '    <div id="lista-cartoes-container" data-loading-placeholder>Carregando...</div>';
  h += '  </div>';
  h += '</div>';

  // MAIN GRID (FATURAS E COMPRA)
  h += '<div class="dashboard-grid animate-in" style="grid-template-columns: minmax(0, 1fr) 400px; gap: 24px;">';
  
  // Coluna Esquerda: Faturas e Parcelas Recentes
  h += '  <div style="display: flex; flex-direction: column; gap: 24px;">';
  h += '    <div id="faturas-section" class="form-card" style="padding: 24px;">';
  h += '      <h3 style="font-weight: 600; color: var(--text-primary); margin-bottom: 16px;">Faturas</h3>';
  
  // Faturas agrupadas por cartão
  h += '      <div id="faturas-lista-container" data-loading-placeholder>Carregando...</div>';
  h += '    </div>';
  
  h += '    <div class="form-card" style="padding: 24px;">';
  h += '      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; margin-bottom: 16px;">';
  h += '        <h3 style="font-weight: 600; color: var(--text-primary); margin: 0;">Compras Parceladas Ativas</h3>';
  h += '        <div id="compras-filtro-container" class="filter-chips"></div>';
  h += '      </div>';
  h += '      <div id="compras-resumo-card" style="display: none; align-items: center; gap: 8px; padding: 10px 16px; background: var(--bg-body); border-radius: 8px; border: 1px solid var(--border-subtle); margin-bottom: 16px; font-size: 0.85rem;">';
  h += '        <i data-lucide="info" style="width:16px; height:16px; color: var(--color-teal);"></i>';
  h += '        <span>Total restante no cartão <strong id="compras-resumo-nome">...</strong>: <strong id="compras-resumo-valor" style="color: var(--color-teal);">R$ 0,00</strong></span>';
  h += '      </div>';
  h += '      <div class="table-container">';
  h += '        <table class="table">';
  h += '          <thead><tr><th>Descrição</th><th>Cartão</th><th>Parcelamento</th><th>Parcela</th><th>Restante</th><th>Próxima</th><th>Ações</th></tr></thead>';
  h += '          <tbody id="tbody-compras"></tbody>';
  h += '        </table>';
  h += '      </div>';
  h += '    </div>';
  h += '  </div>';

  // Coluna Direita: Nova Compra (dual-mode)
  h += '  <div class="form-card" style="padding: 24px; align-self: start;">';
  h += '    <h3 style="font-weight: 600; color: var(--text-primary); margin-bottom: 16px;">Registrar Compra</h3>';
  // Toggle buttons
  h += '    <div style="display:flex;gap:8px;margin-bottom:20px;">';
  h += '      <button id="btn-modo-nova" class="btn-secondary" style="flex:1;padding:8px;font-size:0.8rem;background:var(--color-teal);color:#fff;" onclick="window.toggleModoCompra(\'nova\')">Compra Nova</button>';
  h += '      <button id="btn-modo-ea" class="btn-secondary" style="flex:1;padding:8px;font-size:0.8rem;" onclick="window.toggleModoCompra(\'andamento\')">Em Andamento</button>';
  h += '    </div>';

  // === FORM COMPRA NOVA ===
  h += '    <div id="form-compra-nova">';
  h += '      <div class="form-group" style="margin-bottom:12px;"><label class="form-label">Cartão*</label><select id="form-compra-cartao" class="form-control"></select></div>';
  h += '      <div class="form-group" style="margin-bottom:12px;"><label class="form-label">Descrição*</label><input type="text" id="form-compra-desc" class="form-control" placeholder="Ex: Mercado Livre"></div>';
  h += '      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">';
  h += '        <div class="form-group"><label class="form-label">Valor total da compra*</label><input type="number" id="form-compra-valor" class="form-control" step="0.01" placeholder="R$ 0,00"></div>';
  h += '        <div class="form-group"><label class="form-label">Data da compra*</label><input type="date" id="form-compra-data" class="form-control" value="'+dataAtualISO()+'"></div>';
  h += '      </div>';
  h += '      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">';
  h += '        <div class="form-group"><label class="form-label">Número de parcelas*</label><input type="number" id="form-compra-parcelas" class="form-control" value="1" min="1" step="1"></div>';
  h += '        <div class="form-group"><label class="form-label">Categoria*</label><select id="form-compra-categoria" class="form-control"></select></div>';
  h += '      </div>';
  h += '      <div class="form-group" style="margin-bottom:16px;"><label class="form-label">Observação</label><input type="text" id="form-compra-obs" class="form-control" placeholder="Detalhes opcionais..."></div>';
  h += '      <button id="btn-salvar-compra" class="btn-primary" style="width:100%;justify-content:center;" onclick="window.salvarCompra()">Adicionar Compra Nova</button>';
  h += '    </div>';

  // === FORM COMPRA EM ANDAMENTO ===
  h += '    <div id="form-compra-ea" style="display:none;">';
  h += '      <div class="form-group" style="margin-bottom:12px;"><label class="form-label">Cartão*</label><select id="form-ea-cartao" class="form-control"></select></div>';
  h += '      <div class="form-group" style="margin-bottom:12px;"><label class="form-label">Descrição*</label><input type="text" id="form-ea-desc" class="form-control" placeholder="Ex: Amazon"></div>';
  h += '      <div class="form-group" style="margin-bottom:12px;"><label class="form-label">Categoria*</label><select id="form-ea-categoria" class="form-control"></select></div>';
  h += '      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">';
  h += '        <div class="form-group"><label class="form-label">Valor de cada parcela*</label><input type="number" id="form-ea-valor-parcela" class="form-control" step="0.01" placeholder="R$ 54,37"></div>';
  h += '        <div class="form-group"><label class="form-label">Valor total original</label><input type="number" id="form-ea-valor-total" class="form-control" step="0.01" placeholder="R$ 489,30"></div>';
  h += '      </div>';
  h += '      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">';
  h += '        <div class="form-group"><label class="form-label">Total de parcelas original*</label><input type="number" id="form-ea-total-parcelas" class="form-control" min="1" placeholder="9" oninput="window.calcRestantesEA()"></div>';
  h += '        <div class="form-group"><label class="form-label">Parcelas já pagas*</label><input type="number" id="form-ea-pagas" class="form-control" min="0" placeholder="5" oninput="window.calcRestantesEA()"></div>';
  h += '      </div>';
  h += '      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">';
  h += '        <div class="form-group"><label class="form-label">Restantes a lançar</label><input type="number" id="form-ea-restantes" class="form-control" min="1" readonly style="background-color:var(--bg-body);"><div style="font-size:0.7rem;color:var(--text-muted);margin-top:4px;">Ex: se está em 6/9, pagou 5 e faltam 4.</div></div>';
  h += '        <div class="form-group"><label class="form-label">Competência da próxima*</label><input type="month" id="form-ea-competencia" class="form-control" value="'+dataAtualISO().substring(0,7)+'"></div>';
  h += '      </div>';
  h += '      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">';
  h += '        <div class="form-group"><label class="form-label">Dia vencimento fatura</label><input type="number" id="form-ea-dia-venc" class="form-control" min="1" max="31" placeholder="Usa do cartão"></div>';
  h += '        <div class="form-group"><label class="form-label">Observação</label><input type="text" id="form-ea-obs" class="form-control" placeholder="Detalhes..."></div>';
  h += '      </div>';
  h += '      <button id="btn-salvar-ea" class="btn-primary" style="width:100%;justify-content:center;" onclick="window.salvarCompraEmAndamento()">Registrar Compra em Andamento</button>';
  h += '    </div>';

  h += '  </div>';
  
  h += '</div>'; // end dashboard-grid

  // MODALS
  // Novo Cartão
  h += `
    <div id="modal-novo-cartao" style="display: none; position: fixed; inset: 0; z-index: 1000; background: rgba(0,0,0,0.8); align-items: center; justify-content: center;">
      <div class="form-card" style="width: 100%; max-width: 500px; padding: 32px; background: var(--bg-main);">
        <h3 id="modal-cartao-titulo" style="font-weight: 600; color: var(--text-primary); margin-bottom: 24px;">Cadastrar Cartão</h3>
        <input type="hidden" id="modal-cartao-id">
        
        <div class="form-group" style="margin-bottom: 16px;">
          <label class="form-label">Nome do Cartão*</label>
          <input type="text" id="modal-cartao-nome" class="form-control" placeholder="Ex: Nubank, Itaú Black">
        </div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
          <div class="form-group">
            <label class="form-label">Banco</label>
            <input type="text" id="modal-cartao-banco" class="form-control" placeholder="Ex: Nubank">
          </div>
          <div class="form-group">
            <label class="form-label">Limite (R$)</label>
            <input type="number" id="modal-cartao-limite" class="form-control" placeholder="0,00" step="0.01">
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;">
          <div class="form-group">
            <label class="form-label">Dia do Fechamento*</label>
            <input type="number" id="modal-cartao-fechamento" class="form-control" min="1" max="31">
          </div>
          <div class="form-group">
            <label class="form-label">Dia do Vencimento*</label>
            <input type="number" id="modal-cartao-vencimento" class="form-control" min="1" max="31">
          </div>
        </div>

        <div class="form-group" style="margin-bottom: 24px;">
          <label class="form-label">Cor de Identificação*</label>
          <select id="modal-cartao-cor" class="form-control">
            <option value="#8b5cf6">Roxo (Nubank)</option>
            <option value="#f97316">Laranja (Inter/Itaú)</option>
            <option value="#3b82f6">Azul Claro (Mercado Pago/Caixa)</option>
            <option value="#1e3a8a">Azul Escuro (Porto/BB)</option>
            <option value="#dc2626">Vermelho (Santander/Bradesco)</option>
            <option value="#eab308">Amarelo (XP/BB)</option>
            <option value="#10b981">Verde (PicPay/Next)</option>
            <option value="#0f172a">Preto (Black/Infinite)</option>
            <option value="#94a3b8">Prata/Cinza (Platinum/C6)</option>
          </select>
        </div>
        
        <div style="display: flex; justify-content: flex-end; gap: 12px;">
          <button class="btn-secondary" onclick="window.fecharModalCartao()">Cancelar</button>
          <button class="btn-primary" onclick="window.salvarCartao()">Salvar Cartão</button>
        </div>
      </div>
    </div>
  `;

  // Detalhes da Fatura
  h += `
    <div id="modal-fatura-detalhes" style="display: none; position: fixed; inset: 0; z-index: 1000; background: rgba(0,0,0,0.8); align-items: center; justify-content: center;">
      <div class="form-card" style="width: 100%; max-width: 800px; padding: 32px; background: var(--bg-main); max-height: 90vh; overflow-y: auto;">
        <h3 id="modal-fatura-titulo" style="font-weight: 600; color: var(--text-primary); margin-bottom: 24px;">Detalhes da Fatura</h3>
        
        <div class="table-container">
          <table class="table">
            <thead><tr><th>Data Compra</th><th>Descrição</th><th>Categoria</th><th>Parcela</th><th>Valor</th><th>Status</th></tr></thead>
            <tbody id="tbody-fatura-detalhes"></tbody>
          </table>
        </div>
        
        <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 24px;">
          <button class="btn-secondary" onclick="window.fecharModalFatura()">Fechar</button>
        </div>
      </div>
    </div>
  `;

  // Modal Editar Compra
  h += `
    <div id="modal-editar-compra" style="display:none;position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,0.8);align-items:center;justify-content:center;">
      <div class="form-card" style="width:100%;max-width:500px;padding:32px;background:var(--bg-main);">
        <h3 style="font-weight:600;color:var(--text-primary);margin-bottom:16px;">Editar Compra Parcelada</h3>
        <input type="hidden" id="modal-edit-compra-id">
        <div id="modal-edit-info"></div>
        <div class="form-group" style="margin-bottom:12px;"><label class="form-label">Descrição</label><input type="text" id="modal-edit-desc" class="form-control"></div>
        <div class="form-group" style="margin-bottom:12px;"><label class="form-label">Categoria</label><select id="modal-edit-categoria" class="form-control"></select></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
          <div class="form-group"><label class="form-label">Valor total original</label><input type="number" id="modal-edit-valor-total" class="form-control" step="0.01"></div>
          <div class="form-group"><label class="form-label">Valor de cada parcela</label><input type="number" id="modal-edit-valor-parcela" class="form-control" step="0.01"></div>
        </div>
        <div class="form-group" style="margin-bottom:20px;"><label class="form-label">Observação</label><input type="text" id="modal-edit-obs" class="form-control"></div>
        <p style="font-size:0.8rem;color:var(--text-muted);margin-bottom:16px;">Parcelas já pagas não serão alteradas. Somente parcelas pendentes serão atualizadas.</p>
        <div style="display:flex;justify-content:flex-end;gap:12px;">
          <button class="btn-secondary" onclick="window.fecharModalEditarCompra()">Cancelar</button>
          <button class="btn-primary" onclick="window.salvarEdicaoCompra()">Salvar Alterações</button>
        </div>
      </div>
    </div>
  `;

  // Modal Excluir Compra
  h += `
    <div id="modal-excluir-compra" style="display:none;position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,0.8);align-items:center;justify-content:center;">
      <div class="form-card" style="width:100%;max-width:500px;padding:32px;background:var(--bg-main);">
        <h3 style="font-weight:600;color:var(--color-rose);margin-bottom:16px;">Excluir Compra Parcelada</h3>
        <input type="hidden" id="modal-del-compra-id">
        <input type="hidden" id="modal-del-confirmacao-esperada">
        <div id="modal-del-info" style="margin-bottom:16px;"></div>
        <div class="form-group" style="margin-bottom:20px;">
          <input type="text" id="modal-del-input" class="form-control" placeholder="Digite a confirmação aqui..." autocomplete="off">
        </div>
        <div style="display:flex;gap:12px;">
          <button class="btn-secondary" style="flex:1;justify-content:center;" onclick="window.fecharModalExcluirCompra()">Cancelar</button>
          <button style="flex:1;display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:12px 24px;background:var(--color-rose);color:white;font-weight:600;font-size:0.9rem;border-radius:var(--radius-sm);border:none;cursor:pointer;transition:all var(--transition-base);" onclick="window.confirmarExcluirCompra()">Confirmar Exclusão</button>
        </div>
      </div>
    </div>
  `;

  // Modal Pagar Fatura
  h += `
    <div id="modal-pagar-fatura" style="display:none;position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,0.8);align-items:center;justify-content:center;">
      <div class="form-card" style="width:100%;max-width:460px;padding:32px;background:var(--bg-main);">
        <h3 style="font-weight:600;color:var(--text-primary);margin-bottom:20px;">Confirmar Pagamento da Fatura</h3>
        <input type="hidden" id="modal-pagar-id">
        <div id="modal-pagar-info" style="margin-bottom:20px;font-size:0.9rem;"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
          <div class="form-group">
            <label class="form-label">Data do Pagamento</label>
            <input type="date" id="modal-pagar-data" class="form-control">
          </div>
          <div class="form-group">
            <label class="form-label">Forma de Pagamento</label>
            <select id="modal-pagar-forma" class="form-control">
              <option value="">Saldo em Conta</option>
              <option value="PIX">PIX</option>
              <option value="Boleto">Boleto</option>
              <option value="Débito automático">Débito automático</option>
            </select>
          </div>
        </div>
        <div class="form-group" style="margin-bottom:24px;">
          <label class="form-label">Observação (opcional)</label>
          <input type="text" id="modal-pagar-obs" class="form-control" placeholder="Ex: Pagamento via app do banco">
        </div>
        <div style="display:flex;gap:12px;">
          <button class="btn-secondary" style="flex:1;justify-content:center;" onclick="window.fecharModalPagarFatura()">Cancelar</button>
          <button style="flex:1;display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:12px 24px;background:var(--color-teal);color:white;font-weight:600;font-size:0.9rem;border-radius:var(--radius-sm);border:none;cursor:pointer;transition:all var(--transition-base);" onclick="window.confirmarPagamentoFatura()">Confirmar Pagamento</button>
        </div>
      </div>
    </div>
  `;

  // Modal Ver Parcelas Compra
  h += `
    <div id="modal-ver-parcelas" style="display:none;position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,0.8);align-items:center;justify-content:center;">
      <div class="form-card" style="width:100%;max-width:500px;padding:32px;background:var(--bg-main);max-height:90vh;overflow-y:auto;">
        <h3 id="modal-parcelas-titulo" style="font-weight:600;color:var(--text-primary);margin-bottom:24px;">Parcelas</h3>
        <div class="table-container">
          <table class="table">
            <thead><tr><th style="width: 40px; text-align: center;">Sel.</th><th>Parcela</th><th>Competência</th><th>Valor</th><th>Status</th></tr></thead>
            <tbody id="tbody-ver-parcelas"></tbody>
          </table>
        </div>
        <div style="display:flex;justify-content:flex-end;margin-top:24px;">
          <button class="btn-secondary" onclick="window.fecharModalVerParcelasCompra()">Fechar</button>
        </div>
      </div>
    </div>
  `;

  // Modal Lista Faturas do Cartão
  h += `
    <div id="modal-lista-faturas-cartao" style="display:none;position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,0.8);align-items:center;justify-content:center;">
      <div class="form-card" style="width:100%;max-width:800px;padding:32px;background:var(--bg-main);max-height:90vh;overflow-y:auto;">
        <h3 id="modal-lista-faturas-titulo" style="font-weight:600;color:var(--text-primary);margin-bottom:24px;">Faturas do Cartão</h3>
        <div class="table-container">
          <table class="table">
            <thead><tr><th>Competência</th><th>Vencimento</th><th>Total</th><th>Status</th><th>Ações</th></tr></thead>
            <tbody id="tbody-modal-faturas"></tbody>
          </table>
        </div>
        <div style="display:flex;justify-content:flex-end;margin-top:24px;">
          <button class="btn-secondary" onclick="window.fecharModalListaFaturasCartao()">Fechar</button>
        </div>
      </div>
    </div>
  `;

  return h;
}
