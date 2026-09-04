import { 
  listarEmpresas, 
  obterConfiguracao, 
  salvarConfiguracao, 
  listarLoteTrabalhoPendente, 
  calcularResumoLoteTrabalho, 
  adicionarItemLoteTrabalho, 
  removerItemLoteTrabalho, 
  atualizarItemLoteTrabalho,
  fecharDiaTrabalho,
  listarFechamentosDiarios,
  desfazerFechamentoDia
} from '../services/api.js';

import { formatarMoedaBR, formatarDataBR, dataAtualISO } from '../utils/formatters.js';

let empresasCache = [];
let loteAtual = [];
let resumoAtual = null;
let historicoFechamentos = [];
let editandoItemId = null;
let isFechando = false;

// Mostrar Toast
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
  if (typeof lucide !== 'undefined') lucide.createIcons();
  
  setTimeout(() => {
    toast.style.animation = 'slideOutRight 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards';
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  }, 3000);
}

// ===========================================
// INICIALIZACAO
// ===========================================

export async function initLancamentos() {
  try {
    // 1. Carregar Empresas (apenas comuns, exclui Ranon)
    const todasEmpresas = await listarEmpresas();
    empresasCache = todasEmpresas.filter(e => e.tipo !== 'ranon');
    
    renderOptionsEmpresa();
    renderEmpresaCards();

    // 2. Carregar configuracao ultima empresa
    let ultimaConfig = await obterConfiguracao('ultima_empresa_selecionada');
    if (!ultimaConfig) ultimaConfig = 'Diagnostico';
    
    const select = document.getElementById('form-empresa');
    if (select) select.value = ultimaConfig;

    // 3. Setar data padrao para hoje
    const dataInput = document.getElementById('form-data');
    if (dataInput) dataInput.value = dataAtualISO();

    // Eventos do form
    if (select) {
      select.addEventListener('change', async (e) => {
        await salvarConfiguracao('ultima_empresa_selecionada', e.target.value);
        atualizarPrecoPadrao(e.target.value);
      });
    }

    const form = document.getElementById('form-lancamento');
    if (form) {
      form.addEventListener('submit', handleFormSubmit);
      // Auto recalculo no form:
      const qInput = form.querySelector('#form-quantidade');
      const vInput = form.querySelector('#form-valor');
      if (qInput) qInput.addEventListener('input', calcularTotalForm);
      if (vInput) vInput.addEventListener('input', calcularTotalForm);
    }
    
    // Configurar eventos estaticos
    const btnGerarMsg = document.getElementById('btn-gerar-msg');
    if (btnGerarMsg) btnGerarMsg.addEventListener('click', gerarMensagemWhatsApp);

    const btnCopiarMsg = document.getElementById('btn-copiar-msg');
    if (btnCopiarMsg) btnCopiarMsg.addEventListener('click', copiarMensagem);

    const btnFecharDia = document.getElementById('btn-fechar-dia');
    if (btnFecharDia) {
      btnFecharDia.onclick = function(e) {
        e.preventDefault();
        console.log('[FECHAR DIA] clique no botão');
        window.abrirModalFechamentoDia();
      };
    }

    // Carregar os dados
    await recarregarDados();
    
    if (typeof lucide !== 'undefined') lucide.createIcons();
  } catch (error) {
    showToast('Erro ao inicializar: ' + error.message, 'error');
  }
}

function renderOptionsEmpresa() {
  const select = document.getElementById('form-empresa');
  if (!select) return;
  
  select.innerHTML = empresasCache.map(e => `
    <option value="${e.nome}">${e.nome}</option>
  `).join('');
}

