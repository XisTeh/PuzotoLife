import { apiFetch } from '../services/http.js';
import { formatarMoedaBR, formatarDataBR } from '../utils/formatters.js';

const API_BASE = '/api';

let previewData = null;
let historicoFechamentos = [];
let mesSelecionadoHistorico = null;
let isFechando = false;

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
  toast.innerHTML = `<i data-lucide="${type === 'success' ? 'check-circle' : (type === 'error' ? 'alert-circle' : 'info')}"></i> <span>${message}</span>`;
  container.appendChild(toast);
  lucide.createIcons();
  setTimeout(() => {
    toast.style.animation = 'slideOutRight 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards';
    setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
  }, 3000);
}

function getMesAtualInput() {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
}

function parseReferenciaVisivel(mesYYYYMM) {
  if (!mesYYYYMM) return '';
  const partes = mesYYYYMM.split('-');
  const ano = partes[0];
  const mes = parseInt(partes[1], 10);
  const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  return `${meses[mes - 1]}/${ano}`;
}

// ═══════════════════════════════════════
// INICIALIZAÇÃO
// ═══════════════════════════════════════

export async function initFechamentoMes() {
  const mesInput = document.getElementById('filtro-mes');
  if (mesInput) mesInput.value = getMesAtualInput();

  await carregarHistorico();
}

async function carregarHistorico() {
  try {
    const res = await apiFetch(`${API_BASE}/fechamentos/mensais`);
    const json = await res.json();
    if (json.ok) {
      historicoFechamentos = json.data;
      renderListaHistorico();
    }
  } catch (err) {
    showToast('Erro ao carregar histórico: ' + err.message, 'error');
  }
}

// ═══════════════════════════════════════
// PRÉVIA (NOVO FECHAMENTO)
// ═══════════════════════════════════════

window.carregarPreviaMes = async function() {
  const mesInput = document.getElementById('filtro-mes').value;
  if (!mesInput) return;

  const btn = document.getElementById('btn-carregar-previa');
  const originalHtml = btn.innerHTML;
  btn.innerHTML = '<i data-lucide="loader" class="spin"></i> Carregando...';
  lucide.createIcons();

  try {
    const res = await apiFetch(`${API_BASE}/fechamentos/mensais/preview?mes=${mesInput}`);
    const json = await res.json();

    if (!json.ok) throw new Error(json.error || 'Erro ao carregar prévia');

    previewData = json.data; // snapshot object
    renderPrevia(previewData);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.innerHTML = originalHtml;
    lucide.createIcons();
  }
}

function renderPrevia(data) {
  const container = document.getElementById('previa-container');
  if (!data) {
    container.style.display = 'none';
    return;
  }
  container.style.display = 'block';

  document.getElementById('previa-ref').textContent = parseReferenciaVisivel(document.getElementById('filtro-mes').value);
  document.getElementById('previa-qtd-global').textContent = data.qtd_global;
  document.getElementById('previa-total-global').textContent = formatarMoedaBR(data.total_global);
  
  document.getElementById('previa-qtd-diag').textContent = data.diagnostico.qtd;
  document.getElementById('previa-tot-diag').textContent = formatarMoedaBR(data.diagnostico.total);
  
  document.getElementById('previa-qtd-perf').textContent = data.perfecta.qtd;
  document.getElementById('previa-tot-perf').textContent = formatarMoedaBR(data.perfecta.total);
  
  document.getElementById('previa-qtd-email').textContent = data.email.qtd;
  document.getElementById('previa-tot-email').textContent = formatarMoedaBR(data.email.total);
  
  document.getElementById('previa-qtd-padrao').textContent = data.padrao.qtd;
  document.getElementById('previa-tot-padrao').textContent = formatarMoedaBR(data.padrao.total);
  
  document.getElementById('previa-qtd-ranon').textContent = data.ranon.qtd;
  document.getElementById('previa-tot-ranon').textContent = formatarMoedaBR(data.ranon.total);

  // Tabela
  const tbody = document.getElementById('previa-tabela-body');
  const empresas = [
    { nome: 'Diagnóstico', data: data.diagnostico },
    { nome: 'Perfecta', data: data.perfecta },
    { nome: 'E-Mail', data: data.email },
    { nome: 'Padrão', data: data.padrao },
    { nome: 'Dr. Ranon / RX', data: data.ranon }
  ];

  tbody.innerHTML = empresas.map(emp => {
    const part = data.total_global > 0 ? (emp.data.total / data.total_global) * 100 : 0;
    const ticket = emp.data.qtd > 0 ? emp.data.total / emp.data.qtd : 0;
    return `
      <tr>
        <td style="font-weight: 500;">${emp.nome}</td>
        <td style="text-align: center;">${emp.data.qtd}</td>
        <td style="text-align: right; font-weight: 600;">${formatarMoedaBR(emp.data.total)}</td>
        <td style="text-align: center;">${part.toFixed(1)}%</td>
        <td style="text-align: right; color: var(--text-secondary);">${formatarMoedaBR(ticket)}</td>
      </tr>
    `;
  }).join('');
}

