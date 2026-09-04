export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

export function setIconMessage(element, iconName, message) {
  const document = element.ownerDocument;
  const icon = document.createElement('i');
  icon.setAttribute('data-lucide', /^[a-z][a-z0-9-]*$/.test(iconName) ? iconName : 'info');
  const text = document.createElement('span');
  text.textContent = String(message ?? '');
  element.replaceChildren(icon, document.createTextNode(' '), text);
}
