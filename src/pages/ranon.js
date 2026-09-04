import { apiFetch } from '../services/http.js';
import { 
  listarLaudosRanonPendentes, 
  adicionarLaudoRanonPendente, 
  atualizarLaudoRanonPendente, 
  removerLaudoRanonPendente, 
  limparLaudosRanonPendentes
} from '../services/api.js';

import { formatarMoedaBR, formatarDataBR, dataAtualISO } from '../utils/formatters.js';
import { legacyStringArgument } from '../security/legacyHandlers.js';
import { setIconMessage } from '../security/safeDom.js';

const API_BASE = '/api';

let loteAtual = [];
let historicoPlanihas = [];
let precoAtual = 2.00;
let editandoItemId = null;
let isLimpando = false;
let pesquisaRanon = '';
let abaAtiva = 'pendentes'; // 'pendentes' ou 'duplicados'

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
  setIconMessage(toast, type === 'success' ? 'check-circle' : (type === 'error' ? 'alert-circle' : 'info'), message);
  
  container.appendChild(toast);
  lucide.createIcons();
  
  setTimeout(() => {
    toast.style.animation = 'slideOutRight 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards';
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  }, 3000);
}

// Helper: mês de referência padrão (mês anterior)
function getMesReferenciaDefault() {
  const agora = new Date();
  let mes = agora.getMonth(); // 0-11 → mês anterior = getMonth() (pois é 0-indexed)
  let ano = agora.getFullYear();
  if (mes === 0) { mes = 12; ano -= 1; }
  return `${String(mes).padStart(2, '0')}/${ano}`;
}

// ═══════════════════════════════════════
// INICIALIZAÇÃO
// ═══════════════════════════════════════

export async function initRanon() {
  abaAtiva = 'pendentes';
  try {
    // Carregar configurações do Dr. Ranon
    try {
      const cfgPreco = await apiFetch(`${API_BASE}/configuracoes/preco_padrao_ranon`).then(r => r.json());
      if (cfgPreco.ok && cfgPreco.data) {
        precoAtual = parseFloat(cfgPreco.data);
      } else {
        precoAtual = 2.00;
      }
    } catch {
      precoAtual = 2.00;
    }
    const valorInput = document.getElementById('form-valor');
    if (valorInput) valorInput.value = precoAtual.toFixed(2);

    const dataInput = document.getElementById('form-data');
    if (dataInput) dataInput.value = dataAtualISO();

    // Setar mês de referência padrão
    const mesRefInput = document.getElementById('form-mes-referencia');
    if (mesRefInput) {
      try {
        const cfgMes = await apiFetch(`${API_BASE}/configuracoes/mes_referencia_ranon_padrao`).then(r => r.json());
        if (cfgMes.ok && cfgMes.data === 'atual') {
          const agora = new Date();
          mesRefInput.value = `${String(agora.getMonth() + 1).padStart(2, '0')}/${agora.getFullYear()}`;
        } else {
          mesRefInput.value = getMesReferenciaDefault();
        }
      } catch {
        mesRefInput.value = getMesReferenciaDefault();
      }
    }

    const form = document.getElementById('form-lancamento');
    if (form) {
      form.addEventListener('submit', handleFormSubmit);
      
      const regInput = document.getElementById('form-registro');
      regInput.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, '');
      });
    }
    
    await recarregarDados();
    
  } catch (error) {
    showToast('Erro ao inicializar: ' + error.message, 'error');
  }
}

// ═══════════════════════════════════════
// FLUXO DE DADOS
// ═══════════════════════════════════════

async function recarregarDados() {
  try {
    loteAtual = await listarLaudosRanonPendentes();
    
    // Carregar histórico de planilhas
    try {
      const res = await apiFetch(`${API_BASE}/ranon/historico-planilhas?limit=5`);
      const json = await res.json();
      historicoPlanihas = json.ok ? json.data : [];
    } catch { historicoPlanihas = []; }
    
    renderMétricas();
    renderTabela();
    renderHistoricoPlanilhas();
  } catch (err) {
    showToast('Erro ao carregar dados.', 'error');
  }
}

