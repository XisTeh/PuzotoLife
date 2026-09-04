import { apiFetch } from '../services/http.js';
import { appState } from '../state.js';
import { formatarMoedaBR } from '../utils/formatters.js';
import { checkHealth } from '../services/api.js';

const API_BASE = '/api';

// Estado
let configAtual = {};
let empresas = [];
let categorias = [];

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
  const url = `${API_BASE}${endpoint}`;
  const res = await apiFetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  
  const contentType = res.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    const data = await res.json();
    if (data.ok === false || data.success === false) {
      throw new Error(data.error || data.message || 'Erro na requisição');
    }
    return data.data !== undefined ? data.data : data;
  } else {
    // Se não for JSON, logar tudo para depuração
    const text = await res.text();
    console.error("====== DEBUG ERRO HTML ======");
    console.error("URL Chamada:", url);
    console.error("Método:", options.method || 'GET');
    console.error("Status HTTP:", res.status);
    console.error("Payload enviado:", options.body);
    console.error("Resposta Bruta (HTML):", text);
    console.error("=============================");
    
    throw new Error(`O servidor retornou um erro inesperado (Status ${res.status}). Veja o console para detalhes.`);
  }
}

export async function initConfiguracoes() {
  try {
    const [cfg, emp, cat, pag] = await Promise.all([
      fetchAPI('/configuracoes'),
      fetchAPI('/empresas?todas=true'),
      fetchAPI('/financas/categorias?todas=true'),
      fetchAPI('/pagadores/todos')
    ]);
    
    // Converter array de configuracoes para objeto { chave: valor }
    configAtual = cfg || {};
    
    empresas = emp || [];
    categorias = cat || [];
    window._pagadoresList = pag || [];

    preencherFormularios();
    renderCategorias();
    renderPagadores();
    renderEmpresas();
    await window.atualizarDiagnostico();
  } catch (error) {
    showToast('Erro ao carregar configurações: ' + error.message, 'error');
  }
}

window.atualizarDiagnostico = async function() {
  const btn = document.getElementById('btn-diagnostico');
  if (btn) {
    btn.innerHTML = '<i data-lucide="loader" class="spin"></i> Verificando...';
    btn.disabled = true;
  }
  
  try {
    const health = await checkHealth();
    renderDiagnostico(health);
  } catch (err) {
    renderDiagnostico({ status: 'offline' });
  }
  
  if (btn) {
    btn.innerHTML = '<i data-lucide="refresh-cw"></i> Verificar novamente';
    btn.disabled = false;
    if (window.lucide) window.lucide.createIcons();
  }
};

function renderDiagnostico(health) {
  const container = document.getElementById('diagnostico-container');
  if (!container) return;
  
  if (health.status !== 'online') {
    container.innerHTML = `
      <div style="padding: 16px; background: var(--color-rose-dim); border: 1px solid var(--color-rose); border-radius: 8px; color: var(--color-rose);">
        <strong>Backend Offline</strong><br>
        O servidor local não está respondendo. Verifique se o terminal está rodando.
      </div>
    `;
    return;
  }
  
  const dbStatus = health.database?.exists ? '<span style="color:var(--color-teal);">Encontrado</span>' : '<span style="color:var(--color-rose);">Não Encontrado</span>';
  const backupFolder = health.folders?.backup ? '<span style="color:var(--color-teal);">OK</span>' : '<span style="color:var(--color-rose);">Erro</span>';
  
  container.innerHTML = `
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 0.9rem;">
      <div><span style="color: var(--text-muted);">Backend:</span> <span style="color:var(--color-teal); font-weight:600;">Online</span></div>
      <div><span style="color: var(--text-muted);">Versão:</span> ${health.version || '1.0.0'}</div>
      <div><span style="color: var(--text-muted);">Porta Frontend:</span> 5174</div>
      <div><span style="color: var(--text-muted);">Porta Backend:</span> 3210</div>
      <div style="grid-column: span 2; border-top: 1px solid var(--border-subtle); margin-top: 8px; padding-top: 8px;"></div>
      <div><span style="color: var(--text-muted);">Banco SQLite:</span> ${dbStatus}</div>
      <div><span style="color: var(--text-muted);">Tamanho DB:</span> ${health.database?.size || '-'}</div>
      <div><span style="color: var(--text-muted);">Pasta Backups:</span> ${backupFolder}</div>
      <div><span style="color: var(--text-muted);">Checagem:</span> ${health.time || '-'}</div>
    </div>
  `;
}

// ═══════════════════════════════════════
// PREENCHER FORMULÁRIOS
// ═══════════════════════════════════════

function preencherFormularios() {
  // Trabalho
  const selectTrabalhoEmpresa = document.getElementById('cfg-trabalho-empresa');
  if (selectTrabalhoEmpresa) {
    selectTrabalhoEmpresa.innerHTML = empresas.filter(e => e.ativa === 1).map(e => `<option value="${e.nome}" ${configAtual.ultima_empresa_trabalho === e.nome ? 'selected' : ''}>${e.nome}</option>`).join('');
  }
  
  const chkEdicao = document.getElementById('cfg-trabalho-edicao');
  if (chkEdicao) chkEdicao.checked = configAtual.permitir_edicao_historica === 'true';
  
  const txtWpp = document.getElementById('cfg-trabalho-whatsapp');
  if (txtWpp) txtWpp.value = configAtual.template_whatsapp_trabalho || '';

  // Dr. Ranon / RX
  const numPrecoRanon = document.getElementById('cfg-ranon-preco');
  if (numPrecoRanon) numPrecoRanon.value = configAtual.preco_padrao_ranon || '2.00';
  
  const txtChavePix = document.getElementById('cfg-ranon-pix');
  if (txtChavePix) txtChavePix.value = configAtual.chave_pix || 'ronnanpc@gmail.com';
  
  const selMesRanon = document.getElementById('cfg-ranon-mes');
  if (selMesRanon) selMesRanon.value = configAtual.mes_referencia_ranon_padrao || 'mes_anterior';

  // Finanças
  const txtConta = document.getElementById('cfg-fin-conta');
  if (txtConta) txtConta.value = configAtual.conta_padrao || 'Principal';
  
  const selForma = document.getElementById('cfg-fin-forma');
  if (selForma) selForma.value = configAtual.forma_pagamento_padrao || 'Pix';
  
  const selStatusGasto = document.getElementById('cfg-fin-status-gasto');
  if (selStatusGasto) selStatusGasto.value = configAtual.status_padrao_gasto || 'pago';
  
  const selStatusReceita = document.getElementById('cfg-fin-status-receita');
  if (selStatusReceita) selStatusReceita.value = configAtual.status_padrao_receita || 'recebido';
  
  const numDiaMes = document.getElementById('cfg-fin-dia-mes');
  if (numDiaMes) numDiaMes.value = configAtual.dia_inicio_mes_financeiro || '1';

  // Aparência
  const selCor = document.getElementById('cfg-apa-cor');
  if (selCor) selCor.value = configAtual.cor_principal || 'teal';
  
  const selDensidade = document.getElementById('cfg-apa-densidade');
  if (selDensidade) selDensidade.value = configAtual.densidade_interface || 'confortavel';

}

