import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, setIconMessage } from '../src/security/safeDom.js';

test('escape HTML protege texto e atributos sem alterar valores comuns', () => {
  assert.equal(escapeHtml('Clínica Central'), 'Clínica Central');
  assert.equal(escapeHtml(`D'Água \"<img onerror=alert(1)> & filhos`), 'D&#39;Água &quot;&lt;img onerror=alert(1)&gt; &amp; filhos');
  assert.equal(escapeHtml(null), '');
});

test('mensagem com markup permanece como nó de texto', () => {
  const children = [];
  const document = {
    createElement: (name) => ({ name, attributes: {}, setAttribute(key, value) { this.attributes[key] = value; } }),
    createTextNode: (text) => ({ text }),
  };
  const element = { ownerDocument: document, replaceChildren: (...nodes) => children.push(...nodes) };
  setIconMessage(element, 'alert-circle', '<img src=x onerror=alert(1)>');
  assert.equal(children[0].attributes['data-lucide'], 'alert-circle');
  assert.equal(children[2].textContent, '<img src=x onerror=alert(1)>');
});
