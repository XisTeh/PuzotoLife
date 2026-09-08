import { escapeHtml } from './safeDom.js';

const EVENTS = ['click', 'change', 'input', 'submit', 'keydown', 'keyup'];
const ALLOWED_ACTIONS = new Set([
  'abrirCorrecaoCofre', 'abrirEditarGasto', 'abrirHistoricoPessoa', 'abrirModalExcluirCompra',
  'abrirModalFechamentoMes', 'abrirModalLimparTudo', 'abrirModalLimpeza', 'abrirModalListaFaturasCartao',
  'abrirModalNovaCategoria', 'abrirModalNovaEmpresa', 'abrirModalNovoCartao', 'abrirModalNovoPagador',
  'abrirModalPagarFatura', 'abrirModalPagarParcelaDivida', 'abrirModalRestaurar', 'abrirModalSalvarPlanilha',
  'abrirModalVerParcelasCompra', 'aoMudarEmpresaAjuste', 'ativarCartao', 'ativarCategoria', 'ativarEmpresa',
  'ativarPagador', 'atualizarComparativoMensal', 'atualizarDashboard', 'atualizarDiagnostico',
  'atualizarRelatorio', 'atualizarRelatorioFinancas', 'atualizarRelatorioGeral', 'atualizarTotalAntecipacao',
  'baixarBackup', 'calcRestantesEA', 'calcResumoParcelada', 'cancelarCP', 'cancelarPD', 'cancelarRec',
  'carregarPreviaMes', 'confirmarAjusteRetroativo', 'confirmarAntecipacaoParcelas', 'confirmarCorrecaoCofre',
  'confirmarEditarGasto', 'confirmarEditarValorPD', 'confirmarExcluirCompra', 'confirmarFechamentoDia',
  'confirmarFechamentoMes', 'confirmarLimparTudo', 'confirmarOperacaoCofre', 'confirmarPagamentoFatura',
  'confirmarPagarParcelaDivida', 'confirmarRestaurar', 'confirmarSalvarPlanilha', 'criarBackup',
  'desativarCartao', 'desativarCategoria', 'desativarEmpresa', 'desativarPagador', 'desfazerFechamento',
  'editarCartao', 'editarCategoria', 'editarCompraParcelada', 'editarEmpresa', 'editarLaudoRanon',
  'editarLote', 'editarPagador', 'editarRec', 'editarValorCP', 'editarValorPD', 'excluirBackup',
  'excluirCartao', 'excluirDividaParcelada', 'excluirGasto', 'excluirLaudoRanon', 'excluirLote',
  'excluirPD', 'excluirRec', 'executarDiagnosticoAPI', 'executarImportacao', 'executarLimpeza',
  'exportarCSVFinancas', 'exportarCSVTrabalho', 'exportarExcelRanon', 'exportarJSON', 'fecharCorrecaoCofre',
  'fecharModalCartao', 'fecharModalCategoria', 'fecharModalConfAjuste', 'fecharModalEditarCompra',
  'fecharModalEmpresa', 'fecharModalExcluirCompra', 'fecharModalFatura', 'fecharModalFechamentoDia',
  'fecharModalFechamentoMes', 'fecharModalHistoricoPD', 'fecharModalImportacao', 'fecharModalLimparTudo',
  'fecharModalLimpeza', 'fecharModalListaFaturasCartao', 'fecharModalPagador', 'fecharModalPagarFatura',
  'fecharModalRestaurar', 'fecharModalSalvarPlanilha', 'fecharModalVerParcelasCompra', 'filtrarCategorias',
  'filtrarContasPagar', 'filtrarHistorico', 'filtrarLaudosRanon', 'filtrarPessoasDividas', 'filtrarReceitas',
  'invalidarRevisaoCorrecao', 'marcarCP_Pago', 'mesclarDuplicadosRanon', 'mudarAbaHistorico',
  'mudarAbaRanon', 'navigateTo', 'prepararAjusteRetroativo', 'receberPorPagador', 'receberRec',
  'resolverPD', 'revisarCorrecaoCofre', 'salvarCartao', 'salvarCategoria', 'salvarCompra',
  'salvarCompraEmAndamento', 'salvarConfigGeral', 'salvarContaPagar', 'salvarDividaParcelada',
  'salvarEdicaoCompra', 'salvarEmpresa', 'salvarGasto', 'salvarPagador', 'salvarPessoaDivida',
  'salvarReceita', 'selecionarMesHistorico', 'setFiltroCartaoCompra', 'setFormModoPD', 'toggleModoCompra',
  'toggleRecorrenciaCP', 'validarRestaurar', 'verDetalhesFatura', 'verParcelasDivida',
  'validarInputLimpeza',
]);
let activeObserver;

export function legacyStringArgument(value) {
  const escaped = String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t');
  return `'${escapeHtml(escaped)}'`;
}

