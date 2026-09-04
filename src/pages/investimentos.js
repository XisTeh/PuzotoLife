import {
  listarInvestimentos, listarMovimentosInvestimento,
  registrarMovimentoInvestimento, ajustarSaldoInvestimento
} from '../services/api.js';
import { formatarMoedaBR, formatarDataBR, dataAtualISO } from '../utils/formatters.js';
import { escapeHtml, setIconMessage } from '../security/safeDom.js';

let cofreAtual = null;
let movimentos = [];
let saldoCorrecaoPendente = null;

function lerMoeda(valor) {
  let texto = String(valor ?? '').trim();
  if (!texto) return NaN;
  if (texto.includes(',') && texto.includes('.')) texto = texto.replace(/\./g, '');
  return Number(texto.replace(',', '.'));
}

function arredondarMoeda(valor) {
  return Math.round((Number(valor) + Number.EPSILON) * 100) / 100;
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
  setIconMessage(toast, type === 'success' ? 'check-circle' : 'alert-circle', message);
  container.appendChild(toast);
  if (window.lucide) window.lucide.createIcons();
  setTimeout(() => toast.remove(), 3500);
}

function tituloCofre(item) {
  if (!item) return 'COFRE';
  const instituicao = String(item.instituicao || '').replace(/^banco\s+/i, '').trim();
  return instituicao ? `COFRE ${instituicao.toUpperCase()}` : `COFRE ${String(item.nome).toUpperCase()}`;
}

function tipoAmigavel(tipo) {
  if (tipo === 'aporte') return 'Dinheiro guardado';
  if (tipo === 'resgate') return 'Dinheiro retirado';
  return 'Correção de saldo';
}

async function carregarCofre() {
  const cofres = await listarInvestimentos(true);
  cofreAtual = cofres[0] || null;
  movimentos = cofreAtual ? await listarMovimentosInvestimento(cofreAtual.id) : [];
  renderizarCofre();
}

function renderizarCofre() {
  const saldo = Number(cofreAtual?.saldo_atual || 0);
  document.getElementById('cofre-titulo').textContent = tituloCofre(cofreAtual);
  document.getElementById('cofre-saldo').textContent = formatarMoedaBR(saldo);
  document.getElementById('cofre-detalhe').textContent = cofreAtual
    ? `${cofreAtual.instituicao} · ${cofreAtual.nome}`
    : 'Nenhum cofre cadastrado.';
  document.getElementById('cofre-acoes').style.display = cofreAtual ? 'grid' : 'none';
  document.getElementById('cofre-inativo').style.display = cofreAtual && !cofreAtual.ativo ? 'block' : 'none';
  document.getElementById('cofre-resgate-disponivel').textContent = `Disponível para retirar: ${formatarMoedaBR(saldo)}`;
  document.querySelectorAll('[data-acao-cofre]').forEach(botao => { botao.disabled = !cofreAtual?.ativo; });
  ['aporte', 'resgate'].forEach(tipo => {
    const campoData = document.getElementById(`cofre-${tipo}-data`);
    if (campoData && !campoData.value) campoData.value = dataAtualISO();
  });
  renderizarHistorico();
  if (window.lucide) window.lucide.createIcons();
}

function renderizarHistorico() {
  const tbody = document.getElementById('cofre-tbody-movimentos');
  if (!movimentos.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:24px;">Nenhuma movimentação registrada.</td></tr>';
    return;
  }

  tbody.innerHTML = movimentos.map(movimento => {
    const valorExibido = movimento.tipo === 'resgate' ? -movimento.valor : movimento.valor;
    const cor = valorExibido < 0 ? 'var(--color-rose)' : 'var(--color-teal)';
    return `<tr>
      <td>${formatarDataBR(movimento.data)}</td>
      <td style="font-weight:700;color:${cor};">${tipoAmigavel(movimento.tipo)}</td>
      <td style="font-weight:700;color:${cor};">${valorExibido >= 0 ? '+' : '-'} ${formatarMoedaBR(Math.abs(valorExibido))}</td>
      <td>${escapeHtml(movimento.observacao || '—')}</td>
      <td style="font-weight:700;">${formatarMoedaBR(movimento.saldo_resultante)}</td>
    </tr>`;
  }).join('');
}

export async function initInvestimentos() {
  try {
    await carregarCofre();
  } catch (erro) {
    showToast('Erro ao carregar o Cofre: ' + erro.message, 'error');
  }
}

