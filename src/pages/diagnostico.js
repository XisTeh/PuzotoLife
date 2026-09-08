import { apiFetch } from '../services/http.js';
import { escapeHtml } from '../security/safeDom.js';
export function renderDiagnosticoPage() {
  setTimeout(() => window.executarDiagnosticoAPI(), 100);

  return `
    <div id="toast-container" class="toast-container"></div>
    <div class="page-header animate-in">
      <h1 class="page-header__title">Diagnóstico do Sistema</h1>
      <p class="page-header__subtitle">Verifique se o Puzoto Life está pronto para uso e se todos os módulos estão saudáveis.</p>
    </div>

    <div style="display: flex; gap: 12px; margin-bottom: 24px;" class="animate-in delay-1">
      <button id="btn-executar-diag" class="btn-primary" onclick="window.executarDiagnosticoAPI()">
        <i data-lucide="play-circle"></i> Executar Diagnóstico
      </button>
    </div>

    <div id="diag-summary-container" class="dashboard-grid animate-in delay-2" style="display: none; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 32px;">
      <!-- Resumo entra aqui -->
    </div>

    <div id="diag-acoes-container" style="display: none; margin-bottom: 32px;" class="animate-in delay-3">
      <!-- Ações recomendadas entram aqui -->
    </div>

    <div id="diag-results-container" style="display: flex; flex-direction: column; gap: 24px;" class="animate-in delay-4">
      <div style="text-align: center; color: var(--text-muted); padding: 48px; background: var(--bg-card); border-radius: 12px; border: 1px solid var(--border-subtle);">
        <i data-lucide="activity" style="width: 48px; height: 48px; margin-bottom: 16px; opacity: 0.5;"></i>
        <p>Clique em "Executar Diagnóstico" para iniciar a verificação.</p>
      </div>
    </div>
  `;
}

window.executarDiagnosticoAPI = async function() {
  const btn = document.getElementById('btn-executar-diag');
  const summary = document.getElementById('diag-summary-container');
  const results = document.getElementById('diag-results-container');
  const acoes = document.getElementById('diag-acoes-container');

  if (!btn || !summary || !results || !acoes) return;

  btn.innerHTML = '<i data-lucide="loader" class="spin"></i> Verificando...';
  btn.disabled = true;

  results.innerHTML = `
    <div style="text-align: center; color: var(--text-muted); padding: 48px; background: var(--bg-card); border-radius: 12px; border: 1px solid var(--border-subtle);">
      <i data-lucide="loader" class="spin" style="width: 48px; height: 48px; margin-bottom: 16px; color: var(--color-teal);"></i>
      <p>Executando dezenas de validações no sistema. Aguarde...</p>
    </div>
  `;
  summary.style.display = 'none';
  acoes.style.display = 'none';
  if (window.lucide) window.lucide.createIcons();

  try {
    const res = await apiFetch('/api/diagnostico/completo');
    const data = await res.json();
    
    // Se o backend retornou JSON com checks, sucesso
    if (data && data.checks) {
      renderizarResultadoDiagnostico(data);
    } else {
      throw new Error('Resposta inválida da API.');
    }
  } catch (err) {
    console.error(err);
    renderizarErroCritico(err.message);
  } finally {
    btn.innerHTML = '<i data-lucide="play-circle"></i> Executar Novamente';
    btn.disabled = false;
    if (window.lucide) window.lucide.createIcons();
  }
};