// ═══════════════════════════════════════
// SALVAR CONFIGURAÇÕES
// ═══════════════════════════════════════

window.salvarConfigGeral = async function(btn, section) {
  const originalHtml = btn.innerHTML;
  btn.innerHTML = 'Salvando...';
  btn.disabled = true;

  try {
    const promises = [];
    
    if (section === 'trabalho') {
      const empresa = document.getElementById('cfg-trabalho-empresa').value;
      const edicao = document.getElementById('cfg-trabalho-edicao').checked ? 'true' : 'false';
      const wpp = document.getElementById('cfg-trabalho-whatsapp').value;
      promises.push(fetchAPI('/configuracoes', { method: 'POST', body: JSON.stringify({ chave: 'ultima_empresa_trabalho', valor: empresa }) }));
      promises.push(fetchAPI('/configuracoes', { method: 'POST', body: JSON.stringify({ chave: 'permitir_edicao_historica', valor: edicao }) }));
      promises.push(fetchAPI('/configuracoes', { method: 'POST', body: JSON.stringify({ chave: 'template_whatsapp_trabalho', valor: wpp }) }));
    } 
    else if (section === 'ranon') {
      const preco = document.getElementById('cfg-ranon-preco').value;
      const pix = document.getElementById('cfg-ranon-pix').value;
      const mes = document.getElementById('cfg-ranon-mes').value;
      promises.push(fetchAPI('/configuracoes', { method: 'POST', body: JSON.stringify({ chave: 'preco_padrao_ranon', valor: preco }) }));
      promises.push(fetchAPI('/configuracoes', { method: 'POST', body: JSON.stringify({ chave: 'chave_pix', valor: pix }) }));
      promises.push(fetchAPI('/configuracoes', { method: 'POST', body: JSON.stringify({ chave: 'mes_referencia_ranon_padrao', valor: mes }) }));
    }
    else if (section === 'financas') {
      const conta = document.getElementById('cfg-fin-conta').value;
      const forma = document.getElementById('cfg-fin-forma').value;
      const sgasto = document.getElementById('cfg-fin-status-gasto').value;
      const sreceita = document.getElementById('cfg-fin-status-receita').value;
      const dia = document.getElementById('cfg-fin-dia-mes').value;
      promises.push(fetchAPI('/configuracoes', { method: 'POST', body: JSON.stringify({ chave: 'conta_padrao', valor: conta }) }));
      promises.push(fetchAPI('/configuracoes', { method: 'POST', body: JSON.stringify({ chave: 'forma_pagamento_padrao', valor: forma }) }));
      promises.push(fetchAPI('/configuracoes', { method: 'POST', body: JSON.stringify({ chave: 'status_padrao_gasto', valor: sgasto }) }));
      promises.push(fetchAPI('/configuracoes', { method: 'POST', body: JSON.stringify({ chave: 'status_padrao_receita', valor: sreceita }) }));
      promises.push(fetchAPI('/configuracoes', { method: 'POST', body: JSON.stringify({ chave: 'dia_inicio_mes_financeiro', valor: dia }) }));
    }
    else if (section === 'aparencia') {
      const cor = document.getElementById('cfg-apa-cor').value;
      const densidade = document.getElementById('cfg-apa-densidade').value;
      promises.push(fetchAPI('/configuracoes', { method: 'POST', body: JSON.stringify({ chave: 'cor_principal', valor: cor }) }));
      promises.push(fetchAPI('/configuracoes', { method: 'POST', body: JSON.stringify({ chave: 'densidade_interface', valor: densidade }) }));
    }


    await Promise.all(promises);
    showToast('Configurações salvas!');
    
    // Atualizar estado local
    const cfg = await fetchAPI('/configuracoes');
    configAtual = cfg || {};
  } catch (err) {
    showToast('Erro ao salvar: ' + err.message, 'error');
  } finally {
    btn.innerHTML = originalHtml;
    btn.disabled = false;
  }
};

// ═══════════════════════════════════════
// CATEGORIAS (GERENCIAMENTO)
// ═══════════════════════════════════════