function renderEmpresaCards() {
  const container = document.getElementById('metrics-grid-container');
  if (!container) return;
  
  const empresasComuns = empresasCache.filter(e => e.tipo !== 'ranon');
  
  // Ajustar grid: 2 colunas pro card total + 1 por empresa
  const totalCols = 2 + empresasComuns.length;
  container.style.gridTemplateColumns = `repeat(${totalCols}, 1fr)`;
  
  // Remover cards antigos de empresa (manter apenas o primeiro card que é o total)
  const cardsAntigos = container.querySelectorAll('.metric-card-empresa');
  cardsAntigos.forEach(c => c.remove());
  
  // Inserir novos cards de empresa
  empresasComuns.forEach((empresa, idx) => {
    const card = document.createElement('div');
    card.className = 'metric-card metric-card-empresa';
    card.innerHTML = `
      <div class="metric-card__header"><div class="metric-card__label-top">${empresa.nome}</div></div>
      <div class="metric-card__body">
        <div class="metric-card__value" style="font-size: 1.4rem;" id="metrica-empresa-${idx}-valor">R$ 0,00</div>
        <div class="metric-card__desc" style="margin-top: 4px;" id="metrica-empresa-${idx}-qtd">0 exames</div>
      </div>
    `;
    container.appendChild(card);
  });
}

function atualizarPrecoPadrao(nomeEmpresa) {
  const empresa = empresasCache.find(e => e.nome === nomeEmpresa);
  const inputValor = document.getElementById('form-valor');
  if (inputValor) {
    inputValor.value = (empresa && empresa.valor_padrao > 0) ? empresa.valor_padrao : 3.00;
    calcularTotalForm();
  }
}

function calcularTotalForm() {
  const qEl = document.getElementById('form-quantidade');
  const vEl = document.getElementById('form-valor');
  const pEl = document.getElementById('form-total-preview');
  if (!qEl || !vEl || !pEl) return;
  
  const qtd = parseFloat(qEl.value) || 0;
  const valor = parseFloat(vEl.value) || 0;
  pEl.innerText = formatarMoedaBR(qtd * valor);
}

// ===========================================
// FLUXO DE DADOS
// ===========================================

async function recarregarDados() {
  try {
    loteAtual = await listarLoteTrabalhoPendente();
    resumoAtual = await calcularResumoLoteTrabalho();
    historicoFechamentos = await listarFechamentosDiarios();
    
    renderMetricas();
    renderTabela();
    renderHistoricoFechamentos();
    atualizarBotaoFecharDia();
    
    if (typeof lucide !== 'undefined') lucide.createIcons();
  } catch (err) {
    console.error('Erro ao recarregar dados:', err);
    showToast('Erro ao carregar dados.', 'error');
  }
}

async function handleFormSubmit(e) {
  if (e) e.preventDefault();
  
  try {
    const empresa_nome = document.getElementById('form-empresa').value;
    const empresa = empresasCache.find(em => em.nome === empresa_nome);
    const quantidade = parseInt(document.getElementById('form-quantidade').value, 10);
    const valor_unitario = parseFloat(document.getElementById('form-valor').value);
    const data = document.getElementById('form-data').value;
    const observacao = document.getElementById('form-obs').value;

    if (quantidade <= 0 || valor_unitario <= 0) {
      showToast('Quantidade e valor devem ser maiores que zero.', 'error');
      return;
    }

    const dados = {
      empresa_id: empresa ? empresa.id : 0,
      empresa_nome,
      quantidade,
      valor_unitario,
      data,
      observacao
    };

    if (editandoItemId) {
      await atualizarItemLoteTrabalho(editandoItemId, dados);
      showToast('Lancamento atualizado!');
      editandoItemId = null;
      const subBtn = document.querySelector('#form-lancamento button[type="submit"]');
      if (subBtn) subBtn.innerHTML = '<i data-lucide="plus"></i> Adicionar ao Lote';
    } else {
      await adicionarItemLoteTrabalho(dados);
      showToast('Lancamento adicionado ao lote temporario!');
    }

    // Limpar form
    document.getElementById('form-quantidade').value = '1';
    document.getElementById('form-valor').value = '3.00';
    document.getElementById('form-obs').value = '';
    calcularTotalForm();
    
    await recarregarDados();
  } catch (err) {
    showToast('Erro ao salvar lancamento.', 'error');
  }
}

