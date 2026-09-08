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

  const sanitize = (value) => {
    if (sanitizing) return String(value ?? '');
    sanitizing = true;
    try {
      return purifier.sanitize(quarantineLegacyHandlers(value));
    } finally {
      sanitizing = false;
    }
  };
  Object.defineProperty(prototype, 'innerHTML', { ...inner, set(value) { inner.set.call(this, sanitize(value)); } });
  Object.defineProperty(prototype, 'outerHTML', { ...outer, set(value) { outer.set.call(this, sanitize(value)); } });
  Object.defineProperty(prototype, 'insertAdjacentHTML', {
    configurable: true,
    writable: true,
    value(position, value) { return insertAdjacentHTML.call(this, position, sanitize(value)); },
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