function renderCategorias() {
  const tbody = document.getElementById('tbody-cfg-categorias');
  if (!tbody) return;

  const tipoFiltro = document.getElementById('cfg-filtro-categoria-tipo').value;
  let catsList = categorias;
  if (tipoFiltro !== 'todas') {
    catsList = categorias.filter(c => c.tipo === tipoFiltro || c.tipo === 'ambos');
  }

  if (catsList.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">Nenhuma categoria encontrada.</td></tr>';
    return;
  }

  let html = '';
  catsList.forEach(c => {
    const stt = c.ativa === 1 ? '<span style="color:var(--color-teal); font-weight:600; font-size:0.8rem; text-transform:uppercase;">Ativa</span>' : '<span style="color:var(--color-red); font-weight:600; font-size:0.8rem; text-transform:uppercase;">Inativa</span>';
    const cor = c.cor || 'var(--text-muted)';
    
    html += `
      <tr style="opacity: ${c.ativa === 1 ? '1' : '0.5'}">
        <td><div style="width: 16px; height: 16px; border-radius: 50%; background: ${cor};"></div></td>
        <td style="font-weight: 500;">${c.nome}</td>
        <td>${c.tipo}</td>
        <td>${stt}</td>
        <td>
          <div style="display: flex; gap: 8px;">
            <button class="btn-icon" onclick="window.editarCategoria(${c.id})" title="Editar"><i data-lucide="edit-2"></i></button>
            ${c.ativa === 1 
              ? `<button class="btn-icon" style="color: var(--color-red);" onclick="window.desativarCategoria(${c.id})" title="Desativar"><i data-lucide="x-circle"></i></button>`
              : `<button class="btn-icon" style="color: var(--color-teal);" onclick="window.ativarCategoria(${c.id})" title="Ativar"><i data-lucide="check-circle"></i></button>`}
          </div>
        </td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
  lucide.createIcons();
}

window.filtrarCategorias = function() {
  renderCategorias();
};

window.abrirModalNovaCategoria = function() {
  document.getElementById('modal-cat-id').value = '';
  document.getElementById('modal-cat-nome').value = '';
  document.getElementById('modal-cat-tipo').value = 'gasto';
  document.getElementById('modal-cat-cor').value = '#94a3b8';
  document.getElementById('modal-cat-titulo').textContent = 'Nova Categoria';
  document.getElementById('modal-categoria').style.display = 'flex';
};

window.editarCategoria = function(id) {
  const c = categorias.find(x => x.id === id);
  if (!c) return;
  document.getElementById('modal-cat-id').value = c.id;
  document.getElementById('modal-cat-nome').value = c.nome;
  document.getElementById('modal-cat-tipo').value = c.tipo;
  document.getElementById('modal-cat-cor').value = c.cor || '#94a3b8';
  document.getElementById('modal-cat-titulo').textContent = 'Editar Categoria';
  document.getElementById('modal-categoria').style.display = 'flex';
};

window.fecharModalCategoria = function() {
  document.getElementById('modal-categoria').style.display = 'none';
};

window.salvarCategoria = async function() {
  const id = document.getElementById('modal-cat-id').value;
  const nome = document.getElementById('modal-cat-nome').value;
  const tipo = document.getElementById('modal-cat-tipo').value;
  const cor = document.getElementById('modal-cat-cor').value;

  if (!nome || !tipo) {
    showToast('Preencha nome e tipo!', 'error');
    return;
  }

  try {
    if (id) {
      await fetchAPI(`/financas/categorias/${id}`, { method: 'PUT', body: JSON.stringify({ nome, tipo, cor }) });
      showToast('Categoria atualizada!');
    } else {
      await fetchAPI('/financas/categorias', { method: 'POST', body: JSON.stringify({ nome, tipo, cor }) });
      showToast('Categoria criada!');
    }
    fecharModalCategoria();
    categorias = await fetchAPI('/financas/categorias?todas=true');
    renderCategorias();
  } catch (err) {
    showToast('Erro ao salvar: ' + err.message, 'error');
  }
};

window.desativarCategoria = async function(id) {
  if (!confirm('Deseja desativar esta categoria? Ela não aparecerá em novos lançamentos.')) return;
  try {
    await fetchAPI(`/financas/categorias/${id}/desativar`, { method: 'POST' });
    showToast('Categoria desativada.');
    categorias = await fetchAPI('/financas/categorias?todas=true');
    renderCategorias();
  } catch (err) {
    showToast('Erro ao desativar: ' + err.message, 'error');
  }
};

window.ativarCategoria = async function(id) {
  try {
    await fetchAPI(`/financas/categorias/${id}/ativar`, { method: 'POST' });
    showToast('Categoria ativada.');
    categorias = await fetchAPI('/financas/categorias?todas=true');
    renderCategorias();
  } catch (err) {
    showToast('Erro ao ativar: ' + err.message, 'error');
  }
};


// ═══════════════════════════════════════
// EMPRESAS (GERENCIAMENTO)
// ═══════════════════════════════════════

function renderEmpresas() {
  const tbody = document.getElementById('tbody-cfg-empresas');
  if (!tbody) return;

  if (empresas.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">Nenhuma empresa encontrada.</td></tr>';
    return;
  }

  let html = '';
  empresas.forEach(e => {
    const stt = e.ativa === 1 ? '<span style="color:var(--color-teal); font-weight:600; font-size:0.8rem; text-transform:uppercase;">Ativa</span>' : '<span style="color:var(--color-red); font-weight:600; font-size:0.8rem; text-transform:uppercase;">Inativa</span>';
    
    html += `
      <tr style="opacity: ${e.ativa === 1 ? '1' : '0.5'}">
        <td style="font-weight: 500;">${e.nome}</td>
        <td>${e.tipo}</td>
        <td>${formatarMoedaBR(e.valor_padrao || 0)}</td>
        <td>${stt}</td>
        <td>
          <div style="display: flex; gap: 8px;">
            <button class="btn-icon" onclick="window.editarEmpresa(${e.id})" title="Editar"><i data-lucide="edit-2"></i></button>
            ${e.ativa === 1 
              ? `<button class="btn-icon" style="color: var(--color-red);" onclick="window.desativarEmpresa(${e.id})" title="Desativar"><i data-lucide="x-circle"></i></button>`
              : `<button class="btn-icon" style="color: var(--color-teal);" onclick="window.ativarEmpresa(${e.id})" title="Ativar"><i data-lucide="check-circle"></i></button>`}
          </div>
        </td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
  lucide.createIcons();
}

window.abrirModalNovaEmpresa = function() {
  document.getElementById('modal-emp-id').value = '';
  document.getElementById('modal-emp-nome').value = '';
  document.getElementById('modal-emp-tipo').value = 'laudo';
  document.getElementById('modal-emp-valor').value = '';
  document.getElementById('modal-emp-cor').value = '#10b981';
  document.getElementById('modal-emp-titulo').textContent = 'Nova Empresa';
  // Pagadores
  const selPag = document.getElementById('modal-emp-pagador');
  if (selPag) {
    const pags = window._pagadoresList || [];
    selPag.innerHTML = '<option value="">Selecione...</option>' + pags.map(p => `<option value="${p.id}">${p.nome}</option>`).join('');
  }
  document.getElementById('modal-empresa').style.display = 'flex';
};

window.editarEmpresa = function(id) {
  const e = empresas.find(x => x.id === id);
  if (!e) return;
  document.getElementById('modal-emp-id').value = e.id;
  document.getElementById('modal-emp-nome').value = e.nome;
  document.getElementById('modal-emp-tipo').value = e.tipo;
  document.getElementById('modal-emp-valor').value = e.valor_padrao || '';
  document.getElementById('modal-emp-cor').value = e.cor || '#10b981';
  document.getElementById('modal-emp-titulo').textContent = 'Editar Empresa';
  // Pagadores
  const selPag = document.getElementById('modal-emp-pagador');
  if (selPag) {
    const pags = window._pagadoresList || [];
    selPag.innerHTML = '<option value="">Selecione...</option>' + pags.map(p => `<option value="${p.id}" ${e.pagador_id === p.id ? 'selected' : ''}>${p.nome}</option>`).join('');
  }
  document.getElementById('modal-empresa').style.display = 'flex';
};

window.fecharModalEmpresa = function() {
  document.getElementById('modal-empresa').style.display = 'none';
};

window.salvarEmpresa = async function() {
  const id = document.getElementById('modal-emp-id').value;
  const nome = document.getElementById('modal-emp-nome').value;
  const tipo = document.getElementById('modal-emp-tipo').value;
  const valor_padrao = parseFloat(document.getElementById('modal-emp-valor').value) || 0;
  const cor = document.getElementById('modal-emp-cor').value;

  if (!nome || !tipo) {
    showToast('Preencha nome e tipo!', 'error');
    return;
  }

  try {
    // O modal atual não tem campos para ícone ou observação, 
    // mas enviamos default ou vazio conforme o requisito para não quebrar a tipagem estrita
    const payload = { 
      nome, 
      tipo, 
      valor_padrao, 
      cor,
      icone: "",
      observacao: "",
      ativa: true,
      pagador_id: parseInt(document.getElementById('modal-emp-pagador')?.value) || null
    };

    console.log("SALVAR EMPRESA URL:", id ? `/empresas/${id}` : '/empresas');
    console.log("SALVAR EMPRESA METHOD:", id ? 'PUT' : 'POST');
    console.log("SALVAR EMPRESA PAYLOAD:", payload);
    console.log("SALVAR EMPRESA ID:", id);

    if (id) {
      await fetchAPI(`/empresas/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      showToast('Empresa atualizada!');
    } else {
      await fetchAPI('/empresas', { method: 'POST', body: JSON.stringify(payload) });
      showToast('Empresa criada!');
    }
    fecharModalEmpresa();
    empresas = await fetchAPI('/empresas?todas=true');
    renderEmpresas();
  } catch (err) {
    showToast('Erro ao salvar: ' + err.message, 'error');
  }
};

window.desativarEmpresa = async function(id) {
  if (!confirm('Deseja desativar esta empresa? Ela não aparecerá em novos lançamentos (exceto se for Ranon via módulo específico).')) return;
  try {
    await fetchAPI(`/empresas/${id}/desativar`, { method: 'POST' });
    showToast('Empresa desativada.');
    empresas = await fetchAPI('/empresas?todas=true');
    renderEmpresas();
  } catch (err) {
    showToast('Erro ao desativar: ' + err.message, 'error');
  }
};

window.ativarEmpresa = async function(id) {
  try {
    await fetchAPI(`/empresas/${id}/ativar`, { method: 'POST' });
    showToast('Empresa ativada.');
    empresas = await fetchAPI('/empresas?todas=true');
    renderEmpresas();
  } catch (err) {
    showToast('Erro ao ativar: ' + err.message, 'error');
  }
};


// ═══════════════════════════════════════
// PAGADORES (GERENCIAMENTO)
// ═══════════════════════════════════════

function renderPagadores() {
  const tbody = document.getElementById('tbody-cfg-pagadores');
  if (!tbody) return;

  const pagsList = window._pagadoresList || [];
  if (pagsList.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Nenhum pagador encontrado.</td></tr>';
    return;
  }

  let html = '';
  pagsList.forEach(p => {
    const stt = p.ativo === 1 ? '<span style="color:var(--color-teal); font-weight:600; font-size:0.8rem; text-transform:uppercase;">Ativo</span>' : '<span style="color:var(--color-red); font-weight:600; font-size:0.8rem; text-transform:uppercase;">Inativo</span>';
    
    html += `
      <tr style="opacity: ${p.ativo === 1 ? '1' : '0.5'}">
        <td style="font-weight: 500;">${p.nome}</td>
        <td>${p.tipo_pessoa || '-'}</td>
        <td>${p.tipo_recebimento || '-'}</td>
        <td>${p.conta_destino || '-'}</td>
        <td>${stt}</td>
        <td>
          <div style="display: flex; gap: 8px;">
            <button class="btn-icon" onclick="window.editarPagador(${p.id})" title="Editar"><i data-lucide="edit-2"></i></button>
            ${p.ativo === 1 
              ? `<button class="btn-icon" style="color: var(--color-red);" onclick="window.desativarPagador(${p.id})" title="Desativar"><i data-lucide="x-circle"></i></button>`
              : `<button class="btn-icon" style="color: var(--color-teal);" onclick="window.ativarPagador(${p.id})" title="Ativar"><i data-lucide="check-circle"></i></button>`}
          </div>
        </td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
  if (window.lucide) window.lucide.createIcons();
}

window.abrirModalNovoPagador = function() {
  document.getElementById('modal-pag-id').value = '';
  document.getElementById('modal-pag-nome').value = '';
  document.getElementById('modal-pag-tipo-pessoa').value = 'Outro';
  document.getElementById('modal-pag-documento').value = '';
  document.getElementById('modal-pag-email').value = '';
  document.getElementById('modal-pag-telefone').value = '';
  document.getElementById('modal-pag-tipo-recebimento').value = 'A definir';
  document.getElementById('modal-pag-conta-destino').value = 'A definir';
  document.getElementById('modal-pag-observacao').value = '';
  document.getElementById('modal-pag-titulo').textContent = 'Novo Pagador';
  document.getElementById('modal-pagador').style.display = 'flex';
};

window.editarPagador = function(id) {
  const p = (window._pagadoresList || []).find(x => x.id === id);
  if (!p) return;
  document.getElementById('modal-pag-id').value = p.id;
  document.getElementById('modal-pag-nome').value = p.nome;
  document.getElementById('modal-pag-tipo-pessoa').value = p.tipo_pessoa || 'Outro';
  document.getElementById('modal-pag-documento').value = p.documento || '';
  document.getElementById('modal-pag-email').value = p.email || '';
  document.getElementById('modal-pag-telefone').value = p.telefone || '';
  document.getElementById('modal-pag-tipo-recebimento').value = p.tipo_recebimento || 'A definir';
  document.getElementById('modal-pag-conta-destino').value = p.conta_destino || 'A definir';
  document.getElementById('modal-pag-observacao').value = p.observacao || '';
  document.getElementById('modal-pag-titulo').textContent = 'Editar Pagador';
  document.getElementById('modal-pagador').style.display = 'flex';
};

window.fecharModalPagador = function() {
  document.getElementById('modal-pagador').style.display = 'none';
};

window.salvarPagador = async function() {
  const id = document.getElementById('modal-pag-id').value;
  const payload = {
    nome: document.getElementById('modal-pag-nome').value,
    tipo_pessoa: document.getElementById('modal-pag-tipo-pessoa').value,
    documento: document.getElementById('modal-pag-documento').value,
    email: document.getElementById('modal-pag-email').value,
    telefone: document.getElementById('modal-pag-telefone').value,
    tipo_recebimento: document.getElementById('modal-pag-tipo-recebimento').value,
    conta_destino: document.getElementById('modal-pag-conta-destino').value,
    observacao: document.getElementById('modal-pag-observacao').value
  };

  if (!payload.nome) {
    showToast('Preencha o nome do pagador!', 'error');
    return;
  }

  try {
    if (id) {
      await fetchAPI(`/pagadores/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      showToast('Pagador atualizado!');
    } else {
      await fetchAPI('/pagadores', { method: 'POST', body: JSON.stringify(payload) });
      showToast('Pagador criado!');
    }
    fecharModalPagador();
    window._pagadoresList = await fetchAPI('/pagadores/todos');
    renderPagadores();
  } catch (err) {
    showToast('Erro ao salvar pagador: ' + err.message, 'error');
  }
};

window.desativarPagador = async function(id) {
  if (!confirm('Deseja desativar este pagador?')) return;
  try {
    await fetchAPI(`/pagadores/${id}/desativar`, { method: 'POST' });
    showToast('Pagador desativado.');
    window._pagadoresList = await fetchAPI('/pagadores/todos');
    renderPagadores();
  } catch (err) {
    showToast('Erro ao desativar: ' + err.message, 'error');
  }
};

window.ativarPagador = async function(id) {
  try {
    await fetchAPI(`/pagadores/${id}/ativar`, { method: 'POST' });
    showToast('Pagador ativado.');
    window._pagadoresList = await fetchAPI('/pagadores/todos');
    renderPagadores();
  } catch (err) {
    showToast('Erro ao ativar: ' + err.message, 'error');
  }
};

// ═══════════════════════════════════════
// ESTRUTURA HTML
// ═══════════════════════════════════════

export function renderConfiguracoesPage() {


  let h = '';

  h += '<div id="toast-container" class="toast-container"></div>';

  h += '<div class="page-header animate-in">';
  h += '  <h1 class="page-header__title">Configurações</h1>';
  h += '  <p class="page-header__subtitle">Ajuste empresas, categorias, valores padrão e preferências do sistema.</p>';
  h += '</div>';

  h += '<div class="dashboard-grid animate-in" style="grid-template-columns: 1fr; gap: 24px;">';

  // --- GERAL & DIAGNÓSTICO ---
  h += '  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 24px;">';
  
  h += '    <div class="form-card" style="padding: 24px;">';
  h += '      <h3 style="font-weight: 600; color: var(--text-primary); margin-bottom: 24px;">Geral</h3>';
  h += '      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">';
  h += '        <div class="form-group">';
  h += '          <label class="form-label">Nome do Sistema</label>';
  h += '          <input type="text" class="form-control" value="Puzoto Life" disabled>';
  h += '        </div>';
  h += '        <div class="form-group">';
  h += '          <label class="form-label">Versão</label>';
  h += '          <input type="text" class="form-control" value="v1.0.0" disabled>';
  h += '        </div>';
  h += '      </div>';
  h += '    </div>';

  h += '    <div class="form-card" style="padding: 24px;">';
  h += '      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">';
  h += '        <h3 style="font-weight: 600; color: var(--text-primary);">Diagnóstico do Sistema</h3>';
  h += '        <button id="btn-diagnostico" class="btn-secondary" style="padding: 6px 12px; font-size: 0.8rem;" onclick="window.atualizarDiagnostico()"><i data-lucide="refresh-cw"></i> Verificar novamente</button>';
  h += '      </div>';
  h += '      <div id="diagnostico-container" style="min-height: 120px; display: flex; align-items: center; justify-content: center; color: var(--text-muted);"><i data-lucide="loader" class="spin"></i> Carregando...</div>';
  h += '    </div>';
  
  h += '  </div>';

  // --- TRABALHO E DR. RANON (Lado a lado em telas maiores) ---
  h += '  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 24px;">';
  
  // TRABALHO
  h += '    <div class="form-card" style="padding: 24px;">';
  h += '      <h3 style="font-weight: 600; color: var(--text-primary); margin-bottom: 24px;">Trabalho</h3>';
  h += '      <div class="form-group" style="margin-bottom: 16px;">';
  h += '        <label class="form-label">Última empresa selecionada (Lançamentos)</label>';
  h += '        <select id="cfg-trabalho-empresa" class="form-control"></select>';
  h += '      </div>';
  h += '      <div class="form-group" style="margin-bottom: 16px;">';
  h += '        <label style="display: flex; align-items: center; gap: 8px; color: var(--text-primary); font-size: 0.9rem; cursor: pointer;">';
  h += '          <input type="checkbox" id="cfg-trabalho-edicao"> Permitir edição de lançamentos e dias já fechados (Histórico)';
  h += '        </label>';
  h += '      </div>';
  h += '      <div class="form-group" style="margin-bottom: 24px;">';
  h += '        <label class="form-label">Template WhatsApp (Resumo Diário)</label>';
  h += '        <textarea id="cfg-trabalho-whatsapp" class="form-control" rows="3" placeholder="Ex: Olá, resumo de hoje: {total}"></textarea>';
  h += '      </div>';
  h += '      <button class="btn-primary" onclick="window.salvarConfigGeral(this, \'trabalho\')" style="width: 100%; justify-content: center;">Salvar Trabalho</button>';
  h += '    </div>';

  // DR. RANON
  h += '    <div class="form-card" style="padding: 24px;">';
  h += '      <h3 style="font-weight: 600; color: var(--text-primary); margin-bottom: 24px;">Dr. Ranon / RX</h3>';
  h += '      <div class="form-group" style="margin-bottom: 16px;">';
  h += '        <label class="form-label">Preço padrão do laudo (R$)</label>';
  h += '        <input type="number" id="cfg-ranon-preco" class="form-control" step="0.01">';
  h += '      </div>';
  h += '      <div class="form-group" style="margin-bottom: 16px;">';
  h += '        <label class="form-label">Chave PIX (Excel)</label>';
  h += '        <input type="text" id="cfg-ranon-pix" class="form-control">';
  h += '      </div>';
  h += '      <div class="form-group" style="margin-bottom: 24px;">';
  h += '        <label class="form-label">Mês de referência padrão</label>';
  h += '        <select id="cfg-ranon-mes" class="form-control">';
  h += '          <option value="mes_atual">Mês Atual</option>';
  h += '          <option value="mes_anterior">Mês Anterior</option>';
  h += '        </select>';
  h += '      </div>';
  h += '      <button class="btn-primary" onclick="window.salvarConfigGeral(this, \'ranon\')" style="width: 100%; justify-content: center;">Salvar Dr. Ranon / RX</button>';
  h += '    </div>';
  
  h += '  </div>';

  // --- FINANÇAS E APARÊNCIA ---
  h += '  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 24px;">';
  
  // FINANÇAS
  h += '    <div class="form-card" style="padding: 24px;">';
  h += '      <h3 style="font-weight: 600; color: var(--text-primary); margin-bottom: 24px;">Finanças</h3>';
  h += '      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">';
  h += '        <div class="form-group">';
  h += '          <label class="form-label">Conta/Carteira Padrão</label>';
  h += '          <input type="text" id="cfg-fin-conta" class="form-control">';
  h += '        </div>';
  h += '        <div class="form-group">';
  h += '          <label class="form-label">Forma de Pgto. Padrão</label>';
  h += '          <select id="cfg-fin-forma" class="form-control">';
  h += '            <option value="Pix">Pix</option><option value="Débito">Débito</option><option value="Dinheiro">Dinheiro</option><option value="Crédito">Crédito</option><option value="Boleto">Boleto</option><option value="Transferência">Transferência</option><option value="Outro">Outro</option>';
  h += '          </select>';
  h += '        </div>';
  h += '      </div>';
  h += '      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">';
  h += '        <div class="form-group">';
  h += '          <label class="form-label">Status Padrão (Novo Gasto)</label>';
  h += '          <select id="cfg-fin-status-gasto" class="form-control"><option value="pago">Pago</option><option value="pendente">Pendente</option></select>';
  h += '        </div>';
  h += '        <div class="form-group">';
  h += '          <label class="form-label">Status Padrão (Nova Receita)</label>';
  h += '          <select id="cfg-fin-status-receita" class="form-control"><option value="recebido">Recebido</option><option value="previsto">Previsto</option></select>';
  h += '        </div>';
  h += '      </div>';
  h += '      <div class="form-group" style="margin-bottom: 24px;">';
  h += '        <label class="form-label">Dia de início do mês financeiro (1 a 31)</label>';
  h += '        <input type="number" id="cfg-fin-dia-mes" class="form-control" min="1" max="31">';
  h += '      </div>';
  h += '      <button class="btn-primary" onclick="window.salvarConfigGeral(this, \'financas\')" style="width: 100%; justify-content: center;">Salvar Finanças</button>';
  h += '    </div>';

  // APARÊNCIA
  h += '    <div class="form-card" style="padding: 24px;">';
  h += '      <h3 style="font-weight: 600; color: var(--text-primary); margin-bottom: 24px;">Aparência</h3>';
  h += '      <div class="form-group" style="margin-bottom: 16px;">';
  h += '        <label class="form-label">Tema</label>';
  h += '        <select class="form-control" disabled><option>Dark Premium</option></select>';
  h += '      </div>';
  h += '      <div class="form-group" style="margin-bottom: 16px;">';
  h += '        <label class="form-label">Cor Principal</label>';
  h += '        <select id="cfg-apa-cor" class="form-control">';
  h += '          <option value="teal">Teal (Padrão)</option>';
  h += '          <option value="azul">Azul</option>';
  h += '          <option value="roxo">Roxo</option>';
  h += '        </select>';
  h += '      </div>';
  h += '      <div class="form-group" style="margin-bottom: 24px;">';
  h += '        <label class="form-label">Densidade da Interface</label>';
  h += '        <select id="cfg-apa-densidade" class="form-control">';
  h += '          <option value="confortavel">Confortável (Padrão)</option>';
  h += '          <option value="compacta">Compacta</option>';
  h += '        </select>';
  h += '      </div>';
  h += '      <button class="btn-primary" onclick="window.salvarConfigGeral(this, \'aparencia\')" style="width: 100%; justify-content: center;">Salvar Aparência</button>';
  h += '    </div>';

  h += '  </div>';



  // --- CATEGORIAS ---
  h += '  <div class="form-card" style="padding: 24px;">';
  h += '    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">';
  h += '      <h3 style="font-weight: 600; color: var(--text-primary);">Categorias</h3>';
  h += '      <button class="btn-primary" onclick="window.abrirModalNovaCategoria()">+ Nova Categoria</button>';
  h += '    </div>';
  h += '    <div class="form-group" style="margin-bottom: 16px; max-width: 200px;">';
  h += '      <select id="cfg-filtro-categoria-tipo" class="form-control" onchange="window.filtrarCategorias()">';
  h += '        <option value="todas">Todas as categorias</option>';
  h += '        <option value="gasto">Apenas Gastos</option>';
  h += '        <option value="receita">Apenas Receitas</option>';
  h += '      </select>';
  h += '    </div>';
  h += '    <div class="table-container">';
  h += '      <table class="table">';
  h += '        <thead><tr><th>Cor</th><th>Nome</th><th>Tipo</th><th>Status</th><th>Ações</th></tr></thead>';
  h += '        <tbody id="tbody-cfg-categorias"></tbody>';
  h += '      </table>';
  h += '    </div>';
  h += '  </div>';

  // --- EMPRESAS ---
  h += '  <div class="form-card" style="padding: 24px;">';
  h += '    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">';
  h += '      <h3 style="font-weight: 600; color: var(--text-primary);">Empresas</h3>';
  h += '      <button class="btn-primary" onclick="window.abrirModalNovaEmpresa()">+ Nova Empresa</button>';
  h += '    </div>';
  h += '    <div class="table-container">';
  h += '      <table class="table">';
  h += '        <thead><tr><th>Nome</th><th>Tipo</th><th>Valor Padrão</th><th>Status</th><th>Ações</th></tr></thead>';
  h += '        <tbody id="tbody-cfg-empresas"></tbody>';
  h += '      </table>';
  h += '    </div>';
  h += '  </div>';

  // --- PAGADORES ---
  h += '  <div class="form-card" style="padding: 24px; margin-top: 24px;">';
  h += '    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">';
  h += '      <h3 style="font-weight: 600; color: var(--text-primary);">Pagadores</h3>';
  h += '      <button class="btn-primary" onclick="window.abrirModalNovoPagador()">+ Novo Pagador</button>';
  h += '    </div>';
  h += '    <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 20px;">Pagadores são as pessoas ou empresas que pagam você. Estes dados são do pagador, não da Puzoto.</p>';
  h += '    <div class="table-container">';
  h += '      <table class="table">';
  h += '        <thead><tr><th>Pagador</th><th>Tipo</th><th>Como paga</th><th title="Conta que recebe: se o pagamento cai na Conta PF ou Conta PJ Puzoto">Conta que recebe</th><th>Status</th><th>Ações</th></tr></thead>';
  h += '        <tbody id="tbody-cfg-pagadores"></tbody>';
  h += '      </table>';
  h += '    </div>';
  h += '  </div>';

  // --- ZONA DE SEGURANÇA ---
  h += '  <div class="form-card" style="padding: 24px; border-color: rgba(244, 63, 94, 0.3);">';
  h += '    <div style="display: flex; gap: 12px; align-items: flex-start;">';
  h += '      <div style="width: 40px; height: 40px; border-radius: 8px; background: var(--color-rose-dim); color: var(--color-rose); display: flex; align-items: center; justify-content: center; flex-shrink: 0;"><i data-lucide="shield-alert"></i></div>';
  h += '      <div>';
  h += '        <h3 style="font-weight: 600; color: var(--color-rose); margin-bottom: 8px;">Zona de Segurança</h3>';
  h += '        <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 16px;">Remove dados operacionais usados durante testes, mantendo configurações, empresas, categorias e backups.</p>';
  h += '        <button class="btn-primary" style="background: var(--color-rose-dim); color: var(--color-rose); border: 1px solid rgba(244, 63, 94, 0.5);" onclick="window.abrirModalLimpeza()">Limpar dados de teste</button>';
  h += '      </div>';
  h += '    </div>';
  h += '  </div>';

  h += '</div>';

  // MODAL CATEGORIA
  h += `
    <div id="modal-categoria" style="display: none; position: fixed; inset: 0; z-index: 1000; background: rgba(0,0,0,0.8); align-items: center; justify-content: center;">
      <div class="form-card" style="width: 100%; max-width: 400px; padding: 32px; background: var(--bg-main);">
        <h3 id="modal-cat-titulo" style="font-weight: 600; color: var(--text-primary); margin-bottom: 24px;">Nova Categoria</h3>
        <input type="hidden" id="modal-cat-id">
        <div class="form-group" style="margin-bottom: 16px;">
          <label class="form-label">Nome*</label>
          <input type="text" id="modal-cat-nome" class="form-control" placeholder="Ex: Alimentação">
        </div>
        <div class="form-group" style="margin-bottom: 16px;">
          <label class="form-label">Tipo*</label>
          <select id="modal-cat-tipo" class="form-control">
            <option value="gasto">Gasto</option>
            <option value="receita">Receita</option>
            <option value="ambos">Ambos</option>
          </select>
        </div>
        <div class="form-group" style="margin-bottom: 24px;">
          <label class="form-label">Cor Hexadecimal</label>
          <input type="color" id="modal-cat-cor" class="form-control" style="height: 42px; padding: 4px;">
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 12px;">
          <button class="btn-secondary" onclick="window.fecharModalCategoria()">Cancelar</button>
          <button class="btn-primary" onclick="window.salvarCategoria()">Salvar</button>
        </div>
      </div>
    </div>
  `;

  // MODAL EMPRESA
  h += `
    <div id="modal-empresa" style="display: none; position: fixed; inset: 0; z-index: 1000; background: rgba(0,0,0,0.8); align-items: center; justify-content: center;">
      <div class="form-card" style="width: 100%; max-width: 400px; padding: 32px; background: var(--bg-main);">
        <h3 id="modal-emp-titulo" style="font-weight: 600; color: var(--text-primary); margin-bottom: 24px;">Nova Empresa</h3>
        <input type="hidden" id="modal-emp-id">
        <div class="form-group" style="margin-bottom: 16px;">
          <label class="form-label">Nome*</label>
          <input type="text" id="modal-emp-nome" class="form-control" placeholder="Ex: Clínica X">
        </div>
        <div class="form-group" style="margin-bottom: 16px;">
          <label class="form-label">Tipo*</label>
          <select id="modal-emp-tipo" class="form-control">
            <option value="laudo">Laudo</option>
            <option value="plantao">Plantão</option>
            <option value="outro">Outro</option>
          </select>
        </div>
        <div class="form-group" style="margin-bottom: 16px;">
          <label class="form-label">Valor Padrão (R$)</label>
          <input type="number" id="modal-emp-valor" class="form-control" step="0.01">
        </div>
        <div class="form-group" style="margin-bottom: 24px;">
          <label class="form-label">Cor Hexadecimal</label>
          <input type="color" id="modal-emp-cor" class="form-control" style="height: 42px; padding: 4px;">
        </div>
        <div class="form-group" style="margin-bottom: 24px;">
          <label class="form-label">Pagador Responsável</label>
          <select id="modal-emp-pagador" class="form-control">
            <option value="">Selecione...</option>
          </select>
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 12px;">
          <button class="btn-secondary" onclick="window.fecharModalEmpresa()">Cancelar</button>
          <button class="btn-primary" onclick="window.salvarEmpresa()">Salvar</button>
        </div>
      </div>
    </div>
  `;

  // MODAL PAGADOR
  h += `
    <div id="modal-pagador" style="display: none; position: fixed; inset: 0; z-index: 1000; background: rgba(0,0,0,0.8); align-items: center; justify-content: center;">
      <div class="form-card" style="width: 100%; max-width: 500px; padding: 32px; background: var(--bg-main); max-height: 90vh; overflow-y: auto;">
        <h3 id="modal-pag-titulo" style="font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">Novo Pagador</h3>
        <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 20px;">Cadastre os dados de quem paga você.</p>
        
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 24px; padding: 12px; background: var(--bg-surface); border-radius: 8px; border: 1px solid var(--border-subtle);">
          <i data-lucide="info" style="width: 18px; height: 18px; color: var(--text-muted);"></i>
          <span style="color: var(--text-muted); font-size: 0.85rem;">Estes dados são do pagador. Para cadastrar seus dados ou os dados da Puzoto, use a seção Nota Fiscal / Impostos.</span>
        </div>

        <input type="hidden" id="modal-pag-id">
        
        <h4 style="font-weight:600;color:var(--text-accent);font-size:0.85rem;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px;border-bottom:1px solid var(--border-subtle);padding-bottom:6px;">1. Dados do pagador</h4>
        
        <div class="form-group" style="margin-bottom: 16px;">
          <label class="form-label">Nome do pagador*</label>
          <input type="text" id="modal-pag-nome" class="form-control" placeholder="Ex: Dr. Alexandre">
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
          <div class="form-group">
            <label class="form-label">Tipo de pessoa</label>
            <select id="modal-pag-tipo-pessoa" class="form-control">
              <option value="PF">PF</option>
              <option value="PJ">PJ</option>
              <option value="Outro">Outro</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">CPF/CNPJ do pagador</label>
            <input type="text" id="modal-pag-documento" class="form-control" placeholder="Ex: CPF ou CNPJ de quem paga">
          </div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;">
          <div class="form-group">
            <label class="form-label">E-mail do pagador</label>
            <input type="email" id="modal-pag-email" class="form-control" placeholder="Ex: financeiro@clinica.com.br">
          </div>
          <div class="form-group">
            <label class="form-label">Telefone do pagador</label>
            <input type="text" id="modal-pag-telefone" class="form-control" placeholder="Ex: WhatsApp ou contato financeiro">
          </div>
        </div>

        <h4 style="font-weight:600;color:var(--text-accent);font-size:0.85rem;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px;border-bottom:1px solid var(--border-subtle);padding-bottom:6px;">2. Regra de recebimento</h4>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
          <div class="form-group">
            <label class="form-label">Como este pagador me paga?</label>
            <select id="modal-pag-tipo-recebimento" class="form-control">
              <option value="PF sem nota">PF sem nota</option>
              <option value="PJ com nota">PJ com nota</option>
              <option value="PJ sem nota">PJ sem nota</option>
              <option value="A definir">A definir</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Onde eu recebo este pagamento?</label>
            <select id="modal-pag-conta-destino" class="form-control">
              <option value="Conta PF">Conta PF</option>
              <option value="Conta PJ Puzoto">Conta PJ Puzoto</option>
              <option value="A definir">A definir</option>
            </select>
          </div>
        </div>


        <h4 style="font-weight:600;color:var(--text-accent);font-size:0.85rem;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px;border-bottom:1px solid var(--border-subtle);padding-bottom:6px;">3. Observações</h4>

        <div class="form-group" style="margin-bottom: 24px;">
          <label class="form-label">Observações sobre este pagador</label>
          <textarea id="modal-pag-observacao" class="form-control" rows="2" placeholder="Ex: Agrupa Diagnóstico, Perfecta e E-Mail"></textarea>
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 12px;">
          <button class="btn-secondary" onclick="window.fecharModalPagador()">Cancelar</button>
          <button class="btn-primary" onclick="window.salvarPagador()">Salvar</button>
        </div>
      </div>
    </div>
  `;

  // MODAL LIMPEZA DE DADOS
  h += `
    <div id="modal-limpeza" style="display: none; position: fixed; inset: 0; z-index: 1000; background: rgba(0,0,0,0.8); align-items: center; justify-content: center;">
      <div class="form-card" style="width: 100%; max-width: 450px; padding: 32px; background: var(--bg-main); border: 1px solid var(--color-rose);">
        <h3 style="font-weight: 600; color: var(--color-rose); margin-bottom: 16px; display: flex; align-items: center; gap: 8px;">
          <i data-lucide="alert-triangle"></i> Limpar dados de teste?
        </h3>
        <p style="color: var(--text-primary); font-size: 0.95rem; margin-bottom: 16px; line-height: 1.5;">Essa ação apagará lançamentos, gastos, cartões, contas, receitas, fechamentos e demais dados operacionais. Configurações, empresas, categorias e backups serão preservados. Um backup automático será criado antes da limpeza.</p>
        
        <div style="background: var(--bg-card); padding: 16px; border-radius: 8px; border: 1px solid var(--border-subtle); margin-bottom: 24px; font-size: 0.85rem; color: var(--text-muted);">
          <ul style="list-style: disc; padding-left: 20px; display: flex; flex-direction: column; gap: 4px;">
            <li>Trabalho será limpo</li>
            <li>Finanças serão limpas</li>
            <li>Relatórios ficarão zerados</li>
            <li>Configurações serão mantidas</li>
            <li>Backups serão mantidos</li>
          </ul>
        </div>

        <div class="form-group" style="margin-bottom: 24px;">
          <label class="form-label" style="color: var(--color-rose);">Digite exatamente <strong>LIMPAR TESTES</strong> para confirmar:</label>
          <input type="text" id="input-confirma-limpeza" class="form-control" placeholder="LIMPAR TESTES" onkeyup="window.validarInputLimpeza()">
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 12px;">
          <button class="btn-secondary" onclick="window.fecharModalLimpeza()">Cancelar</button>
          <button id="btn-confirma-limpeza" class="btn-primary" style="background: var(--color-rose); color: #fff;" onclick="window.executarLimpeza()" disabled>Confirmar Limpeza</button>
        </div>
      </div>
    </div>
  `;

  return h;
}

window.abrirModalLimpeza = function() {
  document.getElementById('input-confirma-limpeza').value = '';
  document.getElementById('btn-confirma-limpeza').disabled = true;
  document.getElementById('modal-limpeza').style.display = 'flex';
  if (window.lucide) window.lucide.createIcons();
};

window.fecharModalLimpeza = function() {
  document.getElementById('modal-limpeza').style.display = 'none';
};

window.validarInputLimpeza = function() {
  const input = document.getElementById('input-confirma-limpeza').value;
  const btn = document.getElementById('btn-confirma-limpeza');
  if (input === 'LIMPAR TESTES') {
    btn.disabled = false;
  } else {
    btn.disabled = true;
  }
};

window.executarLimpeza = async function() {
  const btn = document.getElementById('btn-confirma-limpeza');
  btn.innerHTML = '<i data-lucide="loader" class="spin"></i> Limpando...';
  btn.disabled = true;
  if (window.lucide) window.lucide.createIcons();

  try {
    const data = await fetchAPI('/sistema/limpar-dados-teste', {
      method: 'POST',
      body: JSON.stringify({ confirmacao: 'LIMPAR TESTES' })
    });
    
    fecharModalLimpeza();
    
    alert(`Dados limpos com sucesso!\n\nTabelas limpas: ${data.resumo.tabelas_limpas}\nRegistros removidos: ${data.resumo.registros_removidos}\nBackup de segurança: ${data.backup_criado}\n\nO sistema está limpo. Recarregue a página ou vá para o Dashboard.`);
    
    // Recarregar configurações para atualizar resumos se houver
    await initConfiguracoes();
    
  } catch (err) {
    showToast('Erro ao limpar dados: ' + err.message, 'error');
    btn.innerHTML = 'Confirmar Limpeza';
    btn.disabled = false;
  }
};