window.confirmarOperacaoCofre = async function(tipo) {
  if (!cofreAtual?.ativo || !['aporte', 'resgate'].includes(tipo)) return;
  const prefixo = `cofre-${tipo}`;
  const campoValor = document.getElementById(`${prefixo}-valor`);
  const campoObservacao = document.getElementById(`${prefixo}-obs`);
  const botao = document.getElementById(`${prefixo}-confirmar`);
  const valor = lerMoeda(campoValor.value);
  if (!Number.isFinite(valor) || valor <= 0) {
    showToast('Informe um valor maior que zero.', 'error');
    campoValor.focus();
    return;
  }
  const dados = {
    tipo,
    valor,
    data: document.getElementById(`${prefixo}-data`).value,
    observacao: campoObservacao.value
  };
  botao.disabled = true;
  try {
    await registrarMovimentoInvestimento(cofreAtual.id, dados);
    campoValor.value = '';
    campoObservacao.value = '';
    await carregarCofre();
    campoValor.focus();
    showToast(tipo === 'aporte' ? 'Dinheiro guardado no Cofre.' : 'Dinheiro retirado do Cofre.');
  } catch (erro) {
    showToast(erro.message, 'error');
  } finally {
    botao.disabled = !cofreAtual?.ativo;
  }
};

window.abrirCorrecaoCofre = function() {
  if (!cofreAtual?.ativo) return;
  document.getElementById('cofre-correcao-saldo-atual').textContent = formatarMoedaBR(cofreAtual.saldo_atual);
  document.getElementById('cofre-correcao-novo').value = '';
  document.getElementById('cofre-correcao-preview').style.display = 'none';
  document.getElementById('cofre-correcao-confirmar').style.display = 'none';
  document.getElementById('cofre-correcao-revisar').style.display = 'inline-flex';
  document.getElementById('cofre-modal-correcao').style.display = 'flex';
  saldoCorrecaoPendente = null;
};

window.fecharCorrecaoCofre = function() {
  saldoCorrecaoPendente = null;
  document.getElementById('cofre-modal-correcao').style.display = 'none';
};

window.invalidarRevisaoCorrecao = function() {
  saldoCorrecaoPendente = null;
  document.getElementById('cofre-correcao-preview').style.display = 'none';
  document.getElementById('cofre-correcao-confirmar').style.display = 'none';
  document.getElementById('cofre-correcao-revisar').style.display = 'inline-flex';
};

window.revisarCorrecaoCofre = function() {
  const campo = document.getElementById('cofre-correcao-novo');
  if (!campo.value.trim()) {
    showToast('Digite explicitamente o novo saldo do Cofre.', 'error');
    return;
  }
  const novoSaldo = lerMoeda(campo.value);
  if (!Number.isFinite(novoSaldo) || novoSaldo < 0) {
    showToast('Informe um saldo válido, igual ou maior que zero.', 'error');
    return;
  }

  const saldoAtual = Number(cofreAtual.saldo_atual || 0);
  const diferenca = arredondarMoeda(novoSaldo - saldoAtual);
  saldoCorrecaoPendente = arredondarMoeda(novoSaldo);
  document.getElementById('cofre-correcao-preview-atual').textContent = formatarMoedaBR(saldoAtual);
  document.getElementById('cofre-correcao-preview-novo').textContent = formatarMoedaBR(saldoCorrecaoPendente);
  document.getElementById('cofre-correcao-preview-diferenca').textContent = `${diferenca >= 0 ? '+' : '-'} ${formatarMoedaBR(Math.abs(diferenca))}`;
  document.getElementById('cofre-correcao-alerta-zero').style.display = saldoCorrecaoPendente === 0 && saldoAtual > 0 ? 'block' : 'none';
  document.getElementById('cofre-correcao-preview').style.display = 'block';
  document.getElementById('cofre-correcao-revisar').style.display = 'none';
  document.getElementById('cofre-correcao-confirmar').style.display = 'inline-flex';
};