function renderizarResultadoDiagnostico(data) {
  const summary = document.getElementById('diag-summary-container');
  const results = document.getElementById('diag-results-container');
  const acoes = document.getElementById('diag-acoes-container');

  // ==========================================
  // RESUMO
  // ==========================================
  let statusGeralCor = 'var(--color-teal)';
  let statusGeralIcon = 'check-circle';
  let statusGeralTexto = 'Sistema Saudável';

  if (data.status_geral === 'erro') {
    statusGeralCor = 'var(--color-rose)';
    statusGeralIcon = 'alert-triangle';
    statusGeralTexto = 'Erros Críticos';
  } else if (data.status_geral === 'alerta') {
    statusGeralCor = 'var(--color-amber)';
    statusGeralIcon = 'alert-circle';
    statusGeralTexto = 'Atenção Necessária';
  }

  summary.innerHTML = `
    <div class="stat-card" style="border-left: 4px solid ${statusGeralCor};">
      <div class="stat-card__title">Status Geral</div>
      <div class="stat-card__value" style="color: ${statusGeralCor}; font-size: 1.2rem; display: flex; align-items: center; gap: 8px;">
        <i data-lucide="${statusGeralIcon}"></i> ${statusGeralTexto}
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-card__title">Checks OK</div>
      <div class="stat-card__value" style="color: var(--color-teal);">${data.resumo.ok}</div>
    </div>
    <div class="stat-card">
      <div class="stat-card__title">Alertas</div>
      <div class="stat-card__value" style="color: ${data.resumo.alertas > 0 ? 'var(--color-amber)' : 'var(--text-primary)'};">${data.resumo.alertas}</div>
    </div>
    <div class="stat-card">
      <div class="stat-card__title">Erros</div>
      <div class="stat-card__value" style="color: ${data.resumo.erros > 0 ? 'var(--color-rose)' : 'var(--text-primary)'};">${data.resumo.erros}</div>
    </div>
  `;
  summary.style.display = 'grid';

  // ==========================================
  // AÇÕES RECOMENDADAS
  // ==========================================
  if (data.resumo.alertas > 0 || data.resumo.erros > 0) {
    let recsHtml = '';
    const checksComProblema = data.checks.filter(c => c.status !== 'ok');
    
    checksComProblema.forEach(c => {
      let icon = c.status === 'erro' ? 'x-circle' : 'alert-circle';
      let color = c.status === 'erro' ? 'var(--color-rose)' : 'var(--color-amber)';
      recsHtml += `
        <div style="display: flex; align-items: flex-start; gap: 12px; margin-bottom: 8px;">
          <i data-lucide="${icon}" style="color: ${color}; width: 18px; height: 18px; margin-top: 2px;"></i>
          <div>
            <strong style="color: var(--text-primary);">${escapeHtml(c.grupo)} - ${escapeHtml(c.nome)}</strong><br>
            <span style="color: var(--text-muted); font-size: 0.9rem;">${escapeHtml(c.mensagem)}</span>
          </div>
        </div>
      `;
    });

    acoes.innerHTML = `
      <div style="background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 12px; padding: 24px;">
        <h3 style="font-weight: 600; color: var(--text-primary); margin-bottom: 16px; display: flex; align-items: center; gap: 8px;">
          <i data-lucide="info" style="color: var(--color-amber);"></i> Ações Recomendadas
        </h3>
        ${recsHtml}
      </div>
    `;
    acoes.style.display = 'block';
  } else {
    acoes.innerHTML = '';
    acoes.style.display = 'none';
  }

  // ==========================================
  // CHECKS DETALHADOS POR GRUPO
  // ==========================================
  // Agrupar checks
  const grupos = {};
  data.checks.forEach(c => {
    if (!grupos[c.grupo]) grupos[c.grupo] = [];
    grupos[c.grupo].push(c);
  });

  let resultsHtml = '';
  for (const grupoName in grupos) {
    const checksGrupo = grupos[grupoName];
    
    let itensHtml = '';
    checksGrupo.forEach(c => {
      let bg = 'var(--bg-main)';
      let color = 'var(--text-primary)';
      let icon = 'check';
      let iconColor = 'var(--color-teal)';
      
      if (c.status === 'erro') {
        bg = 'var(--color-rose-dim)';
        icon = 'x';
        iconColor = 'var(--color-rose)';
      } else if (c.status === 'alerta') {
        bg = 'rgba(245, 158, 11, 0.1)';
        icon = 'alert-triangle';
        iconColor = 'var(--color-amber)';
      }

      itensHtml += `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: ${bg}; border-radius: 8px; border: 1px solid var(--border-subtle);">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 50%; background: ${iconColor}20;">
              <i data-lucide="${icon}" style="color: ${iconColor}; width: 16px; height: 16px;"></i>
            </div>
            <div>
              <div style="font-weight: 500; color: ${color}; font-size: 0.95rem;">${escapeHtml(c.nome)}</div>
              <div style="font-size: 0.85rem; color: var(--text-muted);">${escapeHtml(c.mensagem)}</div>
            </div>
          </div>
          <div style="font-weight: 600; font-size: 0.8rem; text-transform: uppercase; color: ${iconColor};">
            ${escapeHtml(c.status)}
          </div>
        </div>
      `;
    });

    resultsHtml += `
      <div class="form-card" style="padding: 24px;">
        <h3 style="font-weight: 600; color: var(--text-primary); margin-bottom: 16px;">${grupoName}</h3>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          ${itensHtml}
        </div>
      </div>
    `;
  }

  results.innerHTML = resultsHtml;
}

function renderizarErroCritico(mensagem) {
  const summary = document.getElementById('diag-summary-container');
  const results = document.getElementById('diag-results-container');
  const acoes = document.getElementById('diag-acoes-container');

  summary.style.display = 'none';
  acoes.style.display = 'none';

  results.innerHTML = `
    <div style="text-align: center; padding: 48px; background: var(--color-rose-dim); border-radius: 12px; border: 1px solid var(--color-rose);">
      <i data-lucide="wifi-off" style="width: 48px; height: 48px; margin-bottom: 16px; color: var(--color-rose);"></i>
      <h3 style="color: var(--color-rose); font-weight: 600; margin-bottom: 8px;">Falha de Conexão</h3>
      <p style="color: var(--text-primary); margin-bottom: 16px;">O Backend não está acessível ou ocorreu um erro na rede.</p>
      <code style="display: block; padding: 8px; background: rgba(0,0,0,0.2); border-radius: 4px; color: var(--text-muted); font-size: 0.8rem;">${mensagem}</code>
    </div>
  `;
}