window.abrirModalFechamentoMes = function() {
  if (!previewData) return;
  const mesFormatado = parseReferenciaVisivel(document.getElementById('filtro-mes').value);
  document.getElementById('modal-fechar-mes-ref').textContent = mesFormatado;
  
  // Preencher resumo no modal
  document.getElementById('modal-resumo-fechamento').innerHTML = `
    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
      <span style="color: var(--text-secondary);">Quantidade Global:</span>
      <strong style="color: var(--text-primary);">${previewData.qtd_global}</strong>
    </div>
    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
      <span style="color: var(--text-secondary);">Total Global:</span>
      <strong style="color: var(--color-teal); font-size: 1.1rem;">${formatarMoedaBR(previewData.total_global)}</strong>
    </div>
    <hr style="border: 0; border-top: 1px solid var(--border-subtle); margin: 12px 0;" />
    <div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 0.9rem;">
      <span style="color: var(--text-secondary);">Diagnóstico:</span>
      <strong style="color: var(--text-primary);">${formatarMoedaBR(previewData.diagnostico.total)}</strong>
    </div>
    <div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 0.9rem;">
      <span style="color: var(--text-secondary);">Perfecta:</span>
      <strong style="color: var(--text-primary);">${formatarMoedaBR(previewData.perfecta.total)}</strong>
    </div>
    <div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 0.9rem;">
      <span style="color: var(--text-secondary);">E-Mail:</span>
      <strong style="color: var(--text-primary);">${formatarMoedaBR(previewData.email.total)}</strong>
    </div>
    <div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 0.9rem;">
      <span style="color: var(--text-secondary);">Padrão:</span>
      <strong style="color: var(--text-primary);">${formatarMoedaBR(previewData.padrao.total)}</strong>
    </div>
    <div style="display: flex; justify-content: space-between; font-size: 0.9rem;">
      <span style="color: var(--text-secondary);">Dr. Ranon / RX:</span>
      <strong style="color: var(--text-primary);">${formatarMoedaBR(previewData.ranon.total)}</strong>
    </div>
  `;

  document.getElementById('modal-fechar-mes').classList.add('active');
}

window.fecharModalFechamentoMes = function() {
  document.getElementById('modal-fechar-mes').classList.remove('active');
}