async function handleFormSubmit(e) {
  e.preventDefault();
  
  try {
    const registroRaw = document.getElementById('form-registro').value;
    const registro_paciente = registroRaw.replace(/\D/g, '');
    const quantidade = parseInt(document.getElementById('form-quantidade').value, 10) || 1;
    const data = document.getElementById('form-data').value;
    const valor_unitario = parseFloat(document.getElementById('form-valor').value);
    const observacao = document.getElementById('form-obs').value;

    if (!registro_paciente) {
      showToast('O registro do paciente não pode ficar vazio.', 'error');
      return;
    }

    if (quantidade <= 0) {
      showToast('A quantidade deve ser maior que zero.', 'error');
      return;
    }

    if (valor_unitario <= 0) {
      showToast('O valor unitário deve ser maior que zero.', 'error');
      return;
    }

    const agora = new Date();
    const horario = `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`;

    const dados = {
      registro_paciente,
      quantidade,
      data,
      horario,
      valor_unitario,
      observacao
    };

    if (editandoItemId) {
      await atualizarLaudoRanonPendente(editandoItemId, dados);
      showToast('Laudo atualizado!');
      editandoItemId = null;
      document.querySelector('#form-lancamento button[type="submit"]').innerHTML = '<i data-lucide="plus" style="width: 20px; height: 20px;"></i> Adicionar Laudo';
    } else {
      await adicionarLaudoRanonPendente(dados);
      showToast('Laudo adicionado!');
    }

    document.getElementById('form-registro').value = '';
    document.getElementById('form-obs').value = '';
    document.getElementById('form-quantidade').value = '1';
    document.getElementById('form-valor').value = precoAtual.toFixed(2);
    document.getElementById('form-data').value = dataAtualISO();
    document.getElementById('form-registro').focus();
    
    await recarregarDados();
  } catch (err) {
    showToast('Erro ao salvar laudo.', 'error');
  }
}

window.editarLaudoRanon = async function(id) {
  const item = loteAtual.find(i => i.id === id);
  if (!item) return;

  document.getElementById('form-registro').value = item.registro_paciente;
  document.getElementById('form-quantidade').value = item.quantidade || 1;
  document.getElementById('form-data').value = item.data;
  document.getElementById('form-valor').value = item.valor_unitario;
  document.getElementById('form-obs').value = item.observacao || '';
  
  editandoItemId = id;
  
  document.querySelector('#form-lancamento button[type="submit"]').innerHTML = '<i data-lucide="save" style="width: 20px; height: 20px;"></i> Atualizar Laudo';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

window.excluirLaudoRanon = async function(id) {
  if (!confirm('Tem certeza que deseja excluir este laudo pendente?')) return;
  
  try {
    await removerLaudoRanonPendente(id);
    showToast('Laudo removido.');
    await recarregarDados();
  } catch (err) {
    showToast('Erro ao remover.', 'error');
  }
}

// ═══════════════════════════════════════
// LIMPAR TUDO
// ═══════════════════════════════════════

window.abrirModalLimparTudo = function() {
  if (loteAtual.length === 0) {
    showToast('Não há laudos pendentes para limpar.', 'info');
    return;
  }
  document.getElementById('modal-limpar-tudo').classList.add('active');
}

window.fecharModalLimparTudo = function() {
  document.getElementById('modal-limpar-tudo').classList.remove('active');
}

window.confirmarLimparTudo = async function() {
  if (isLimpando) return;
  isLimpando = true;
  
  const btn = document.getElementById('btn-confirmar-limpar');
  const originalHtml = btn.innerHTML;
  btn.innerHTML = '<i data-lucide="loader" class="spin"></i> Limpando...';
  
  try {
    await limparLaudosRanonPendentes();
    showToast('Lote temporário limpo com sucesso!', 'success');
    window.fecharModalLimparTudo();
    await recarregarDados();
  } catch (err) {
    showToast('Erro ao limpar lote: ' + err.message, 'error');
  } finally {
    isLimpando = false;
    btn.innerHTML = originalHtml;
    lucide.createIcons();
  }
}

// ═══════════════════════════════════════
// EXPORTAR EXCEL
// ═══════════════════════════════════════

let isExportando = false;

window.exportarExcelRanon = async function() {
  if (loteAtual.length === 0) {
    showToast('Não há laudos pendentes para exportar.', 'info');
    return;
  }

  if (isExportando) return;
  isExportando = true;

  const btn = document.getElementById('btn-exportar-excel');
  const originalHtml = btn.innerHTML;
  btn.innerHTML = '<i data-lucide="loader" class="spin"></i> Gerando...';
  lucide.createIcons();

  try {
    const response = await apiFetch(`${API_BASE}/ranon/exportar-excel`);

    if (!response.ok) {
      const erro = await response.json();
      throw new Error(erro.error || 'Não foi possível exportar o Excel.');
    }

    const blob = await response.blob();
    const contentDisposition = response.headers.get('Content-Disposition');
    let nomeArquivo = 'Laudos_RX.xlsx';
    if (contentDisposition) {
      const match = contentDisposition.match(/filename="(.+?)"/);
      if (match) nomeArquivo = match[1];
    }

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nomeArquivo;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);

    showToast('Excel exportado com sucesso!', 'success');
  } catch (err) {
    showToast(err.message || 'Não foi possível exportar o Excel.', 'error');
  } finally {
    isExportando = false;
    btn.innerHTML = originalHtml;
    lucide.createIcons();
  }
}