// Funcoes globais
window.editarLote = async function(id) {
  const item = loteAtual.find(i => i.id === id);
  if (!item) return;

  document.getElementById('form-empresa').value = item.empresa_nome;
  document.getElementById('form-quantidade').value = item.quantidade;
  document.getElementById('form-valor').value = item.valor_unitario;
  document.getElementById('form-data').value = item.data;
  document.getElementById('form-obs').value = item.observacao || '';
  
  editandoItemId = id;
  calcularTotalForm();
  
  const subBtn = document.querySelector('#form-lancamento button[type="submit"]');
  if (subBtn) subBtn.innerHTML = '<i data-lucide="save"></i> Atualizar Item';
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

window.excluirLote = async function(id) {
  if (!confirm('Tem certeza que deseja excluir este lancamento temporario?')) return;
  
  try {
    await removerItemLoteTrabalho(id);
    showToast('Lancamento removido.');
    await recarregarDados();
  } catch (err) {
    showToast('Erro ao remover.', 'error');
  }
}

// ===========================================
// FECHAMENTO DO DIA
// ===========================================

function atualizarBotaoFecharDia() {
  const btn = document.getElementById('btn-fechar-dia');
  if (!btn) return;
  
  if (loteAtual.length === 0) {
    btn.classList.add('disabled');
    btn.style.opacity = '0.5';
    btn.style.cursor = 'not-allowed';
  } else {
    btn.classList.remove('disabled');
    btn.style.opacity = '1';
    btn.style.cursor = 'pointer';
  }
}

window.abrirModalFechamentoDia = function() {
  try {
    console.log('[FECHAR DIA] abrirModalFechamento chamado');
    console.log('[FECHAR DIA] loteAtual:', loteAtual.length, 'itens');
    
    if (!loteAtual || loteAtual.length === 0) {
      showToast('Não há itens no lote pendente para fechar.', 'info');
      return;
    }
    
    const modal = document.getElementById('modal-fechar-dia');
    console.log('[FECHAR DIA] modal encontrado:', !!modal);
    if (!modal) {
      showToast('Erro: modal de fechamento não encontrado.', 'error');
      return;
    }
    
    console.log('[FECHAR DIA] resumoAtual:', JSON.stringify(resumoAtual));
    
    // Monta resumo com verificação de segurança
    const totalQtd = resumoAtual?.geral?.total_quantidade || 0;
    const totalValor = resumoAtual?.geral?.total_valor || 0;
    const empresas = resumoAtual?.porEmpresa || [];
    
    const resumoHTML = `
      <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
        <span style="color: var(--text-secondary);">Quantidade Total:</span>
        <strong style="color: var(--text-primary);">${totalQtd} exames</strong>
      </div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 16px;">
        <span style="color: var(--text-secondary);">Valor Total:</span>
        <strong style="color: var(--color-teal); font-size: 1.1rem;">${formatarMoedaBR(totalValor)}</strong>
      </div>
      <div style="border-top: 1px dashed var(--border-subtle); padding-top: 16px;">
        ${empresas.map(e => `
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 0.9rem;">
            <span style="color: var(--text-secondary);">${e.empresa_nome}</span>
            <span style="color: var(--text-primary);">${e.quantidade} ex. (${formatarMoedaBR(e.valor)})</span>
          </div>
        `).join('')}
      </div>
    `;
    
    const rEl = document.getElementById('modal-fechamento-resumo');
    if (rEl) rEl.innerHTML = resumoHTML;
    modal.classList.add('active');
    console.log('[FECHAR DIA] modal ativado com sucesso');
  } catch (err) {
    console.error('[FECHAR DIA] ERRO em abrirModalFechamento:', err);
    showToast('Erro ao abrir modal: ' + err.message, 'error');
  }
}

window.fecharModalFechamentoDia = function() {
  const modal = document.getElementById('modal-fechar-dia');
  if (modal) modal.classList.remove('active');
}

window.confirmarFechamentoDia = async function() {
  if (isFechando) return;
  isFechando = true;
  
  const btn = document.getElementById('btn-confirmar-fechamento');
  let originalHtml = '';
  if (btn) {
    originalHtml = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="loader" class="spin"></i> Fechando...';
  }
  
  try {
    const resultado = await fecharDiaTrabalho();
    if (resultado.sucesso) {
      showToast(resultado.mensagem, 'success');
      window.fecharModalFechamentoDia();
      const wt = document.getElementById('whatsapp-text');
      if (wt) wt.value = '';
      await recarregarDados();
    } else {
      showToast(resultado.mensagem, 'error');
    }
  } catch (err) {
    showToast('Erro ao fechar o dia: ' + err.message, 'error');
  } finally {
    isFechando = false;
    if (btn) btn.innerHTML = originalHtml;
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
}

window.desfazerFechamento = async function(id) {
  if (!confirm('Tem certeza que deseja desfazer este fechamento? Os itens voltarao para o lote temporario.')) return;
  
  if (isFechando) return;
  isFechando = true;
  
  try {
    const resultado = await desfazerFechamentoDia(id);
    if (resultado.sucesso) {
      showToast('Fechamento desfeito com sucesso.', 'success');
      await recarregarDados();
    } else {
      showToast(resultado.mensagem, 'error');
    }
  } catch (err) {
    showToast('Erro ao desfazer fechamento: ' + err.message, 'error');
  } finally {
    isFechando = false;
  }
}

// ===========================================
// RENDERIZACAO
// ===========================================

function renderMetricas() {
  if (!resumoAtual) return;
  const { geral, porEmpresa } = resumoAtual;
  
  const totalGeral = geral.total_valor || 0;
  const qtdGeral = geral.total_quantidade || 0;
  
  const getEmpresaQtd = (nome) => {
    const e = porEmpresa.find(em => em.empresa_nome === nome);
    return e ? e.quantidade : 0;
  };

  const getEmpresaValor = (nome) => {
    const e = porEmpresa.find(em => em.empresa_nome === nome);
    return e ? e.valor : 0;
  };

  const mt = document.getElementById('metrica-total');
  const mq = document.getElementById('metrica-qtd');
  if (mt) mt.innerText = formatarMoedaBR(totalGeral);
  if (mq) mq.innerText = qtdGeral;
  
  // Atualizar cards das empresas dinamicamente usando nomes reais do cache
  const empresasComuns = empresasCache.filter(e => e.tipo !== 'ranon');
  empresasComuns.forEach((empresa, idx) => {
    const mvEl = document.getElementById(`metrica-empresa-${idx}-valor`);
    const mqEl = document.getElementById(`metrica-empresa-${idx}-qtd`);
    if (mvEl) mvEl.innerText = formatarMoedaBR(getEmpresaValor(empresa.nome));
    if (mqEl) mqEl.innerText = getEmpresaQtd(empresa.nome) + ' exames';
  });
}

function renderTabela() {
  const tbody = document.getElementById('tabela-lote-body');
  if (!tbody) return;
  
  if (loteAtual.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 40px; color: var(--text-muted);">
          Nenhum lancamento no lote temporario.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = loteAtual.map(item => {
    const empresa = empresasCache.find(e => e.nome === item.empresa_nome);
    const cor = empresa ? empresa.cor : '#999';
    
    return `
      <tr>
        <td>${formatarDataBR(item.data)}</td>
        <td>
          <div class="badge-empresa" style="background: ${cor}15; color: ${cor}; border-color: ${cor}30;">
             ${item.empresa_nome}
          </div>
        </td>
        <td>${item.quantidade}</td>
        <td>${formatarMoedaBR(item.valor_unitario)}</td>
        <td style="font-weight: 600;">${formatarMoedaBR(item.total)}</td>
        <td style="color: var(--text-muted); font-size: 0.8rem;">${item.observacao || '-'}</td>
        <td>
          <div class="table-actions">
            <button type="button" class="btn-icon" onclick="if(window.editarLote) window.editarLote(${item.id});" title="Editar">
              <i data-lucide="edit-2" style="width: 16px; height: 16px;"></i>
            </button>
            <button type="button" class="btn-icon danger" onclick="if(window.excluirLote) window.excluirLote(${item.id});" title="Excluir">
              <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function renderHistoricoFechamentos() {
  const container = document.getElementById('historico-fechamentos-container');
  if (!container) return;

  if (historicoFechamentos.length === 0) {
    container.innerHTML = '<p style="color: var(--text-muted); font-size: 0.9rem;">Nenhum fechamento registrado recentemente.</p>';
    return;
  }

  const historicoHtml = historicoFechamentos.slice(0, 5).map((f) => {
    const btnDesfazer = `
      <button class="btn-icon danger" onclick="window.desfazerFechamento(${f.id})" title="Desfazer Fechamento" style="margin-left: 12px;">
        <i data-lucide="rotate-ccw" style="width: 16px; height: 16px;"></i>
      </button>
    `;

    return `
      <div style="background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 16px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">${formatarDataBR(f.data)}</div>
          <div style="font-size: 0.8rem; color: var(--text-muted);">Fechado em ${formatarDataBR(f.criado_em.split(' ')[0])}</div>
        </div>
        <div style="display: flex; align-items: center;">
          <div style="text-align: right;">
            <div style="font-weight: 700; color: var(--color-teal);">${formatarMoedaBR(f.total_valor)}</div>
            <div style="font-size: 0.85rem; color: var(--text-secondary);">${f.total_quantidade} exames</div>
          </div>
          ${btnDesfazer}
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = historicoHtml;
}

// ===========================================
// MENSAGEM WHATSAPP
// ===========================================

function gerarMensagemWhatsApp() {
  if (!resumoAtual) return;
  
  const { porEmpresa } = resumoAtual;
  
  const linhas = [];
  linhas.push('Bom dia Dr., tudo bem?');
  linhas.push('A relação dos exames de ontem:');
  
  let totalExames = 0;
  // Gerar linhas dinamicamente com nomes reais das empresas
  for (const e of porEmpresa) {
    if (e.quantidade > 0 && e.empresa_nome !== 'Padrão') {
      linhas.push(`${e.empresa_nome}: ${e.quantidade}`);
      totalExames += e.quantidade;
    }
  }
  
  linhas.push(`Total: ${totalExames}`);
  
  const wt = document.getElementById('whatsapp-text');
  if (wt) wt.value = linhas.join('\n');
}

function copiarMensagem() {
  const textarea = document.getElementById('whatsapp-text');
  if (!textarea || !textarea.value) return;
  
  textarea.select();
  textarea.setSelectionRange(0, 99999);
  navigator.clipboard.writeText(textarea.value)
    .then(() => {
      showToast('Mensagem copiada!', 'success');
    })
    .catch(() => {
      showToast('Erro ao copiar.', 'error');
    });
}

// ===========================================
// ESTRUTURA DA TELA
// ===========================================

export function renderLancamentos() {


  return `
    <div class="page-header animate-in">
      <h1 class="page-header__title">Lancamentos</h1>
      <p class="page-header__subtitle">Registre os exames das clinicas, organize o lote do dia e prepare o fechamento.</p>
    </div>

    <!-- Metrics Grid -->
    <div class="metrics-grid animate-in" id="metrics-grid-container">
      <div class="metric-card" style="grid-column: span 2;">
        <div class="metric-card__header">
          <div class="metric-card__label-top">Total Pendente (Lote)</div>
          <div class="metric-card__icon" style="background: var(--color-teal-dim);">
            <i data-lucide="dollar-sign" style="color: var(--color-teal);"></i>
          </div>
        </div>
        <div class="metric-card__body">
          <div class="metric-card__value" id="metrica-total">R$ 0,00</div>
          <div class="metric-card__desc">
            <span id="metrica-qtd">0</span> itens no lote
          </div>
        </div>
      </div>
    </div>

    <div class="dashboard-grid animate-in">
      
      <!-- Form -->
      <div class="form-card">
        <h3 style="margin-bottom: 24px; font-weight: 600; color: var(--text-primary);">Novo Lancamento Temporario</h3>
        <form id="form-lancamento">
          <div class="form-grid" style="grid-template-columns: 1fr 1fr;">
            <div class="form-group">
              <label class="form-label">Empresa</label>
              <select class="form-control" id="form-empresa" required></select>
            </div>
            <div class="form-group">
              <label class="form-label">Data</label>
              <input type="date" class="form-control" id="form-data" required>
            </div>
          </div>
          
          <div class="form-grid" style="grid-template-columns: 1fr 1fr;">
            <div class="form-group">
              <label class="form-label">Quantidade</label>
              <input type="number" class="form-control" id="form-quantidade" min="1" step="1" value="1" required>
            </div>
            <div class="form-group">
              <label class="form-label">Valor Unitario (R$)</label>
              <input type="number" class="form-control" id="form-valor" min="0.01" step="0.01" value="3.00" required>
            </div>
          </div>

          <div class="form-group" style="margin-bottom: 24px;">
            <label class="form-label">Observacao (Opcional)</label>
            <input type="text" class="form-control" id="form-obs" placeholder="Ex: Ajuste manual...">
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 16px; border-top: 1px solid var(--border-subtle);">
            <div>
              <span class="form-label" style="display:inline; margin-right: 8px;">Total Previsto:</span>
              <span id="form-total-preview" style="font-size: 1.2rem; font-weight: 700; color: var(--color-teal);">R$ 0,00</span>
            </div>
            <button type="submit" class="btn-primary">
              <i data-lucide="plus"></i> Adicionar ao Lote
            </button>
          </div>
        </form>
      </div>

      <!-- WhatsApp -->
      <div class="form-card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
          <h3 style="font-weight: 600; color: var(--text-primary);">Mensagem para WhatsApp</h3>
          <button type="button" class="btn-secondary" id="btn-gerar-msg" style="padding: 8px 16px; font-size: 0.8rem;">
            <i data-lucide="refresh-cw" style="width: 14px; height: 14px;"></i> Gerar Mensagem
          </button>
        </div>
        
        <div class="form-group">
          <textarea class="form-control" id="whatsapp-text" placeholder="Gere a mensagem baseada no lote atual..." style="min-height: 160px; resize: vertical;"></textarea>
        </div>
        
        <div class="form-actions" style="margin-top: 16px;">
          <button type="button" class="btn-primary" id="btn-copiar-msg" style="width: 100%; justify-content: center;">
            <i data-lucide="copy"></i> Copiar Mensagem
          </button>
        </div>
      </div>
      
    </div>

    <!-- Tabela Lote -->
    <div class="animate-in" style="animation-delay: 0.3s; margin-top: 16px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h3 style="font-weight: 600; color: var(--text-primary);">Lote Temporario Pendente</h3>
        <button id="btn-fechar-dia" class="btn-primary" style="background: var(--color-teal); color: #fff; cursor: pointer;">
          <i data-lucide="check-circle"></i> Fechar o Dia
        </button>
      </div>
      
      <div class="table-container">
        <table class="table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Empresa</th>
              <th>Qtd</th>
              <th>Valor Unit.</th>
              <th>Total</th>
              <th>Obs</th>
              <th>Acoes</th>
            </tr>
          </thead>
          <tbody id="tabela-lote-body"></tbody>
        </table>
      </div>
    </div>

    <!-- Fechamentos Recentes -->
    <div class="form-card animate-in" style="animation-delay: 0.4s;">
      <h3 style="margin-bottom: 16px; font-weight: 600; color: var(--text-primary);">Ultimos Fechamentos do Dia</h3>
      <div id="historico-fechamentos-container"></div>
    </div>

    <!-- Modal Fechar Dia -->
    <div class="modal-overlay" id="modal-fechar-dia">
      <div class="modal-content">
        <div class="modal-header">
          <h3>Fechar o dia?</h3>
          <p>Esta acao vai mover todos os itens do lote pendente para o historico definitivo e limpar o lote atual.</p>
        </div>
        <div class="modal-body" id="modal-fechamento-resumo"></div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="if(window.fecharModalFechamentoDia) window.fecharModalFechamentoDia();">Cancelar</button>
          <button class="btn-primary" id="btn-confirmar-fechamento" onclick="if(window.confirmarFechamentoDia) window.confirmarFechamentoDia();" style="background: var(--color-teal); cursor: pointer;">
            <i data-lucide="check"></i> Sim, fechar o dia
          </button>
        </div>
      </div>
    </div>
  `;
}
