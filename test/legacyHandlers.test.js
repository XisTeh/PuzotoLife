import test from 'node:test';
import assert from 'node:assert/strict';
import { compileLegacyHandler, legacyStringArgument } from '../src/security/legacyHandlers.js';
import { escapeHtml } from '../src/security/safeDom.js';

function fakeElement(value = '') {
  return { value, ownerDocument: { getElementById: () => null } };
}

test('adaptador chama somente ação permitida com argumentos simples', () => {
  const calls = [];
  const scope = { editarCartao: (...args) => calls.push(args) };
  const element = fakeElement();
  const handler = compileLegacyHandler("window.editarCartao(42, 'pessoal')", element, scope);
  assert.equal(typeof handler, 'function');
  handler({ target: element, preventDefault() {} });
  assert.deepEqual(calls, [[42, 'pessoal']]);
});

test('adaptador preserva this.value e preventDefault de formulário', () => {
  let received;
  let prevented = false;
  const element = fakeElement('busca');
  const handler = compileLegacyHandler('event.preventDefault();window.filtrarLaudosRanon(this.value)', element, {
    filtrarLaudosRanon: (value) => { received = value; },
  });
  handler({ target: element, preventDefault: () => { prevented = true; } });
  assert.equal(received, 'busca');
  assert.equal(prevented, true);
});

test('adaptador rejeita comando adicional, função não autorizada e string quebrada', () => {
  const element = fakeElement();
  assert.equal(compileLegacyHandler('window.editarCartao(1);window.alert(1)', element, {}), null);
  assert.equal(compileLegacyHandler('window.alert(1)', element, {}), null);
  assert.equal(compileLegacyHandler("window.abrirHistoricoPessoa('nome');fetch('/api')", element, {}), null);
  assert.equal(compileLegacyHandler("window.abrirHistoricoPessoa('nome)", element, {}), null);
});

test('ação de overlay só ocorre quando o próprio overlay recebe o clique', () => {
  let calls = 0;
  const element = fakeElement();
  const handler = compileLegacyHandler('if(event.target===this)window.fecharCorrecaoCofre()', element, {
    fecharCorrecaoCofre: () => { calls += 1; },
  });
  handler({ target: {}, preventDefault() {} });
  handler({ target: element, preventDefault() {} });
  assert.equal(calls, 1);
});

test('argumento dinâmico preserva texto e não abre o atributo HTML', () => {
  const encoded = legacyStringArgument(`D'Água \"<img src=x onerror=alert(1)>`);
  assert.equal(encoded.includes('<img'), false);
  assert.equal(encoded.includes('&quot;'), true);
  assert.equal(escapeHtml('<b>Nome</b>'), '&lt;b&gt;Nome&lt;/b&gt;');
});