function splitArguments(source) {
  if (!source.trim()) return [];
  const result = [];
  let quote = null;
  let escaped = false;
  let start = 0;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (escaped) {
      escaped = false;
    } else if (character === '\\' && quote) {
      escaped = true;
    } else if (quote) {
      if (character === quote) quote = null;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ',') {
      result.push(source.slice(start, index).trim());
      start = index + 1;
    }
  }
  if (quote || escaped) return null;
  result.push(source.slice(start).trim());
  return result;
}

function parseString(token) {
  const quote = token[0];
  if (token.length < 2 || token.at(-1) !== quote) return null;
  let value = '';
  for (let index = 1; index < token.length - 1; index += 1) {
    const character = token[index];
    if (character !== '\\') {
      if (character === quote) return null;
      value += character;
      continue;
    }
    index += 1;
    if (index >= token.length - 1) return null;
    const escaped = token[index];
    const replacements = { n: '\n', r: '\r', t: '\t', '\\': '\\', "'": "'", '"': '"' };
    if (!(escaped in replacements)) return null;
    value += replacements[escaped];
  }
  return { type: 'literal', value };
}

function parseArgument(token) {
  if (token === 'this') return { type: 'element' };
  if (token === 'this.value') return { type: 'elementValue' };
  if (token === 'event') return { type: 'event' };
  if (token === 'event.target.value') return { type: 'eventValue' };
  if (token === 'true') return { type: 'literal', value: true };
  if (token === 'false') return { type: 'literal', value: false };
  if (token === 'null') return { type: 'literal', value: null };
  if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(token)) {
    const value = Number(token);
    return Number.isFinite(value) ? { type: 'literal', value } : null;
  }
  if (token.startsWith("'") || token.startsWith('"')) return parseString(token);
  return null;
}

function resolveArgument(argument, element, event) {
  if (argument.type === 'element') return element;
  if (argument.type === 'elementValue') return element.value;
  if (argument.type === 'event') return event;
  if (argument.type === 'eventValue') return event.target?.value;
  return argument.value;
}

export function compileLegacyHandler(source, element, scope = globalThis.window) {
  if (typeof source !== 'string' || source.length > 1_000) return null;
  let code = source.trim().replace(/;+\s*$/, '');
  let preventDefault = false;
  let targetOnly = false;

  if (/^event\.preventDefault\(\);?/.test(code)) {
    preventDefault = true;
    code = code.replace(/^event\.preventDefault\(\);?\s*/, '');
  }
  if (/^if\s*\(\s*event\.target\s*===\s*this\s*\)/.test(code)) {
    targetOnly = true;
    code = code.replace(/^if\s*\(\s*event\.target\s*===\s*this\s*\)\s*/, '');
  }
  code = code.replace(/^if\s*\(\s*window\.[A-Za-z_$][\w$]*\s*\)\s*/, '');

  const hide = code.match(/^document\.getElementById\((['"])([A-Za-z][\w-]*)\1\)\.style\.display\s*=\s*(['"])none\3$/);
  if (hide) {
    return (event) => {
      if (targetOnly && event.target !== element) return;
      if (preventDefault) event.preventDefault();
      const target = element.ownerDocument?.getElementById(hide[2]);
      if (target) target.style.display = 'none';
    };
  }

  const call = code.match(/^(?:window\.)?([A-Za-z_$][\w$]*)\((.*)\)$/s);
  if (!call || !ALLOWED_ACTIONS.has(call[1])) return null;
  const tokens = splitArguments(call[2]);
  if (!tokens) return null;
  const args = tokens.map(parseArgument);
  if (args.some((argument) => !argument)) return null;

  return (event) => {
    if (targetOnly && event.target !== element) return;
    if (preventDefault) event.preventDefault();
    const action = scope?.[call[1]];
    if (typeof action === 'function') action(...args.map((argument) => resolveArgument(argument, element, event)));
  };
}

function bindElement(element) {
  for (const eventName of EVENTS) {
    const attribute = `on${eventName}`;
    const quarantined = `data-puzoto-${attribute}`;
    if (!element.hasAttribute?.(attribute) && !element.hasAttribute?.(quarantined)) continue;
    const handler = compileLegacyHandler(element.getAttribute(quarantined) ?? element.getAttribute(attribute), element);
    element.removeAttribute(attribute);
    element.removeAttribute(quarantined);
    if (handler) element.addEventListener(eventName, handler);
    else element.setAttribute('data-inline-handler-blocked', 'true');
  }
}

function bindTree(node) {
  if (node.nodeType !== 1) return;
  bindElement(node);
  const selector = EVENTS.flatMap((name) => [`[on${name}]`, `[data-puzoto-on${name}]`]).join(',');
  for (const element of node.querySelectorAll(selector)) bindElement(element);
}

export function bindLegacyHandlers(root) {
  bindTree(root);
}

export function installLegacyHandlers(root = document.body) {
  activeObserver?.disconnect();
  bindTree(root);
  const observer = new MutationObserver((records) => {
    for (const record of records) for (const node of record.addedNodes) bindTree(node);
  });
  observer.observe(root, { childList: true, subtree: true });
  activeObserver = observer;
  return () => {
    observer.disconnect();
    if (activeObserver === observer) activeObserver = undefined;
  };
}