window.confirmarCorrecaoCofre = async function() {
  if (!cofreAtual || saldoCorrecaoPendente === null) {
    showToast('Revise os valores antes de confirmar.', 'error');
    return;
  }

  const campo = document.getElementById('cofre-correcao-novo');
  if (!campo.value.trim()) {
    window.invalidarRevisaoCorrecao();
    showToast('Digite explicitamente o novo saldo do Cofre.', 'error');
    return;
  }

  const saldoDigitado = lerMoeda(campo.value);
  if (!Number.isFinite(saldoDigitado) || arredondarMoeda(saldoDigitado) !== saldoCorrecaoPendente) {
    window.invalidarRevisaoCorrecao();
    showToast('O valor mudou. Revise novamente antes de confirmar.', 'error');
    return;
  }

  try {
    const resultado = await ajustarSaldoInvestimento(cofreAtual.id, {
      saldo_correto: saldoCorrecaoPendente,
      data: dataAtualISO(),
      observacao: '',
      confirmar_correcao: true
    });
    window.fecharCorrecaoCofre();
    await carregarCofre();
    showToast(resultado.movimento_criado ? 'Saldo do Cofre corrigido.' : 'O saldo do Cofre já estava correto.');
  } catch (erro) {
    showToast(erro.message, 'error');
  }
};

function modalCorrecao() {
  return `<div id="cofre-modal-correcao" style="display:none;position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.78);align-items:center;justify-content:center;padding:20px;" onclick="if(event.target===this)window.fecharCorrecaoCofre()"><div class="form-card" style="width:min(480px,100%);padding:26px;"><div style="display:flex;justify-content:space-between;align-items:start;gap:16px;margin-bottom:18px;"><div><h3 style="color:var(--text-primary);">Corrigir saldo</h3><p style="color:var(--text-muted);font-size:.85rem;margin-top:5px;">Use somente para reconciliar o Cofre com o Banco Inter.</p></div><button class="btn-icon" onclick="window.fecharCorrecaoCofre()" title="Fechar"><i data-lucide="x"></i></button></div><div style="padding:12px;background:var(--bg-body);border-radius:var(--radius-sm);margin-bottom:14px;color:var(--text-secondary);">Saldo atual: <strong id="cofre-correcao-saldo-atual" style="color:var(--text-primary);"></strong></div><div class="form-group" style="margin-bottom:16px;"><label class="form-label">Novo saldo no Inter*</label><input id="cofre-correcao-novo" class="form-control" inputmode="decimal" placeholder="Digite o saldo correto" oninput="window.invalidarRevisaoCorrecao()"></div><div id="cofre-correcao-preview" style="display:none;padding:14px;border:1px solid var(--border-color);border-radius:var(--radius-md);margin-bottom:16px;"><div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span>Saldo atual</span><strong id="cofre-correcao-preview-atual"></strong></div><div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span>Novo saldo informado</span><strong id="cofre-correcao-preview-novo"></strong></div><div style="display:flex;justify-content:space-between;"><span>Diferença</span><strong id="cofre-correcao-preview-diferenca"></strong></div><div id="cofre-correcao-alerta-zero" style="display:none;margin-top:12px;padding:10px;background:var(--color-rose-dim);color:var(--color-rose);border-radius:var(--radius-sm);font-weight:700;">Atenção: esta correção zerará o Cofre.</div></div><div style="display:flex;gap:10px;justify-content:flex-end;"><button class="btn-secondary" onclick="window.fecharCorrecaoCofre()">Cancelar</button><button id="cofre-correcao-revisar" class="btn-primary" onclick="window.revisarCorrecaoCofre()">Revisar correção</button><button id="cofre-correcao-confirmar" class="btn-primary" style="display:none;background:var(--color-rose);color:#fff;" onclick="window.confirmarCorrecaoCofre()">Confirmar correção</button></div></div></div>`;
}

