import createDOMPurify from 'dompurify';

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

const LEGACY_HANDLER = /\s(on(?:click|change|input|submit|keydown|keyup))\s*=\s*(["'])([\s\S]*?)\2/gi;
let installed = false;
let sanitizing = false;

function quarantineLegacyHandlers(value) {
  return String(value ?? '').replace(LEGACY_HANDLER, (_match, attribute, quote, source) => ` data-puzoto-${attribute.toLowerCase()}=${quote}${source}${quote}`);
}

export function installSafeHtmlPolicy(scope = globalThis.window) {
  if (installed || !scope?.Element || !scope?.document) return;
  const purifier = createDOMPurify(scope);
  const prototype = scope.Element.prototype;
  const inner = Object.getOwnPropertyDescriptor(prototype, 'innerHTML');
  const outer = Object.getOwnPropertyDescriptor(prototype, 'outerHTML');
  const insertAdjacentHTML = prototype.insertAdjacentHTML;
  if (!inner?.set || !outer?.set || typeof insertAdjacentHTML !== 'function') throw new Error('Navegador sem suporte à política segura de HTML.');

  const sanitize = (value, context) => {
    if (sanitizing) return String(value ?? '');
    sanitizing = true;
    try {
      const range = scope.document.createRange();
      range.selectNodeContents(context);
      const fragment = range.createContextualFragment(quarantineLegacyHandlers(value));
      const sanitizedFragment = purifier.sanitize(fragment, { RETURN_DOM_FRAGMENT: true });

      // Serializar o fragmento já sanitizado evita que o DOMPurify interprete
      // linhas e células em um <body>. O setter nativo fará a segunda leitura
      // no contexto correto de tbody, tr, select ou do elemento de destino.
      const serializer = scope.document.createElement('div');
      serializer.append(sanitizedFragment);
      return inner.get.call(serializer);
    } finally {
      sanitizing = false;
    }
  };
  Object.defineProperty(prototype, 'innerHTML', { ...inner, set(value) { inner.set.call(this, sanitize(value, this)); } });
  Object.defineProperty(prototype, 'outerHTML', {
    ...outer,
    set(value) { outer.set.call(this, sanitize(value, this.parentElement || this)); },
  });
  Object.defineProperty(prototype, 'insertAdjacentHTML', {
    configurable: true,
    writable: true,
    value(position, value) {
      const context = position === 'beforebegin' || position === 'afterend' ? this.parentElement || this : this;
      return insertAdjacentHTML.call(this, position, sanitize(value, context));
    },
  });
  installed = true;
}

export function setIconMessage(element, iconName, message) {
  const document = element.ownerDocument;
  const icon = document.createElement('i');
  icon.setAttribute('data-lucide', /^[a-z][a-z0-9-]*$/.test(iconName) ? iconName : 'info');
  const text = document.createElement('span');
  text.textContent = String(message ?? '');
  element.replaceChildren(icon, document.createTextNode(' '), text);
}