// ═══════════════════════════════════════
// SALVAR PLANILHA
// ═══════════════════════════════════════

let isSalvando = false;

window.abrirModalSalvarPlanilha = function() {
  if (loteAtual.length === 0) {
    showToast('Não há laudos pendentes para salvar.', 'info');
    return;
  }

  const totalQtd = loteAtual.reduce((acc, l) => acc + (l.quantidade || 1), 0);
  const totalValor = loteAtual.reduce((a, l) => a + l.total, 0);
  const mesRef = document.getElementById('form-mes-referencia').value;

  document.getElementById('modal-salvar-resumo').innerHTML = `
    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
      <span style="color: var(--text-secondary);">Laudos pendentes:</span>
      <strong style="color: var(--text-primary);">${totalQtd}</strong>
    </div>
    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
      <span style="color: var(--text-secondary);">Valor total:</span>
      <strong style="color: var(--color-teal); font-size: 1.1rem;">${formatarMoedaBR(totalValor)}</strong>
    </div>
    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
      <span style="color: var(--text-secondary);">Valor unitário:</span>
      <strong style="color: var(--text-primary);">${formatarMoedaBR(precoAtual)}</strong>
    </div>
    <div style="display: flex; justify-content: space-between;">
      <span style="color: var(--text-secondary);">Mês de referência:</span>
      <strong style="color: var(--text-primary);">${mesRef}</strong>
    </div>
  `;

  document.getElementById('modal-salvar-planilha').classList.add('active');
}

window.fecharModalSalvarPlanilha = function() {
  document.getElementById('modal-salvar-planilha').classList.remove('active');
}

window.confirmarSalvarPlanilha = async function() {
  if (isSalvando) return;
  isSalvando = true;

  const btn = document.getElementById('btn-confirmar-salvar');
  const originalHtml = btn.innerHTML;
  btn.innerHTML = '<i data-lucide="loader" class="spin"></i> Salvando...';
  lucide.createIcons();

  try {
    const mesRef = document.getElementById('form-mes-referencia').value;
    
    const response = await apiFetch(`${API_BASE}/ranon/salvar-planilha`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mes_referencia: mesRef })
    });

    const json = await response.json();

    if (!json.ok) {
      throw new Error(json.data?.message || json.error || 'Erro ao salvar planilha.');
    }

    const resultado = json.data;
    window.fecharModalSalvarPlanilha();
    showToast(`Planilha salva com sucesso! Arquivo: ${resultado.arquivo}`, 'success');
    await recarregarDados();
  } catch (err) {
    showToast(err.message || 'Não foi possível salvar a planilha.', 'error');
  } finally {
    isSalvando = false;
    btn.innerHTML = originalHtml;
    lucide.createIcons();
  }
}