window.confirmarFechamentoMes = async function() {
  if (isFechando || !previewData) return;
  isFechando = true;

  const btn = document.getElementById('btn-confirmar-fechamento');
  const originalHtml = btn.innerHTML;
  btn.innerHTML = '<i data-lucide="loader" class="spin"></i> Fechando...';
  lucide.createIcons();

  try {
    const mesFormatado = parseReferenciaVisivel(document.getElementById('filtro-mes').value);
    const mesYYYYMM = document.getElementById('filtro-mes').value;
    
    const res = await apiFetch(`${API_BASE}/fechamentos/mensal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mes: mesYYYYMM, referencia: mesFormatado })
    });

    const json = await res.json();

    if (!json.ok) {
      if (json.data && json.data.mensagem) {
         throw new Error(json.data.mensagem);
      }
      throw new Error(json.error || 'Erro ao fechar mês');
    }

    showToast('Mês fechado com sucesso!', 'success');
    window.fecharModalFechamentoMes();
    previewData = null;
    renderPrevia(null);
    await carregarHistorico();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    isFechando = false;
    btn.innerHTML = originalHtml;
    lucide.createIcons();
  }
}

// ═══════════════════════════════════════
// HISTÓRICO
// ═══════════════════════════════════════

function renderListaHistorico() {
  const container = document.getElementById('historico-lista-container');
  if (!container) return;

  if (historicoFechamentos.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="min-height: 200px; padding: 20px;">
        <i data-lucide="calendar" style="width: 48px; height: 48px; color: var(--text-muted); margin-bottom: 16px;"></i>
        <h4 style="color: var(--text-primary); margin-bottom: 8px;">Nenhum mês fechado ainda.</h4>
        <p style="color: var(--text-muted); font-size: 0.9rem; max-width: 300px; text-align: center;">Faça seus lançamentos, salve seus laudos e grave o fechamento mensal para criar seu primeiro snapshot.</p>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  container.innerHTML = historicoFechamentos.map(f => `
    <div class="alert-item" style="cursor: pointer; display: flex; justify-content: space-between; align-items: center;" onclick="window.selecionarMesHistorico(${f.id})">
      <div>
        <div class="alert-item__title">${f.referencia}</div>
        <div class="alert-item__desc">Fechado em: ${formatarDataBR(f.fechado_em.split(' ')[0])}</div>
      </div>
      <div style="text-align: right;">
        <div style="font-weight: 700; color: var(--color-teal);">${formatarMoedaBR(f.total_global)}</div>
        <div style="font-size: 0.8rem; color: var(--text-secondary);">${f.qtd_global} laudos</div>
      </div>
    </div>
  `).join('');
}

window.selecionarMesHistorico = function(id) {
  const f = historicoFechamentos.find(x => x.id === id);
  if (!f) return;
  mesSelecionadoHistorico = f;
  
  document.getElementById('detalhe-historico').style.display = 'block';
  document.getElementById('detalhe-ref').textContent = f.referencia;
  
  // Preencher cards do detalhe
  document.getElementById('det-qtd-global').textContent = f.qtd_global;
  document.getElementById('det-tot-global').textContent = formatarMoedaBR(f.total_global);
  
  document.getElementById('det-qtd-diag').textContent = f.qtd_diagnostico;
  document.getElementById('det-tot-diag').textContent = formatarMoedaBR(f.total_diagnostico);
  
  document.getElementById('det-qtd-perf').textContent = f.qtd_perfecta;
  document.getElementById('det-tot-perf').textContent = formatarMoedaBR(f.total_perfecta);
  
  document.getElementById('det-qtd-email').textContent = f.qtd_email;
  document.getElementById('det-tot-email').textContent = formatarMoedaBR(f.total_email);
  
  document.getElementById('det-qtd-padrao').textContent = f.qtd_padrao;
  document.getElementById('det-tot-padrao').textContent = formatarMoedaBR(f.total_padrao);
  
  document.getElementById('det-qtd-ranon').textContent = f.qtd_ranon;
  document.getElementById('det-tot-ranon').textContent = formatarMoedaBR(f.total_ranon);

  // Tabela detalhe
  const tbody = document.getElementById('det-tabela-body');
  const empresas = [
    { nome: 'Diagnóstico', qtd: f.qtd_diagnostico, total: f.total_diagnostico },
    { nome: 'Perfecta', qtd: f.qtd_perfecta, total: f.total_perfecta },
    { nome: 'E-Mail', qtd: f.qtd_email, total: f.total_email },
    { nome: 'Padrão', qtd: f.qtd_padrao, total: f.total_padrao },
    { nome: 'Dr. Ranon / RX', qtd: f.qtd_ranon, total: f.total_ranon }
  ];

  tbody.innerHTML = empresas.map(emp => {
    const part = f.total_global > 0 ? (emp.total / f.total_global) * 100 : 0;
    const ticket = emp.qtd > 0 ? emp.total / emp.qtd : 0;
    return `
      <tr>
        <td style="font-weight: 500;">${emp.nome}</td>
        <td style="text-align: center;">${emp.qtd}</td>
        <td style="text-align: right; font-weight: 600;">${formatarMoedaBR(emp.total)}</td>
        <td style="text-align: center;">${part.toFixed(1)}%</td>
        <td style="text-align: right; color: var(--text-secondary);">${formatarMoedaBR(ticket)}</td>
      </tr>
    `;
  }).join('');

  // Limpar campos de ajuste retroativo
  const inputQtd = document.getElementById('inline-ajuste-qtd');
  if(inputQtd) inputQtd.value = '1';
  const inputValor = document.getElementById('inline-ajuste-valor');
  if(inputValor) inputValor.value = '3.00';
  const selectEmpresa = document.getElementById('inline-ajuste-empresa');
  if(selectEmpresa) selectEmpresa.value = 'Padrão';
  const inputObs = document.getElementById('inline-ajuste-obs');
  if(inputObs) inputObs.value = '';

  // Carregar histórico de ajustes
  carregarListaAjustesRetroativos(f.referencia);
}
// ═══════════════════════════════════════
// ═══════════════════════════════════════
// AJUSTE RETROATIVO DE QUALQUER CLÍNICA
// ═══════════════════════════════════════

let valoresAjustePendente = null;

window.aoMudarEmpresaAjuste = function() {
  const empresa = document.getElementById('inline-ajuste-empresa').value;
  const inputValor = document.getElementById('inline-ajuste-valor');
  if (inputValor) {
    if (empresa === 'Dr. Ranon / RX') {
      inputValor.value = '1.00';
    } else {
      inputValor.value = '3.00';
    }
  }
}

window.prepararAjusteRetroativo = function() {
  if (!mesSelecionadoHistorico) return;

  const empresa = document.getElementById('inline-ajuste-empresa').value;
  const qtd = parseInt(document.getElementById('inline-ajuste-qtd').value);
  const valor = parseFloat(document.getElementById('inline-ajuste-valor').value);
  const obs = document.getElementById('inline-ajuste-obs')?.value || '';

  if (!empresa) {
    showToast('Selecione uma clínica.', 'error');
    return;
  }
  if (isNaN(qtd) || qtd <= 0) {
    showToast('Preencha a quantidade (maior que zero).', 'error');
    return;
  }
  if (isNaN(valor) || valor < 0) {
    showToast('Preencha o valor unitário (maior ou igual a zero).', 'error');
    return;
  }

  const totalAjuste = qtd * valor;
  
  // Calcular o novo total previsto para a clínica selecionada
  let novoTotalEmpresa = 0;
  if (empresa === 'Diagnóstico') novoTotalEmpresa = mesSelecionadoHistorico.total_diagnostico + totalAjuste;
  else if (empresa === 'Perfecta') novoTotalEmpresa = mesSelecionadoHistorico.total_perfecta + totalAjuste;
  else if (empresa === 'E-Mail') novoTotalEmpresa = mesSelecionadoHistorico.total_email + totalAjuste;
  else if (empresa === 'Padrão') novoTotalEmpresa = mesSelecionadoHistorico.total_padrao + totalAjuste;
  else if (empresa === 'Dr. Ranon / RX') novoTotalEmpresa = mesSelecionadoHistorico.total_ranon + totalAjuste;

  const novoTotalGlobal = mesSelecionadoHistorico.total_global + totalAjuste;

  valoresAjustePendente = { empresa, qtd, valor, obs, totalAjuste };

  // Preencher modal de confirmação
  document.getElementById('modal-conf-ajuste-ref').textContent = mesSelecionadoHistorico.referencia;
  
  const htmlResumo = [
    '<div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 0.95rem;">',
    '<span style="color: var(--text-secondary);">Clínica:</span>',
    '<strong style="color: var(--text-primary);">' + empresa + '</strong>',
    '</div>',
    '<div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 0.95rem;">',
    '<span style="color: var(--text-secondary);">Quantidade Adicionada:</span>',
    '<strong style="color: var(--text-primary);">' + qtd + ' exame(s)</strong>',
    '</div>',
    '<div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 0.95rem;">',
    '<span style="color: var(--text-secondary);">Valor Unitário:</span>',
    '<strong style="color: var(--text-primary);">' + formatarMoedaBR(valor) + '</strong>',
    '</div>',
    '<div style="display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 0.95rem;">',
    '<span style="color: var(--text-secondary);">Total do Ajuste:</span>',
    '<strong style="color: var(--color-teal);">' + formatarMoedaBR(totalAjuste) + '</strong>',
    '</div>',
    obs ? '<div style="margin-bottom: 12px; font-size: 0.85rem; color: var(--text-secondary); font-style: italic; background: var(--bg-card); padding: 8px; border-radius: 4px; border: 1px solid var(--border-subtle);">Observação: ' + obs + '</div>' : '',
    '<hr style="border: 0; border-top: 1px dashed var(--border-subtle); margin: 12px 0;" />',
    '<div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 0.9rem;">',
    '<span style="color: var(--text-secondary);">Novo Total da Clínica (' + empresa + '):</span>',
    '<strong style="color: var(--text-primary);">' + formatarMoedaBR(novoTotalEmpresa) + '</strong>',
    '</div>',
    '<div style="display: flex; justify-content: space-between; font-size: 0.9rem;">',
    '<span style="color: var(--text-secondary);">Novo Total Global Previsto:</span>',
    '<strong style="color: var(--text-primary);">' + formatarMoedaBR(novoTotalGlobal) + '</strong>',
    '</div>'
  ].join('');

  document.getElementById('conf-ajuste-resumo').innerHTML = htmlResumo;

  document.getElementById('modal-conf-ajuste').classList.add('active');
}

window.fecharModalConfAjuste = function() {
  document.getElementById('modal-conf-ajuste').classList.remove('active');
  valoresAjustePendente = null;
}

window.confirmarAjusteRetroativo = async function() {
  if (!mesSelecionadoHistorico || !valoresAjustePendente) return;

  const btn = document.getElementById('btn-confirmar-ajuste');
  const originalHtml = btn.innerHTML;
  btn.innerHTML = '<i data-lucide="loader" class="spin"></i> Aplicando...';
  lucide.createIcons();

  try {
    const res = await apiFetch(`${API_BASE}/ajustes/padrao`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fechamento_mensal_id: mesSelecionadoHistorico.id,
        empresa: valoresAjustePendente.empresa,
        quantidade: valoresAjustePendente.qtd,
        valor_unitario: valoresAjustePendente.valor,
        observacao: valoresAjustePendente.obs
      })
    });

    const json = await res.json();

    if (!json.ok) throw new Error(json.error || (json.data && json.data.mensagem) || 'Erro ao realizar ajuste');

    showToast('Ajuste retroativo aplicado com sucesso!', 'success');
    window.fecharModalConfAjuste();
    
    document.getElementById('inline-ajuste-qtd').value = '1';
    document.getElementById('inline-ajuste-valor').value = '3.00';
    document.getElementById('inline-ajuste-empresa').value = 'Padrão';
    if (document.getElementById('inline-ajuste-obs')) document.getElementById('inline-ajuste-obs').value = '';

    const idAtual = mesSelecionadoHistorico.id;
    await carregarHistorico();
    window.selecionarMesHistorico(idAtual);

  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.innerHTML = originalHtml;
    lucide.createIcons();
  }
}

async function carregarListaAjustesRetroativos(referencia) {
  const container = document.getElementById('lista-ajustes-retroativos');
  if (!container) return;
  container.innerHTML = '<div style="font-size: 0.85rem; color: var(--text-muted);">Carregando ajustes...</div>';
  
  try {
    const res = await apiFetch(`${API_BASE}/ajustes?referencia=${encodeURIComponent(referencia)}`);
    const json = await res.json();
    
    if (json.ok && json.data.length > 0) {
      const html = json.data.map(a => {
        let obsHtml = '';
        if (a.observacao) {
          obsHtml = '<div style="margin-top: 4px; font-style: italic; color: var(--text-secondary);">' + '"' + a.observacao + '"' + '</div>';
        }
        return [
          '<div style="padding: 10px; border-bottom: 1px solid var(--border-subtle); font-size: 0.85rem;">',
          '<div style="display: flex; justify-content: space-between; margin-bottom: 4px;">',
          '<strong style="color: var(--text-primary);">' + a.empresa + '</strong>',
          '<span style="color: var(--text-secondary);">' + formatarDataBR(a.criado_em.split(' ')[0]) + '</span>',
          '</div>',
          '<div style="display: flex; justify-content: space-between; color: var(--text-muted);">',
          '<span>+' + a.quantidade + ' exames (' + formatarMoedaBR(a.valor_unitario) + ')</span>',
          '<strong style="color: var(--color-teal);">' + formatarMoedaBR(a.total) + '</strong>',
          '</div>',
          obsHtml,
          '</div>'
        ].join('');
      }).join('');
      container.innerHTML = html;
    } else {
      container.innerHTML = '<div style="font-size: 0.85rem; color: var(--text-muted);">Nenhum ajuste retroativo para este mês.</div>';
    }
  } catch (err) {
    container.innerHTML = '<div style="font-size: 0.85rem; color: var(--color-danger);">Erro ao carregar ajustes.</div>';
  }

}

// ═══════════════════════════════════════
// HTML DA PÁGINA
// ═══════════════════════════════════════

export function renderFechamentoMes() {


  return `
    <div class="page-header animate-in">
      <h1 class="page-header__title">Fechamento do Mês</h1>
      <p class="page-header__subtitle">Consolide sua produção mensal, gere snapshots históricos e consulte meses fechados.</p>
    </div>

    <div class="dashboard-grid">
      <!-- ÁREA 1: FECHAR NOVO MÊS -->
      <div class="form-card animate-in" style="grid-column: 1; display: flex; flex-direction: column;">
        <h3 style="margin-bottom: 24px; font-weight: 600; color: var(--text-primary);">Fechar novo mês</h3>
        
        <div style="display: flex; gap: 16px; align-items: flex-end; margin-bottom: 24px;">
          <div class="form-group" style="flex: 1;">
            <label class="form-label">Mês de referência</label>
            <input type="month" class="form-control" id="filtro-mes">
          </div>
          <button id="btn-carregar-previa" class="btn-secondary" onclick="window.carregarPreviaMes()" style="height: 46px; padding: 0 24px;">
            <i data-lucide="eye" style="width: 16px; height: 16px;"></i> Carregar prévia
          </button>
        </div>

        <!-- PRÉVIA CONTAINER -->
        <div id="previa-container" style="display: none; flex: 1;">
          <div style="padding: 16px; background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); margin-bottom: 24px;">
            <h4 style="color: var(--text-primary); margin-bottom: 16px; font-size: 1.05rem;">
              Prévia: <span id="previa-ref" style="color: var(--color-teal);"></span>
            </h4>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
              <div style="padding: 12px; background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm);">
                <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 4px;">Quantidade Global</div>
                <div style="font-size: 1.4rem; font-weight: 700; color: var(--text-primary);" id="previa-qtd-global">0</div>
              </div>
              <div style="padding: 12px; background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm);">
                <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 4px;">Total Global</div>
                <div style="font-size: 1.4rem; font-weight: 700; color: var(--color-teal);" id="previa-total-global">R$ 0,00</div>
              </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 0.85rem; margin-bottom: 24px;">
              <div style="display: flex; justify-content: space-between;"><span>Diagnóstico:</span> <strong id="previa-tot-diag">R$ 0,00</strong> <span id="previa-qtd-diag" style="display:none"></span></div>
              <div style="display: flex; justify-content: space-between;"><span>Perfecta:</span> <strong id="previa-tot-perf">R$ 0,00</strong> <span id="previa-qtd-perf" style="display:none"></span></div>
              <div style="display: flex; justify-content: space-between;"><span>E-Mail:</span> <strong id="previa-tot-email">R$ 0,00</strong> <span id="previa-qtd-email" style="display:none"></span></div>
              <div style="display: flex; justify-content: space-between;"><span>Padrão:</span> <strong id="previa-tot-padrao">R$ 0,00</strong> <span id="previa-qtd-padrao" style="display:none"></span></div>
              <div style="display: flex; justify-content: space-between; grid-column: span 2;"><span>Dr. Ranon / RX:</span> <strong id="previa-tot-ranon">R$ 0,00</strong> <span id="previa-qtd-ranon" style="display:none"></span></div>
            </div>

            <div class="table-container" style="margin-bottom: 24px;">
              <table class="table">
                <thead>
                  <tr>
                    <th>Empresa</th>
                    <th style="text-align: center;">Qtd</th>
                    <th style="text-align: right;">Total</th>
                    <th style="text-align: center;">%</th>
                    <th style="text-align: right;">Ticket</th>
                  </tr>
                </thead>
                <tbody id="previa-tabela-body">
                  <!-- JS -->
                </tbody>
              </table>
            </div>
            
            <button class="btn-primary" onclick="window.abrirModalFechamentoMes()" style="width: 100%; justify-content: center; height: 48px; background: var(--color-teal);">
              <i data-lucide="check-circle" style="width: 20px; height: 20px;"></i> Gravar e Fechar Mês
            </button>
          </div>
        </div>
      </div>

      <!-- ÁREA 2: MESES FECHADOS -->
      <div class="form-card animate-in" style="grid-column: 2; animation-delay: 0.1s;">
        <h3 style="margin-bottom: 24px; font-weight: 600; color: var(--text-primary);">Meses fechados</h3>
        
        <div id="historico-lista-container" style="max-height: 250px; overflow-y: auto; margin-bottom: 24px;">
          <!-- JS -->
        </div>

        <!-- DETALHES DO MÊS SELECIONADO -->
        <div id="detalhe-historico" style="display: none; padding: 16px; background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-md);">
          <h4 style="color: var(--text-primary); margin-bottom: 16px; font-size: 1.05rem; display: flex; align-items: center; gap: 8px;">
            <i data-lucide="calendar-check" style="color: var(--color-teal); width: 18px; height: 18px;"></i> Snapshot: <span id="detalhe-ref"></span>
          </h4>
          
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
            <div style="padding: 12px; background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm);">
              <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 4px;">Quantidade Global</div>
              <div style="font-size: 1.4rem; font-weight: 700; color: var(--text-primary);" id="det-qtd-global">0</div>
            </div>
            <div style="padding: 12px; background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm);">
              <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 4px;">Total Global</div>
              <div style="font-size: 1.4rem; font-weight: 700; color: var(--color-teal);" id="det-tot-global">R$ 0,00</div>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 0.85rem; margin-bottom: 24px;">
            <div style="display: flex; justify-content: space-between;"><span>Diagnóstico:</span> <strong id="det-tot-diag">R$ 0,00</strong> <span id="det-qtd-diag" style="display:none"></span></div>
            <div style="display: flex; justify-content: space-between;"><span>Perfecta:</span> <strong id="det-tot-perf">R$ 0,00</strong> <span id="det-qtd-perf" style="display:none"></span></div>
            <div style="display: flex; justify-content: space-between;"><span>E-Mail:</span> <strong id="det-tot-email">R$ 0,00</strong> <span id="det-qtd-email" style="display:none"></span></div>
            <div style="display: flex; justify-content: space-between;"><span>Padrão:</span> <strong id="det-tot-padrao">R$ 0,00</strong> <span id="det-qtd-padrao" style="display:none"></span></div>
            <div style="display: flex; justify-content: space-between; grid-column: span 2;"><span>Dr. Ranon / RX:</span> <strong id="det-tot-ranon">R$ 0,00</strong> <span id="det-qtd-ranon" style="display:none"></span></div>
          </div>

          <div class="table-container" style="margin-bottom: 0;">
            <table class="table">
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th style="text-align: center;">Qtd</th>
                  <th style="text-align: right;">Total</th>
                  <th style="text-align: center;">%</th>
                  <th style="text-align: right;">Ticket</th>
                </tr>
              </thead>
              <tbody id="det-tabela-body">
                <!-- JS -->
              </tbody>
            </table>
          </div>

          <div style="margin-top: 24px; padding: 16px; background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: var(--radius-md);">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
              <i data-lucide="edit-3" style="color: var(--color-teal); width: 18px; height: 18px;"></i>
              <h5 style="color: var(--text-primary); font-size: 0.95rem; margin: 0;">Ajustar exames - Retroativo</h5>
            </div>
            <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 16px;">Acrescente exames/laudos atrasados de qualquer clínica no mês fechado.</p>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
              <div style="grid-column: span 2;">
                <label class="form-label" style="font-size: 0.75rem;">Clínica / Empresa</label>
                <select class="form-control" id="inline-ajuste-empresa" onchange="window.aoMudarEmpresaAjuste()" style="height: 38px; width: 100%;">
                  <option value="Padrão">Padrão</option>
                  <option value="Diagnóstico">Diagnóstico</option>
                  <option value="Perfecta">Perfecta</option>
                  <option value="E-Mail">E-Mail</option>
                  <option value="Dr. Ranon / RX">Dr. Ranon / RX</option>
                </select>
              </div>
              <div>
                <label class="form-label" style="font-size: 0.75rem;">Quantidade</label>
                <input type="number" class="form-control" id="inline-ajuste-qtd" value="1" min="1" style="height: 38px;">
              </div>
              <div>
                <label class="form-label" style="font-size: 0.75rem;">Valor Unitário (R$)</label>
                <input type="number" step="0.01" class="form-control" id="inline-ajuste-valor" value="3.00" min="0" style="height: 38px;">
              </div>
              <div style="grid-column: span 2;">
                <label class="form-label" style="font-size: 0.75rem;">Observação (Opcional)</label>
                <input type="text" class="form-control" id="inline-ajuste-obs" placeholder="Ex: laudos de Maio recebidos em Junho" style="height: 38px;">
              </div>
            </div>
            
            <button class="btn-secondary" onclick="window.prepararAjusteRetroativo()" style="width: 100%; justify-content: center; height: 40px; font-size: 0.85rem; border: 1px solid var(--border-subtle);">
              Acrescentar ajuste
            </button>
          </div>

          <div style="margin-top: 24px;">
            <h5 style="color: var(--text-primary); font-size: 0.9rem; margin-bottom: 12px;">Histórico de ajustes retroativos</h5>
            <div id="lista-ajustes-retroativos" style="background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); min-height: 50px;">
              <!-- JS -->
            </div>
          </div>
        </div>

      </div>
    </div>

    <!-- MODAL CONFIRMAÇÃO FECHAMENTO -->
    <div class="modal-overlay" id="modal-fechar-mes">
      <div class="modal-content">
        <div class="modal-header">
          <h3>Fechar mês?</h3>
          <p>Esta ação vai gerar um snapshot histórico do mês <strong id="modal-fechar-mes-ref"></strong> em fechamentos_mensais. Os lançamentos definitivos serão preservados no banco.</p>
        </div>
        <div class="modal-body" id="modal-resumo-fechamento">
          <!-- JS -->
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="window.fecharModalFechamentoMes()">Cancelar</button>
          <button class="btn-primary" id="btn-confirmar-fechamento" onclick="window.confirmarFechamentoMes()" style="background: var(--color-teal);">
            <i data-lucide="check"></i> Sim, fechar mês
          </button>
        </div>
      </div>
    </div>

    <!-- MODAL CONFIRMAÇÃO AJUSTE RETROATIVO -->
    <div class="modal-overlay" id="modal-conf-ajuste">
      <div class="modal-content">
        <div class="modal-header">
          <h3>Confirmar ajuste retroativo?</h3>
          <p>Este ajuste será aplicado somente ao mês fechado (<strong id="modal-conf-ajuste-ref"></strong>). O mês atual não será alterado.</p>
        </div>
        <div class="modal-body" id="conf-ajuste-resumo" style="background: var(--bg-surface); padding: 16px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);">
          <!-- JS -->
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="window.fecharModalConfAjuste()">Cancelar</button>
          <button class="btn-primary" id="btn-confirmar-ajuste" onclick="window.confirmarAjusteRetroativo()" style="background: var(--color-teal);">
            <i data-lucide="check"></i> Confirmar Ajuste
          </button>
        </div>
      </div>
    </div>
  `;
}