export function renderInvestimentosPage() {

  return `
    <div id="toast-container" class="toast-container"></div>
    <div class="page-header animate-in"><div><h1 class="page-header__title">Cofre</h1><p class="page-header__subtitle">Dinheiro separado para seus planos e compras futuras.</p></div></div>

    <div class="form-card animate-in" style="padding:32px;margin-bottom:24px;text-align:center;"><div class="metric-card__icon" style="width:58px;height:58px;margin:0 auto 16px;background:var(--color-teal-dim);"><i data-lucide="piggy-bank" style="width:30px;height:30px;color:var(--color-teal);"></i></div><div id="cofre-titulo" style="font-size:.82rem;font-weight:800;letter-spacing:.1em;color:var(--color-teal);">COFRE</div><h2 id="cofre-saldo" style="font-size:2.5rem;margin:10px 0 5px;color:var(--text-primary);">R$ 0,00</h2><p style="color:var(--text-secondary);font-weight:600;">Dinheiro guardado</p><p id="cofre-detalhe" style="color:var(--text-muted);font-size:.84rem;margin-top:6px;"></p></div>

    <div id="cofre-inativo" style="display:none;padding:12px;border-radius:var(--radius-sm);background:var(--color-rose-dim);color:var(--color-rose);margin-bottom:16px;">Este Cofre está inativo.</div>
    <div id="cofre-acoes" style="display:none;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;margin-bottom:24px;" class="animate-in">
      <form class="form-card" style="padding:24px;border-color:rgba(20,184,166,.35);" onsubmit="event.preventDefault();window.confirmarOperacaoCofre('aporte')">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px;"><div class="metric-card__icon" style="background:var(--color-teal-dim);"><i data-lucide="arrow-down-to-line" style="color:var(--color-teal);"></i></div><div><h3 style="color:var(--text-primary);margin-bottom:3px;">Guardar dinheiro</h3><span style="color:var(--text-muted);font-size:.82rem;">Transferir do saldo disponível para o Cofre</span></div></div>
        <div class="form-group" style="margin-bottom:12px;"><label class="form-label" for="cofre-aporte-valor">Valor*</label><input id="cofre-aporte-valor" class="form-control" inputmode="decimal" placeholder="Digite o valor" required data-acao-cofre></div>
        <div class="form-group" style="margin-bottom:12px;"><label class="form-label" for="cofre-aporte-data">Data*</label><input id="cofre-aporte-data" type="date" class="form-control" required data-acao-cofre></div>
        <div class="form-group" style="margin-bottom:18px;"><label class="form-label" for="cofre-aporte-obs">Observação</label><input id="cofre-aporte-obs" class="form-control" placeholder="Opcional" data-acao-cofre></div>
        <button id="cofre-aporte-confirmar" type="submit" class="btn-primary" style="width:100%;justify-content:center;" data-acao-cofre><i data-lucide="arrow-down-to-line"></i> Guardar dinheiro</button>
      </form>

      <form class="form-card" style="padding:24px;border-color:rgba(244,63,94,.3);" onsubmit="event.preventDefault();window.confirmarOperacaoCofre('resgate')">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px;"><div class="metric-card__icon" style="background:var(--color-rose-dim);"><i data-lucide="arrow-up-from-line" style="color:var(--color-rose);"></i></div><div><h3 style="color:var(--text-primary);margin-bottom:3px;">Retirar dinheiro</h3><span id="cofre-resgate-disponivel" style="color:var(--text-muted);font-size:.82rem;">Disponível para retirar: R$ 0,00</span></div></div>
        <div class="form-group" style="margin-bottom:12px;"><label class="form-label" for="cofre-resgate-valor">Valor*</label><input id="cofre-resgate-valor" class="form-control" inputmode="decimal" placeholder="Digite o valor" required data-acao-cofre></div>
        <div class="form-group" style="margin-bottom:12px;"><label class="form-label" for="cofre-resgate-data">Data*</label><input id="cofre-resgate-data" type="date" class="form-control" required data-acao-cofre></div>
        <div class="form-group" style="margin-bottom:18px;"><label class="form-label" for="cofre-resgate-obs">Observação</label><input id="cofre-resgate-obs" class="form-control" placeholder="Opcional" data-acao-cofre></div>
        <button id="cofre-resgate-confirmar" type="submit" class="btn-primary" style="width:100%;justify-content:center;background:var(--color-rose);color:#fff;" data-acao-cofre><i data-lucide="arrow-up-from-line"></i> Retirar dinheiro</button>
      </form>
    </div>

    <div class="form-card animate-in" style="padding:24px;"><h3 style="margin-bottom:16px;color:var(--text-primary);">Histórico do Cofre</h3><div class="table-container"><table class="table"><thead><tr><th>Data</th><th>Movimentação</th><th>Valor</th><th>Observação</th><th>Saldo resultante</th></tr></thead><tbody id="cofre-tbody-movimentos"></tbody></table></div></div>

    <details class="animate-in" style="margin-top:18px;color:var(--text-muted);"><summary style="cursor:pointer;font-size:.85rem;">Mais opções</summary><div style="margin-top:10px;"><button class="btn-secondary" onclick="window.abrirCorrecaoCofre()" data-acao-cofre><i data-lucide="sliders-horizontal"></i> Corrigir saldo</button></div></details>
    ${modalCorrecao()}`;
}
