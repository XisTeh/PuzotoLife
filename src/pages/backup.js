import { apiFetch } from '../services/http.js';
/**
 * Puzoto Life — Página de Backup
 * Backup, restauração e exportação de dados.
 */

const API_BASE = '/api';

let infoAtual = null;
let backupsLista = [];

// ═══════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════

async function fetchAPI(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const res = await apiFetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });

  const contentType = res.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    const data = await res.json();
    if (data.ok === false) throw new Error(data.error || 'Erro na requisição');
    return data.data;
  } else {
    const text = await res.text();
    console.error('[BACKUP] Resposta não-JSON:', text);
    throw new Error(`Erro inesperado (Status ${res.status}).`);
  }
}

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
  if (typeof lucide !== 'undefined') lucide.createIcons();
  setTimeout(() => {
    toast.style.animation = 'slideOutRight 0.3s forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function formatarData(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ═══════════════════════════════════════
// RENDER
// ═══════════════════════════════════════

export function renderBackupPage() {
  return `
    <div class="backup-page animate-in">
      <!-- Header -->
      <div class="page-header">
        <h1 class="page-header__title">Backup</h1>
        <p class="page-header__subtitle">Proteja seus dados, crie cópias de segurança e restaure informações quando necessário.</p>
      </div>

      <!-- Info Cards -->
      <div class="backup-info-grid" id="backup-info-grid">
        <div class="backup-info-card">
          <div class="backup-info-card__icon" style="background: var(--color-teal-dim); color: var(--color-teal);">
            <i data-lucide="database"></i>
          </div>
          <div class="backup-info-card__content">
            <span class="backup-info-card__label">Banco Atual</span>
            <span class="backup-info-card__value" id="info-caminho">Carregando...</span>
          </div>
        </div>
        <div class="backup-info-card">
          <div class="backup-info-card__icon" style="background: var(--color-blue-dim); color: var(--color-blue);">
            <i data-lucide="hard-drive"></i>
          </div>
          <div class="backup-info-card__content">
            <span class="backup-info-card__label">Tamanho</span>
            <span class="backup-info-card__value" id="info-tamanho">—</span>
          </div>
        </div>
        <div class="backup-info-card">
          <div class="backup-info-card__icon" style="background: var(--color-purple-dim); color: var(--color-purple);">
            <i data-lucide="clock"></i>
          </div>
          <div class="backup-info-card__content">
            <span class="backup-info-card__label">Último Backup</span>
            <span class="backup-info-card__value" id="info-ultimo-backup">—</span>
          </div>
        </div>
        <div class="backup-info-card">
          <div class="backup-info-card__icon" style="background: var(--color-gold-dim); color: var(--color-gold);">
            <i data-lucide="shield-check"></i>
          </div>
          <div class="backup-info-card__content">
            <span class="backup-info-card__label">Status</span>
            <span class="backup-info-card__value" id="info-status">—</span>
          </div>
        </div>
      </div>

      <!-- Ações Rápidas -->
      <div class="backup-section">
        <h2 class="backup-section__title"><i data-lucide="zap"></i> Ações Rápidas</h2>
        <div class="backup-actions-grid">
          <button class="backup-action-btn backup-action-btn--primary" id="btn-criar-backup" onclick="window.criarBackup()">
            <i data-lucide="download-cloud"></i>
            <div class="backup-action-btn__text">
              <strong>Criar Backup Agora</strong>
              <small>Cópia segura do banco SQLite</small>
            </div>
          </button>
          <button class="backup-action-btn" onclick="window.exportarJSON()">
            <i data-lucide="file-json"></i>
            <div class="backup-action-btn__text">
              <strong>Exportar JSON</strong>
              <small>Todos os dados em JSON</small>
            </div>
          </button>
          <button class="backup-action-btn" onclick="window.exportarCSVTrabalho()">
            <i data-lucide="briefcase"></i>
            <div class="backup-action-btn__text">
              <strong>Exportar Trabalho CSV</strong>
              <small>Lançamentos, laudos, fechamentos</small>
            </div>
          </button>
          <button class="backup-action-btn" onclick="window.exportarCSVFinancas()">
            <i data-lucide="wallet"></i>
            <div class="backup-action-btn__text">
              <strong>Exportar Finanças CSV</strong>
              <small>Receitas, gastos, faturas, contas</small>
            </div>
          </button>
        </div>
      </div>

      <!-- Lista de Backups -->
      <div class="backup-section">
        <div class="backup-section__header">
          <h2 class="backup-section__title"><i data-lucide="archive"></i> Backups Salvos</h2>
          <span class="backup-section__badge" id="backup-count-badge">0</span>
        </div>
        <div id="backup-list-container">
          <div class="backup-empty-state">
            <i data-lucide="database" style="width:48px;height:48px;color:var(--text-muted);opacity:0.4;"></i>
            <p>Nenhum backup encontrado. Crie seu primeiro backup!</p>
          </div>
        </div>
      </div>

      <!-- Modal de Restauração -->
      <div class="backup-modal-overlay" id="modal-restaurar" style="display:none;">
        <div class="backup-modal">
          <div class="backup-modal__header">
            <h3><i data-lucide="alert-triangle" style="color:var(--color-gold);"></i> Restaurar Backup?</h3>
            <button class="backup-modal__close" onclick="window.fecharModalRestaurar()"><i data-lucide="x"></i></button>
          </div>
          <div class="backup-modal__body">
            <div class="backup-modal__warning">
              <i data-lucide="alert-octagon"></i>
              <p>Esta ação substituirá o banco atual pelo backup selecionado. Os dados atuais serão substituídos. Antes de restaurar, o sistema criará automaticamente um backup de segurança do banco atual.</p>
            </div>
            <div class="backup-modal__info" id="restore-info"></div>
            <div class="backup-modal__field">
              <label>Para confirmar, digite: <strong>RESTAURAR</strong></label>
              <input type="text" id="restore-confirm-input" placeholder="Digite RESTAURAR" oninput="window.validarRestaurar()">
            </div>
          </div>
          <div class="backup-modal__footer">
            <button class="btn-secondary" onclick="window.fecharModalRestaurar()">Cancelar</button>
            <button class="btn-danger" id="btn-confirmar-restaurar" disabled onclick="window.confirmarRestaurar()">
              <i data-lucide="rotate-ccw"></i> Restaurar
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════
// INICIALIZAÇÃO
// ═══════════════════════════════════════

export async function initBackup() {
  try {
    const [info, backups] = await Promise.all([
      fetchAPI('/backup/info'),
      fetchAPI('/backup/listar')
    ]);
    infoAtual = info;
    backupsLista = backups;
    renderInfo();
    renderBackupList();
  } catch (err) {
    console.error('[BACKUP] Erro ao carregar:', err);
    showToast('Erro ao carregar dados de backup.', 'error');
  }
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function renderInfo() {
  if (!infoAtual) return;

  const el = (id) => document.getElementById(id);
  const caminho = infoAtual.caminho || '—';
  el('info-caminho').textContent = caminho.split(/[/\\]/).pop(); // Só nome do arquivo
  el('info-caminho').title = caminho;
  el('info-tamanho').textContent = infoAtual.tamanhoFormatado || '—';
  el('info-ultimo-backup').textContent = infoAtual.ultimoBackup ? formatarData(infoAtual.ultimoBackup) : 'Nenhum';
  
  const statusEl = el('info-status');
  if (infoAtual.provider === 'postgres') {
    statusEl.textContent = 'A conferir';
    el('info-caminho').textContent = 'Supabase';
    el('info-tamanho').textContent = 'No painel';
    el('info-ultimo-backup').textContent = 'Consulte o painel';
    const button = el('btn-criar-backup');
    button.querySelector('strong').textContent = 'Gerenciar backups';
    button.querySelector('small').textContent = 'Abrir o painel do Supabase';
    button.onclick = () => window.open('https://supabase.com/dashboard', '_blank', 'noopener,noreferrer');
    return;
  }
  if (infoAtual.status === 'Protegido') {
    statusEl.innerHTML = `<span style="color:var(--color-teal);">● Protegido</span> <small style="color:var(--text-muted);">(${infoAtual.totalBackups} backup${infoAtual.totalBackups > 1 ? 's' : ''})</small>`;
  } else {
    statusEl.innerHTML = `<span style="color:var(--color-gold);">● Sem backup ainda</span>`;
  }
}

function renderBackupList() {
  const container = document.getElementById('backup-list-container');
  const badge = document.getElementById('backup-count-badge');
  if (!container) return;

  badge.textContent = backupsLista.length;

  if (infoAtual?.provider === 'postgres') {
    container.innerHTML = '<div class="backup-empty-state"><h3>Seu banco está no Supabase</h3><p>Consulte as cópias disponíveis e a retenção no painel. Você também pode exportar seus dados em JSON aqui.</p></div>';
    return;
  }

  if (backupsLista.length === 0) {
    container.innerHTML = `
      <div class="backup-empty-state">
        <i data-lucide="database" style="width:48px;height:48px;color:var(--text-muted);opacity:0.4;"></i>
        <p>Nenhum backup encontrado. Crie seu primeiro backup!</p>
      </div>
    `;
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  }

  container.innerHTML = `
    <div class="backup-table-wrap">
      <table class="backup-table">
        <thead>
          <tr>
            <th>Arquivo</th>
            <th>Tipo</th>
            <th>Data</th>
            <th>Tamanho</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          ${backupsLista.map((b, i) => {
            const isAuto = b.tipo === 'auto';
            const tipoBadge = isAuto
              ? '<span class="backup-type-badge backup-type-badge--auto"><i data-lucide="shield" style="width:12px;height:12px;"></i> Automático</span>'
              : '<span class="backup-type-badge backup-type-badge--manual"><i data-lucide="user" style="width:12px;height:12px;"></i> Manual</span>';
            return `
            <tr class="animate-in" style="animation-delay:${i * 0.04}s;">
              <td>
                <div class="backup-file-name">
                  <i data-lucide="file" style="width:16px;height:16px;color:var(--color-teal);flex-shrink:0;"></i>
                  <span>${b.nomeArquivo}</span>
                </div>
              </td>
              <td>${tipoBadge}</td>
              <td>${formatarData(b.criadoEm)}</td>
              <td><span class="backup-size-badge">${b.tamanhoFormatado}</span></td>
              <td>
                <div class="backup-actions">
                  <button class="backup-btn backup-btn--download" title="Baixar" onclick="window.baixarBackup('${b.nomeArquivo}')">
                    <i data-lucide="download"></i>
                  </button>
                  <button class="backup-btn backup-btn--restore" title="Restaurar" onclick="window.abrirModalRestaurar('${b.nomeArquivo}', '${formatarData(b.criadoEm)}', '${b.tamanhoFormatado}')">
                    <i data-lucide="rotate-ccw"></i>
                  </button>
                  <button class="backup-btn backup-btn--delete" title="Excluir" onclick="window.excluirBackup('${b.nomeArquivo}', ${i})">
                    <i data-lucide="trash-2"></i>
                  </button>
                </div>
              </td>
            </tr>
          `}).join('')}
        </tbody>
      </table>
    </div>
  `;
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ═══════════════════════════════════════
// AÇÕES
// ═══════════════════════════════════════

window.criarBackup = async function () {
  const btn = document.getElementById('btn-criar-backup');
  let originalHtml = '';
  if (btn) {
    originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.style.opacity = '0.6';
    btn.innerHTML = '<i data-lucide="loader" class="spin"></i> Criando...';
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  try {
    const resultado = await fetchAPI('/backup/criar', { method: 'POST' });
    showToast(`Backup criado: ${resultado.nomeArquivo}`);

    // Atualizar dados
    const [info, backups] = await Promise.all([
      fetchAPI('/backup/info'),
      fetchAPI('/backup/listar')
    ]);
    infoAtual = info;
    backupsLista = backups;
    renderInfo();
    renderBackupList();
  } catch (err) {
    showToast('Erro ao criar backup: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.style.opacity = '1';
      btn.innerHTML = originalHtml;
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
  }
};

window.baixarBackup = function (filename) {
  const url = `${API_BASE}/backup/download/${encodeURIComponent(filename)}`;
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  showToast('Download iniciado...');
};

window.exportarJSON = function () {
  const url = `${API_BASE}/backup/exportar-json`;
  const a = document.createElement('a');
  a.href = url;
  a.download = 'puzoto_life_export.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  showToast('Exportação JSON iniciada...');
};

window.exportarCSVTrabalho = function () {
  const url = `${API_BASE}/backup/exportar-csv-trabalho`;
  const a = document.createElement('a');
  a.href = url;
  a.download = 'puzoto_life_trabalho.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  showToast('Exportação Trabalho CSV iniciada...');
};

window.exportarCSVFinancas = function () {
  const url = `${API_BASE}/backup/exportar-csv-financas`;
  const a = document.createElement('a');
  a.href = url;
  a.download = 'puzoto_life_financas.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  showToast('Exportação Finanças CSV iniciada...');
};

// ═══════════════════════════════════════
// EXCLUIR
// ═══════════════════════════════════════

window.excluirBackup = async function (filename, index) {
  // Confirmação extra se for o backup mais recente (index === 0)
  if (index === 0) {
    if (!confirm(`⚠️ Este é o backup mais recente.\nTem certeza que deseja excluí-lo?\n\nArquivo: ${filename}`)) return;
  } else {
    if (!confirm(`Deseja excluir o backup "${filename}"?\nEssa ação não pode ser desfeita.`)) return;
  }

  try {
    await fetchAPI(`/backup/${encodeURIComponent(filename)}`, { method: 'DELETE' });
    showToast('Backup excluído.');

    const [info, backups] = await Promise.all([
      fetchAPI('/backup/info'),
      fetchAPI('/backup/listar')
    ]);
    infoAtual = info;
    backupsLista = backups;
    renderInfo();
    renderBackupList();
  } catch (err) {
    showToast('Erro ao excluir: ' + err.message, 'error');
  }
};

// ═══════════════════════════════════════
// RESTAURAR
// ═══════════════════════════════════════

let restaurarFilename = '';

window.abrirModalRestaurar = function (filename, data, tamanho) {
  restaurarFilename = filename;
  document.getElementById('restore-info').innerHTML = `
    <div class="backup-restore-detail"><strong>Arquivo:</strong> ${filename}</div>
    <div class="backup-restore-detail"><strong>Data:</strong> ${data}</div>
    <div class="backup-restore-detail"><strong>Tamanho:</strong> ${tamanho}</div>
  `;
  document.getElementById('restore-confirm-input').value = '';
  document.getElementById('btn-confirmar-restaurar').disabled = true;
  document.getElementById('modal-restaurar').style.display = 'flex';
  if (typeof lucide !== 'undefined') lucide.createIcons();
};

window.fecharModalRestaurar = function () {
  document.getElementById('modal-restaurar').style.display = 'none';
  restaurarFilename = '';
};

window.validarRestaurar = function () {
  const input = document.getElementById('restore-confirm-input').value;
  document.getElementById('btn-confirmar-restaurar').disabled = (input !== 'RESTAURAR');
};

window.confirmarRestaurar = async function () {
  const btn = document.getElementById('btn-confirmar-restaurar');
  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader"></i> Restaurando...';

  try {
    const resultado = await fetchAPI('/backup/restaurar', {
      method: 'POST',
      body: JSON.stringify({ filename: restaurarFilename, confirmacao: 'RESTAURAR' })
    });
    showToast(resultado.mensagem || 'Backup restaurado com sucesso!');
    window.fecharModalRestaurar();

    // Exibir alerta de recarga com mensagem completa
    setTimeout(() => {
      if (confirm('Backup restaurado com sucesso!\n\nReinicie o servidor ou recarregue a página para garantir que os dados atualizados sejam carregados.\n\nDeseja recarregar agora?')) {
        window.location.reload();
      }
    }, 500);
  } catch (err) {
    showToast('Erro ao restaurar: ' + err.message, 'error');
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="rotate-ccw"></i> Restaurar';
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
};