// ═══════════════════════════════════════
// RENDERIZAÇÃO
// ═══════════════════════════════════════

function renderMétricas() {
  const qtdLaudos = loteAtual.reduce((acc, curr) => acc + (curr.quantidade || 1), 0);
  const totalPrevisto = loteAtual.reduce((acc, curr) => acc + curr.total, 0);
  const ultimoRegistro = loteAtual.length > 0 ? loteAtual[0].registro_paciente : '-';

  document.getElementById('metrica-qtd-laudos').innerText = qtdLaudos;
  document.getElementById('metrica-valor-unitario').innerText = formatarMoedaBR(precoAtual);
  document.getElementById('metrica-total-previsto').innerText = formatarMoedaBR(totalPrevisto);
  document.getElementById('metrica-ultimo-registro').innerText = ultimoRegistro;
}

function renderTabela() {
  const tbody = document.getElementById('tabela-ranon-body');
  
  let loteFiltrado = loteAtual;
  
  // Calcular contagem de duplicados
  const contagemMap = {};
  loteAtual.forEach(item => {
    const reg = item.registro_paciente;
    contagemMap[reg] = (contagemMap[reg] || 0) + 1;
  });
  
  if (abaAtiva === 'duplicados') {
    loteFiltrado = loteFiltrado.filter(item => contagemMap[item.registro_paciente] > 1);
    // Ordenar pelo registro do paciente para que fiquem agrupados um sob o outro
    loteFiltrado.sort((a, b) => a.registro_paciente.localeCompare(b.registro_paciente));
  }

  if (pesquisaRanon.trim() !== '') {
    const termo = pesquisaRanon.toLowerCase();
    loteFiltrado = loteAtual.filter(item => 
      item.registro_paciente.toLowerCase().includes(termo) ||
      (item.observacao && item.observacao.toLowerCase().includes(termo))
    );
  }
  
  if (loteFiltrado.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 40px; color: var(--text-muted);">
          ${loteAtual.length === 0 ? 'Nenhum laudo no lote temporário.' : (abaAtiva === 'duplicados' ? 'Nenhum laudo duplicado encontrado.' : 'Nenhum laudo encontrado para a pesquisa.')}
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = loteFiltrado.map(item => {
    return `
      <tr>
        <td>${formatarDataBR(item.data)}</td>
        <td>${item.horario || '-'}</td>
        <td style="font-family: monospace; font-size: 1.1rem; color: var(--color-cyan);">${item.registro_paciente}</td>
        <td style="text-align: center; font-weight: 600;">${item.quantidade || 1}</td>
        <td>${formatarMoedaBR(item.valor_unitario)}</td>
        <td style="font-weight: 600;">${formatarMoedaBR(item.total)}</td>
        <td style="color: var(--text-muted); font-size: 0.8rem;">${item.observacao || '-'}</td>
        <td>
          <div class="table-actions">
            ${contagemMap[item.registro_paciente] > 1 ? `
              <button type="button" class="btn-icon" onclick="window.mesclarDuplicadosRanon(${legacyStringArgument(item.registro_paciente)})" title="Mesclar lançamentos deste paciente" style="color: var(--color-teal);">
                <i data-lucide="git-merge" style="width: 16px; height: 16px;"></i>
              </button>
            ` : ''}
            <button type="button" class="btn-icon" onclick="editarLaudoRanon(${item.id})" title="Editar">
              <i data-lucide="edit-2" style="width: 16px; height: 16px;"></i>
            </button>
            <button type="button" class="btn-icon danger" onclick="excluirLaudoRanon(${item.id})" title="Excluir">
              <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
  
  lucide.createIcons();
}

window.filtrarLaudosRanon = function(valor) {
  pesquisaRanon = valor;
  renderTabela();
};

window.mudarAbaRanon = function(aba) {
  abaAtiva = aba;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById(`tab-ranon-${aba}`);
  if (btn) btn.classList.add('active');
  renderTabela();
};

window.mesclarDuplicadosRanon = async function(registro) {
  const laudosDoPaciente = loteAtual.filter(l => l.registro_paciente === registro);
  if (laudosDoPaciente.length <= 1) return;

  const totalQtd = laudosDoPaciente.reduce((acc, curr) => acc + (curr.quantidade || 1), 0);
  
  const examesSet = new Set();
  laudosDoPaciente.forEach(l => {
    if (l.observacao && l.observacao.trim()) {
      l.observacao.split(',').forEach(ex => {
        const exLimpo = ex.trim();
        if (exLimpo) examesSet.add(exLimpo);
      });
    }
  });
  const novaObservacao = Array.from(examesSet).join(', ');

  const resumoMsg = laudosDoPaciente.map(l => 
    `- Qtd: ${l.quantidade || 1} | Exame: ${l.observacao || '-'}`
  ).join('\n');

  if (!confirm(`Deseja mesclar os ${laudosDoPaciente.length} lançamentos do paciente ${registro}?\n\nLançamentos atuais:\n${resumoMsg}\n\nResultado da mesclagem:\n- Nova Quantidade: ${totalQtd}\n- Novo Exame: ${novaObservacao || '-'}`)) {
    return;
  }

  try {
    const primeiro = laudosDoPaciente[0];
    const outros = laudosDoPaciente.slice(1);

    const dadosAtualizados = {
      registro_paciente: primeiro.registro_paciente,
      quantidade: totalQtd,
      data: primeiro.data,
      horario: primeiro.horario,
      valor_unitario: primeiro.valor_unitario,
      observacao: novaObservacao
    };

    await atualizarLaudoRanonPendente(primeiro.id, dadosAtualizados);

    for (const outro of outros) {
      await removerLaudoRanonPendente(outro.id);
    }

    showToast(`Registros do paciente ${registro} mesclados com sucesso!`, 'success');
    await recarregarDados();
  } catch (err) {
    showToast('Erro ao mesclar lançamentos: ' + err.message, 'error');
  }
};

function renderHistoricoPlanilhas() {
  const container = document.getElementById('historico-planilhas-container');
  if (!container) return;

  if (historicoPlanihas.length === 0) {
    container.innerHTML = '<p style="color: var(--text-muted); font-size: 0.9rem;">Nenhuma planilha salva ainda.</p>';
    return;
  }

  container.innerHTML = historicoPlanihas.map(h => {
    const salvoEm = h.salvo_em ? h.salvo_em.split(' ')[0] : '-';
    return `
      <div style="background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 16px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">
            <i data-lucide="file-spreadsheet" style="width: 14px; height: 14px; vertical-align: -2px; margin-right: 4px;"></i>
            ${h.arquivo_excel_backup}
          </div>
          <div style="font-size: 0.8rem; color: var(--text-muted);">Salvo em ${formatarDataBR(salvoEm)}</div>
        </div>
        <div style="text-align: right;">
          <div style="font-weight: 700; color: var(--color-teal);">${formatarMoedaBR(h.total_valor)}</div>
          <div style="font-size: 0.85rem; color: var(--text-secondary);">${h.quantidade} laudos</div>
        </div>
      </div>
    `;
  }).join('');

  lucide.createIcons();
}

// ═══════════════════════════════════════
// ESTRUTURA DA TELA
// ═══════════════════════════════════════

export function renderRanon() {


  return `
    <div class="page-header animate-in">
      <h1 class="page-header__title">Dr. Ranon / RX</h1>
      <p class="page-header__subtitle">Controle os laudos digitados, organize o lote diário e prepare a exportação da planilha.</p>
    </div>

    <!-- Metrics Grid -->
    <div class="metrics-grid animate-in" style="grid-template-columns: repeat(4, 1fr);">
      <div class="metric-card">
        <div class="metric-card__header"><div class="metric-card__label-top">Laudos pendentes</div></div>
        <div class="metric-card__body">
          <div class="metric-card__value" id="metrica-qtd-laudos">0</div>
          <div class="metric-card__desc" style="margin-top: 4px;">Total no lote</div>
        </div>
      </div>
      
      <div class="metric-card">
        <div class="metric-card__header"><div class="metric-card__label-top">Valor unitário atual</div></div>
        <div class="metric-card__body">
          <div class="metric-card__value" id="metrica-valor-unitario" style="color: var(--color-cyan);">R$ 2,00</div>
          <div class="metric-card__desc" style="margin-top: 4px;">Valor fixo por laudo</div>
        </div>
      </div>
      
      <div class="metric-card">
        <div class="metric-card__header"><div class="metric-card__label-top">Total previsto</div></div>
        <div class="metric-card__body">
          <div class="metric-card__value" id="metrica-total-previsto">R$ 0,00</div>
          <div class="metric-card__desc" style="margin-top: 4px;">Soma do lote pendente</div>
        </div>
      </div>
      
      <div class="metric-card">
        <div class="metric-card__header"><div class="metric-card__label-top">Último registro</div></div>
        <div class="metric-card__body">
          <div class="metric-card__value" id="metrica-ultimo-registro" style="font-size: 1.2rem; font-family: monospace;">-</div>
          <div class="metric-card__desc" style="margin-top: 4px;">Último laudo digitado</div>
        </div>
      </div>
    </div>

    <div class="dashboard-grid animate-in">
      
      <!-- Formulário -->
      <div class="form-card" style="grid-column: span 2;">
        <h3 style="margin-bottom: 24px; font-weight: 600; color: var(--text-primary);">Novo Laudo</h3>
        
        <form id="form-lancamento">
          <!-- Campos Ocultos para preservar lógica -->
          <input type="hidden" id="form-data">
          <input type="hidden" id="form-valor">

          <div class="form-grid" style="grid-template-columns: 1fr 1fr 2fr;">
            <div class="form-group">
              <label class="form-label">Registro do Paciente</label>
              <input type="text" class="form-control" id="form-registro" placeholder="Ex: 123456" style="font-family: monospace; font-size: 1.1rem; letter-spacing: 1px;" required>
            </div>
            <div class="form-group">
              <label class="form-label">Quantidade</label>
              <input type="number" class="form-control" id="form-quantidade" value="1" min="1" step="1" required style="font-size: 1.1rem; text-align: center;">
            </div>
            <div class="form-group">
              <label class="form-label">Exame</label>
              <input type="text" class="form-control" id="form-obs" placeholder="Ex: RX Tórax PA">
            </div>
          </div>

          <div style="margin-top: 24px;">
            <button type="submit" class="btn-primary" style="background: var(--color-cyan); color: #fff; width: 100%; justify-content: center; font-size: 1.1rem; padding: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; box-shadow: 0 4px 12px rgba(6, 182, 212, 0.25);">
              <i data-lucide="plus" style="width: 20px; height: 20px;"></i> Adicionar Laudo
            </button>
          </div>
        </form>
      </div>

      <!-- Ações -->
      <div class="form-card">
        <h3 style="margin-bottom: 16px; font-weight: 600; color: var(--text-primary);">Ações</h3>
        
        <div class="form-group" style="margin-bottom: 16px;">
          <label class="form-label">Mês de referência</label>
          <input type="text" class="form-control" id="form-mes-referencia" placeholder="MM/AAAA" style="text-align: center; font-weight: 600; font-size: 1.1rem;">
        </div>

        <div style="display: flex; flex-direction: column; gap: 8px;">
          <button id="btn-exportar-excel" class="btn-secondary" onclick="window.exportarExcelRanon()" style="justify-content: center;">
            <i data-lucide="file-spreadsheet"></i> Exportar Excel
          </button>
          <button id="btn-salvar-planilha" class="btn-primary" onclick="window.abrirModalSalvarPlanilha()" style="justify-content: center; background: var(--color-teal);">
            <i data-lucide="database"></i> Salvar Planilha Definitiva
          </button>
        </div>
      </div>
      
    </div>

    <!-- Tabela Lote -->
    <div class="animate-in" style="animation-delay: 0.3s; margin-top: 16px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h3 style="font-weight: 600; color: var(--text-primary);">Laudos Pendentes</h3>
        <div style="display: flex; gap: 8px;">
          <input type="text" id="input-pesquisa-ranon" class="form-control" placeholder="Pesquisar registro..." oninput="window.filtrarLaudosRanon(this.value)" style="max-width: 200px;">
          <button onclick="window.abrirModalLimparTudo()" class="btn-secondary" style="color: var(--color-red);">
            <i data-lucide="trash-2"></i> Limpar Tudo
          </button>
        </div>
      </div>

      <!-- Abas para alternar entre todos os pendentes e duplicados -->
      <div class="tabs animate-in" style="margin-bottom: 16px; display: flex; gap: 8px; border-bottom: 1px solid var(--border-subtle); padding-bottom: 8px;">
        <button id="tab-ranon-pendentes" class="tab-btn active" onclick="window.mudarAbaRanon('pendentes')" style="background:none; border:none; color:var(--text-primary); font-size:1rem; font-weight:500; cursor:pointer; padding:8px 16px; border-radius:6px; transition:0.2s;">Todos os Pendentes</button>
        <button id="tab-ranon-duplicados" class="tab-btn" onclick="window.mudarAbaRanon('duplicados')" style="background:none; border:none; color:var(--text-primary); font-size:1rem; font-weight:500; cursor:pointer; padding:8px 16px; border-radius:6px; transition:0.2s;">Duplicados</button>
      </div>

      <style>
        .tab-btn.active { background: var(--bg-surface); border: 1px solid var(--border-subtle); color: var(--color-cyan) !important; }
      </style>
      
      <div class="table-container">
        <table class="table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Horário</th>
              <th>Registro do Paciente</th>
              <th style="text-align: center;">Qtd</th>
              <th>Valor Unit.</th>
              <th>Total</th>
              <th>Exame</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody id="tabela-ranon-body">
            <!-- Render via JS -->
          </tbody>
        </table>
      </div>
    </div>

    <!-- Últimas Planilhas Salvas -->
    <div class="form-card animate-in" style="animation-delay: 0.4s;">
      <h3 style="margin-bottom: 16px; font-weight: 600; color: var(--text-primary);">Últimas Planilhas Salvas</h3>
      <div id="historico-planilhas-container">
        <!-- Render via JS -->
      </div>
    </div>

    <!-- Modal Limpar Tudo -->
    <div class="modal-overlay" id="modal-limpar-tudo">
      <div class="modal-content">
        <div class="modal-header">
          <h3>Limpar todos os laudos pendentes?</h3>
          <p>Esta ação vai apagar apenas o lote temporário do Dr. Ranon / RX. O histórico definitivo não será alterado.</p>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="window.fecharModalLimparTudo()">Cancelar</button>
          <button class="btn-primary" id="btn-confirmar-limpar" onclick="window.confirmarLimparTudo()" style="background: var(--color-red);">
            <i data-lucide="trash-2"></i> Sim, limpar tudo
          </button>
        </div>
      </div>
    </div>

    <!-- Modal Salvar Planilha -->
    <div class="modal-overlay" id="modal-salvar-planilha">
      <div class="modal-content">
        <div class="modal-header">
          <h3>Salvar planilha?</h3>
          <p>Esta ação vai salvar todos os laudos pendentes no histórico definitivo, gerar um backup físico da planilha e limpar o lote atual do Dr. Ranon / RX.</p>
        </div>
        <div class="modal-body" id="modal-salvar-resumo">
          <!-- Resumo dinâmico -->
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="window.fecharModalSalvarPlanilha()">Cancelar</button>
          <button class="btn-primary" id="btn-confirmar-salvar" onclick="window.confirmarSalvarPlanilha()" style="background: var(--color-teal);">
            <i data-lucide="check"></i> Sim, salvar planilha
          </button>
        </div>
      </div>
    </div>
  `;
}
