import { apiFetch } from '../services/http.js';
import { setIconMessage } from '../security/safeDom.js';
/**
 * Puzoto Life — Importar Dados
 */

const API_BASE = '/api';

let arquivoSelecionado = null;
let conteudoArquivo = null;
let previewData = null;
let modoImportacao = 'adicionar';
let evitarDuplicados = true;
let resultadoImportacao = null;

function showToast(message, type = 'success') {
  let c = document.getElementById('toast-container');
  if (!c) { c = document.createElement('div'); c.id = 'toast-container'; c.className = 'toast-container'; document.body.appendChild(c); }
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  setIconMessage(t, type === 'success' ? 'check-circle' : 'alert-circle', message);
  c.appendChild(t);
  if (typeof lucide !== 'undefined') lucide.createIcons();
  setTimeout(() => { t.style.animation = 'slideOutRight 0.3s forwards'; setTimeout(() => t.remove(), 300); }, 3000);
}

function formatarTamanho(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatarData(d) {
  const now = d || new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(now.getDate())}/${pad(now.getMonth()+1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

// ===========================================
// INIT
// ===========================================

export async function initImportarDados() {
  const health = await (await apiFetch('/api/health')).json();
  if (health.storage === 'postgres') {
    const content = document.getElementById('pageContent');
    content.innerHTML = '<section class="card"><h1>Importar dados</h1><p>A importação na nuvem ainda está em preparação. Seus dados continuam disponíveis nas outras telas.</p><p>Você pode exportar uma cópia pela página Backup.</p></section>';
    return;
  }
  // File input
  const fileInput = document.getElementById('import-file-input');
  if (fileInput) {
    fileInput.addEventListener('change', handleFileSelect);
  }
  const btnSelecionar = document.getElementById('btn-selecionar-arquivo');
  if (btnSelecionar) {
    btnSelecionar.addEventListener('click', () => {
      document.getElementById('import-file-input').click();
    });
  }
  const btnValidar = document.getElementById('btn-validar-arquivo');
  if (btnValidar) btnValidar.addEventListener('click', validarArquivo);

  const btnImportar = document.getElementById('btn-importar-dados');
  if (btnImportar) btnImportar.addEventListener('click', abrirModalConfirmacao);

  const selectModo = document.getElementById('import-modo');
  if (selectModo) selectModo.addEventListener('change', (e) => { modoImportacao = e.target.value; });

  const toggleDuplicados = document.getElementById('import-evitar-duplicados');
  if (toggleDuplicados) toggleDuplicados.addEventListener('change', (e) => { evitarDuplicados = e.target.checked; });
}

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (!file.name.endsWith('.json')) {
    showToast('Apenas arquivos .json sao aceitos.', 'error');
    e.target.value = '';
    return;
  }
  if (file.size > 50 * 1024 * 1024) {
    showToast('Arquivo excede 50MB.', 'error');
    e.target.value = '';
    return;
  }

  arquivoSelecionado = file;
  previewData = null;
  resultadoImportacao = null;

  const reader = new FileReader();
  reader.onload = (ev) => {
    conteudoArquivo = ev.target.result;
    renderInfoArquivo();
  };
  reader.readAsText(file);
}

function renderInfoArquivo() {
  const container = document.getElementById('import-file-info');
  if (!container || !arquivoSelecionado) return;

  container.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;padding:16px;background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:var(--radius-sm);">
      <div style="width:48px;height:48px;border-radius:12px;background:var(--color-teal-dim);display:flex;align-items:center;justify-content:center;">
        <i data-lucide="file-json" style="color:var(--color-teal);width:24px;height:24px;"></i>
      </div>
      <div style="flex:1;">
        <div style="font-weight:600;color:var(--text-primary);">${arquivoSelecionado.name}</div>
        <div style="font-size:0.85rem;color:var(--text-muted);margin-top:2px;">
          ${formatarTamanho(arquivoSelecionado.size)} &bull; Selecionado em ${formatarData(new Date())}
        </div>
      </div>
      <button id="btn-validar-arquivo" class="btn-primary" style="padding:8px 20px;">
        <i data-lucide="shield-check" style="width:16px;height:16px;"></i> Validar Arquivo
      </button>
    </div>
  `;
  if (typeof lucide !== 'undefined') lucide.createIcons();

  document.getElementById('btn-validar-arquivo').addEventListener('click', validarArquivo);
  document.getElementById('import-preview-section').style.display = 'none';
  document.getElementById('import-resultado-section').style.display = 'none';
}

// ===========================================
// VALIDAR
// ===========================================

async function validarArquivo() {
  if (!conteudoArquivo) {
    showToast('Selecione um arquivo primeiro.', 'error');
    return;
  }

  const btn = document.getElementById('btn-validar-arquivo');
  if (btn) btn.innerHTML = '<i data-lucide="loader" class="spin"></i> Validando...';

  try {
    const res = await apiFetch(`${API_BASE}/importar/validar-json`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: conteudoArquivo
    });

    const data = await res.json();

    if (!data.ok) {
      showToast(data.error || 'Arquivo invalido.', 'error');
      if (btn) btn.innerHTML = '<i data-lucide="shield-check"></i> Validar Arquivo';
      if (typeof lucide !== 'undefined') lucide.createIcons();
      return;
    }

    previewData = data.data.preview;
    showToast('Arquivo validado com sucesso!', 'success');
    renderPreview();
  } catch (err) {
    showToast('Erro ao validar: ' + err.message, 'error');
  }
  if (btn) btn.innerHTML = '<i data-lucide="shield-check"></i> Validar Arquivo';
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ===========================================
// PREVIEW
// ===========================================

function renderPreview() {
  const section = document.getElementById('import-preview-section');
  if (!section || !previewData) return;
  section.style.display = 'block';

  const p = previewData;
  const reconhecidas = p.tabelas.filter(t => t.status === 'reconhecida');
  const ignoradas = p.tabelas.filter(t => t.status === 'ignorada');

  document.getElementById('preview-cards').innerHTML = `
    <div class="metric-card"><div class="metric-card__header"><div class="metric-card__label-top">Tabelas Encontradas</div><div class="metric-card__icon" style="background:var(--color-teal-dim);"><i data-lucide="table" style="color:var(--color-teal);"></i></div></div><div class="metric-card__body"><div class="metric-card__value">${p.tabelas_encontradas}</div><div class="metric-card__desc">${ignoradas.length} ignorada(s)</div></div></div>
    <div class="metric-card"><div class="metric-card__header"><div class="metric-card__label-top">Total de Registros</div><div class="metric-card__icon" style="background:var(--color-blue-dim);"><i data-lucide="database" style="color:var(--color-blue);"></i></div></div><div class="metric-card__body"><div class="metric-card__value">${p.total_registros}</div><div class="metric-card__desc">em todas as tabelas</div></div></div>
    <div class="metric-card"><div class="metric-card__header"><div class="metric-card__label-top">Registros Trabalho</div><div class="metric-card__icon" style="background:var(--color-purple-dim);"><i data-lucide="briefcase" style="color:var(--color-purple);"></i></div></div><div class="metric-card__body"><div class="metric-card__value">${p.registros_trabalho}</div></div></div>
    <div class="metric-card"><div class="metric-card__header"><div class="metric-card__label-top">Registros Financeiros</div><div class="metric-card__icon" style="background:var(--color-orange-dim);"><i data-lucide="wallet" style="color:var(--color-orange);"></i></div></div><div class="metric-card__body"><div class="metric-card__value">${p.registros_financeiros}</div></div></div>
    <div class="metric-card"><div class="metric-card__header"><div class="metric-card__label-top">Configuracoes</div><div class="metric-card__icon" style="background:var(--color-teal-dim);"><i data-lucide="settings" style="color:var(--color-teal);"></i></div></div><div class="metric-card__body"><div class="metric-card__value">${p.configuracoes_encontradas}</div></div></div>
  `;

  let tabelaHtml = p.tabelas.map(t => {
    let badgeColor = t.status === 'reconhecida' ? 'var(--color-teal)' : (t.status === 'ignorada' ? 'var(--color-orange)' : 'var(--color-red)');
    let statusLabel = t.status === 'reconhecida' ? 'Reconhecida' : (t.status === 'ignorada' ? 'Ignorada' : 'Invalida');
    return `<tr>
      <td style="font-weight:600;">${t.nome}</td>
      <td>${t.quantidade}</td>
      <td><span style="display:inline-block;padding:4px 12px;border-radius:20px;font-size:0.8rem;font-weight:600;background:${badgeColor}18;color:${badgeColor};border:1px solid ${badgeColor}30;">${statusLabel}</span></td>
    </tr>`;
  }).join('');

  document.getElementById('preview-tabela-body').innerHTML = tabelaHtml;

  // Habilitar botao importar
  const btnImportar = document.getElementById('btn-importar-dados');
  if (btnImportar && reconhecidas.length > 0) {
    btnImportar.disabled = false;
    btnImportar.style.opacity = '1';
    btnImportar.style.cursor = 'pointer';
  }

  if (typeof lucide !== 'undefined') lucide.createIcons();
  section.scrollIntoView({ behavior: 'smooth' });
}

// ===========================================
// MODAL CONFIRMACAO
// ===========================================

function abrirModalConfirmacao() {
  if (!previewData) { showToast('Valide o arquivo primeiro.', 'error'); return; }

  const reconhecidas = previewData.tabelas.filter(t => t.status === 'reconhecida');
  const modoTexto = modoImportacao === 'adicionar' ? 'Adicionar sem apagar dados' : 'Substituir dados existentes';

  document.getElementById('modal-import-resumo').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:8px;">
      <div style="display:flex;justify-content:space-between;"><span style="color:var(--text-secondary);">Arquivo:</span><strong style="color:var(--text-primary);">${arquivoSelecionado.name}</strong></div>
      <div style="display:flex;justify-content:space-between;"><span style="color:var(--text-secondary);">Tabelas reconhecidas:</span><strong style="color:var(--text-primary);">${reconhecidas.length}</strong></div>
      <div style="display:flex;justify-content:space-between;"><span style="color:var(--text-secondary);">Total de registros:</span><strong style="color:var(--text-primary);">${previewData.total_registros}</strong></div>
      <div style="display:flex;justify-content:space-between;"><span style="color:var(--text-secondary);">Modo:</span><strong style="color:var(--text-primary);">${modoTexto}</strong></div>
      <div style="display:flex;justify-content:space-between;"><span style="color:var(--text-secondary);">Evitar duplicados:</span><strong style="color:var(--text-primary);">${evitarDuplicados ? 'Sim' : 'Nao'}</strong></div>
    </div>
  `;

  document.getElementById('modal-import-confirmacao-input').value = '';
  document.getElementById('modal-importar-dados').classList.add('active');

  const inputConf = document.getElementById('modal-import-confirmacao-input');
  const btnFinal = document.getElementById('btn-confirmar-importacao');
  inputConf.oninput = () => {
    btnFinal.disabled = inputConf.value.trim() !== 'IMPORTAR';
    btnFinal.style.opacity = inputConf.value.trim() === 'IMPORTAR' ? '1' : '0.5';
  };
}

window.fecharModalImportacao = function() {
  document.getElementById('modal-importar-dados').classList.remove('active');
};

window.executarImportacao = async function() {
  const inputConf = document.getElementById('modal-import-confirmacao-input');
  if (inputConf.value.trim() !== 'IMPORTAR') {
    showToast('Digite IMPORTAR para confirmar.', 'error');
    return;
  }

  const btn = document.getElementById('btn-confirmar-importacao');
  if (btn) btn.innerHTML = '<i data-lucide="loader" class="spin"></i> Importando...';

  try {
    const payload = {
      conteudo: conteudoArquivo,
      modo: modoImportacao,
      evitarDuplicados: evitarDuplicados,
      confirmacao: 'IMPORTAR'
    };

    const res = await apiFetch(`${API_BASE}/importar/json`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!data.ok) {
      showToast(data.error || 'Erro na importacao.', 'error');
      if (btn) btn.innerHTML = '<i data-lucide="check"></i> Sim, importar dados';
      if (typeof lucide !== 'undefined') lucide.createIcons();
      return;
    }

    resultadoImportacao = data.data;
    window.fecharModalImportacao();
    showToast('Importacao concluida com sucesso!', 'success');
    renderResultado();
  } catch (err) {
    showToast('Erro ao importar: ' + err.message, 'error');
  }
  if (btn) btn.innerHTML = '<i data-lucide="check"></i> Sim, importar dados';
  if (typeof lucide !== 'undefined') lucide.createIcons();
};

// ===========================================
// RESULTADO
// ===========================================

function renderResultado() {
  const section = document.getElementById('import-resultado-section');
  if (!section || !resultadoImportacao) return;
  section.style.display = 'block';

  const r = resultadoImportacao.resultado;

  let detalhesHtml = '';
  if (r.detalhes && r.detalhes.length > 0) {
    detalhesHtml = r.detalhes.map(d => {
      let statusColor = d.status === 'importada' ? 'var(--color-teal)' : (d.status === 'vazia' ? 'var(--text-muted)' : 'var(--color-orange)');
      return `<tr>
        <td style="font-weight:600;">${d.tabela}</td>
        <td style="color:var(--color-teal);font-weight:600;">${d.importados}</td>
        <td style="color:var(--color-orange);">${d.ignorados}</td>
        <td><span style="color:${statusColor};font-weight:600;">${d.status}</span></td>
      </tr>`;
    }).join('');
  }

  let errosHtml = '';
  if (r.erros && r.erros.length > 0) {
    errosHtml = `<div style="margin-top:16px;padding:12px;background:var(--color-red)10;border:1px solid var(--color-red)30;border-radius:var(--radius-sm);"><strong style="color:var(--color-red);">Erros:</strong><ul style="margin:8px 0 0 16px;color:var(--text-secondary);font-size:0.85rem;">${r.erros.map(e => `<li>${e}</li>`).join('')}</ul></div>`;
  }

  document.getElementById('import-resultado-conteudo').innerHTML = `
    <div class="metrics-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:20px;">
      <div class="metric-card"><div class="metric-card__header"><div class="metric-card__label-top">Backup Criado</div></div><div class="metric-card__body"><div class="metric-card__value" style="font-size:0.9rem;word-break:break-all;">${resultadoImportacao.backup_criado}</div></div></div>
      <div class="metric-card"><div class="metric-card__header"><div class="metric-card__label-top">Tabelas Importadas</div></div><div class="metric-card__body"><div class="metric-card__value" style="color:var(--color-teal);">${r.tabelas_importadas}</div></div></div>
      <div class="metric-card"><div class="metric-card__header"><div class="metric-card__label-top">Registros Importados</div></div><div class="metric-card__body"><div class="metric-card__value" style="color:var(--color-teal);">${r.registros_importados}</div></div></div>
      <div class="metric-card"><div class="metric-card__header"><div class="metric-card__label-top">Registros Ignorados</div></div><div class="metric-card__body"><div class="metric-card__value" style="color:var(--color-orange);">${r.registros_ignorados}</div></div></div>
    </div>
    ${detalhesHtml ? `<div class="table-container"><table class="table"><thead><tr><th>Tabela</th><th>Importados</th><th>Ignorados</th><th>Status</th></tr></thead><tbody>${detalhesHtml}</tbody></table></div>` : ''}
    ${errosHtml}
    <div style="display:flex;gap:12px;margin-top:20px;">
      <button class="btn-secondary" onclick="if(window.navigateTo) window.navigateTo('backup');"><i data-lucide="database"></i> Ver Backup</button>
      <button class="btn-primary" onclick="if(window.navigateTo) window.navigateTo('dashboard');"><i data-lucide="layout-dashboard"></i> Ir para Dashboard</button>
    </div>
  `;

  if (typeof lucide !== 'undefined') lucide.createIcons();
  section.scrollIntoView({ behavior: 'smooth' });
}

// ===========================================
// RENDER PAGE
// ===========================================

export function renderImportarDadosPage() {


  return `
    <div class="page-header animate-in">
      <h1 class="page-header__title">Importar Dados</h1>
      <p class="page-header__subtitle">Importe dados com seguranca, valide arquivos e restaure informacoes externas.</p>
    </div>

    <!-- Selecionar Arquivo -->
    <div class="form-card animate-in" style="animation-delay:0.1s;">
      <h3 style="margin-bottom:16px;font-weight:600;color:var(--text-primary);display:flex;align-items:center;gap:8px;">
        <i data-lucide="upload" style="width:20px;height:20px;color:var(--color-teal);"></i> Selecionar Arquivo
      </h3>
      <p style="color:var(--text-secondary);margin-bottom:20px;font-size:0.9rem;">Selecione um arquivo JSON exportado pelo Puzoto Life.</p>

      <input type="file" id="import-file-input" accept=".json" style="display:none;">

      <div id="import-file-info">
        <div class="import-file-picker" style="border:2px dashed var(--border-subtle);border-radius:var(--radius-sm);padding:40px;text-align:center;cursor:pointer;transition:all 0.2s;" id="btn-selecionar-arquivo">
          <i data-lucide="file-up" style="width:40px;height:40px;color:var(--text-muted);margin-bottom:12px;"></i>
          <div style="font-weight:600;color:var(--text-primary);margin-bottom:4px;">Clique para selecionar um arquivo</div>
          <div style="font-size:0.85rem;color:var(--text-muted);">Aceita apenas .json (max 50MB)</div>
        </div>
      </div>
    </div>

    <!-- Preview -->
    <div id="import-preview-section" style="display:none;">
      <div class="form-card animate-in" style="animation-delay:0.2s;">
        <h3 style="margin-bottom:16px;font-weight:600;color:var(--text-primary);display:flex;align-items:center;gap:8px;">
          <i data-lucide="eye" style="width:20px;height:20px;color:var(--color-blue);"></i> Previa da Importacao
        </h3>

        <div id="preview-cards" class="metrics-grid" style="grid-template-columns:repeat(5,1fr);margin-bottom:20px;"></div>

        <div class="table-container">
          <table class="table">
            <thead><tr><th>Tabela</th><th>Registros</th><th>Status</th></tr></thead>
            <tbody id="preview-tabela-body"></tbody>
          </table>
        </div>
      </div>

      <!-- Opcoes -->
      <div class="form-card animate-in" style="animation-delay:0.3s;">
        <h3 style="margin-bottom:16px;font-weight:600;color:var(--text-primary);display:flex;align-items:center;gap:8px;">
          <i data-lucide="sliders" style="width:20px;height:20px;color:var(--color-purple);"></i> Opcoes de Importacao
        </h3>

        <div class="form-grid" style="grid-template-columns:1fr 1fr;gap:20px;">
          <div class="form-group">
            <label class="form-label">Modo de importacao</label>
            <select class="form-control" id="import-modo">
              <option value="adicionar" selected>Adicionar sem apagar dados atuais</option>
              <option value="substituir">Substituir dados existentes da mesma tabela</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Evitar duplicados</label>
            <div style="display:flex;align-items:center;gap:12px;margin-top:8px;">
              <label class="toggle-switch">
                <input type="checkbox" id="import-evitar-duplicados" checked>
                <span class="toggle-slider"></span>
              </label>
              <span style="color:var(--text-secondary);font-size:0.9rem;">Ignorar registros com ID duplicado</span>
            </div>
          </div>
        </div>

        <div style="margin-top:16px;padding:12px 16px;background:var(--color-teal)10;border:1px solid var(--color-teal)30;border-radius:var(--radius-sm);display:flex;align-items:center;gap:10px;">
          <i data-lucide="shield" style="width:18px;height:18px;color:var(--color-teal);flex-shrink:0;"></i>
          <span style="color:var(--text-secondary);font-size:0.85rem;">Por seguranca, o sistema sempre criara um backup automatico antes de importar.</span>
        </div>

        <div style="margin-top:20px;display:flex;justify-content:flex-end;">
          <button id="btn-importar-dados" class="btn-primary" disabled style="opacity:0.5;cursor:not-allowed;padding:10px 28px;font-size:1rem;background:var(--color-teal);">
            <i data-lucide="download" style="width:18px;height:18px;"></i> Importar Dados
          </button>
        </div>
      </div>
    </div>

    <!-- Resultado -->
    <div id="import-resultado-section" style="display:none;">
      <div class="form-card animate-in">
        <h3 style="margin-bottom:16px;font-weight:600;color:var(--color-teal);display:flex;align-items:center;gap:8px;">
          <i data-lucide="check-circle" style="width:20px;height:20px;"></i> Importacao Concluida
        </h3>
        <div id="import-resultado-conteudo"></div>
      </div>
    </div>

    <!-- Modal Confirmacao -->
    <div class="modal-overlay" id="modal-importar-dados">
      <div class="modal-content">
        <div class="modal-header">
          <h3>Confirmar importacao?</h3>
          <p style="margin-top:8px;color:var(--text-secondary);font-size:0.9rem;">Esta acao importara dados para o banco atual. Um backup automatico sera criado antes da importacao.</p>
        </div>
        <div class="modal-body" id="modal-import-resumo"></div>
        <div class="modal-body" style="padding-top:0;">
          <label class="form-label" style="margin-bottom:6px;">Digite <strong style="color:var(--color-teal);">IMPORTAR</strong> para continuar:</label>
          <input type="text" class="form-control" id="modal-import-confirmacao-input" placeholder="IMPORTAR" autocomplete="off" style="font-weight:600;letter-spacing:2px;text-align:center;">
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="window.fecharModalImportacao()">Cancelar</button>
          <button class="btn-primary" id="btn-confirmar-importacao" disabled style="opacity:0.5;background:var(--color-teal);" onclick="window.executarImportacao()">
            <i data-lucide="check"></i> Sim, importar dados
          </button>
        </div>
      </div>
    </div>
  `;
}
