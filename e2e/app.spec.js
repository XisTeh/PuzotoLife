import { test, expect } from '@playwright/test';

test('navegação de todas as páginas em desktop e celular', async ({ page }, info) => {
  const errors = [];
  const apiFailures = [];
  const cspViolations = [];
  page.on('pageerror', (error) => errors.push(error.stack));
  page.on('console', (message) => { if (message.text().includes('Content Security Policy')) cspViolations.push(message.text()); });
  page.on('response', (response) => { if (response.url().includes('/api/') && response.status() >= 400) apiFailures.push(`${response.status()} ${new URL(response.url()).pathname}`); });
  await page.goto('/');
  await expect(page.locator('#app')).toBeVisible();
  const pages = ['dashboard', 'lancamentos', 'dr_ranon', 'fechamento_mes', 'historico', 'gastos', 'cartoes', 'contas_pagar', 'pessoas_dividas', 'receitas', 'investimentos', 'rel_geral', 'rel_trabalho', 'rel_financas', 'rel_comparativo', 'configuracoes', 'backup', 'importar_dados', 'diagnostico', 'ajuda'];
  for (const id of pages) {
    if (info.project.name === 'mobile') await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
    await page.locator(`[data-page="${id}"]`).click();
    await expect(page.locator('#pageContent')).not.toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('#pageContent')).not.toContainText('Não foi possível abrir esta página');
    await expect(page.locator('#pageContent')).not.toBeEmpty();
    await page.waitForTimeout(150);
    const inlineHandlers = await page.locator('[onclick], [onchange], [oninput], [onsubmit], [onkeydown], [onkeyup], [onerror], [onmouseover], [onmouseout]').evaluateAll((elements) => elements.map((element) => ({ tag: element.tagName, id: element.id, code: ['onclick', 'onchange', 'oninput', 'onsubmit', 'onkeydown', 'onkeyup', 'onerror', 'onmouseover', 'onmouseout'].map((name) => element.getAttribute(name)).find(Boolean) })));
    expect(inlineHandlers, `handlers inline em ${id}`).toEqual([]);
    await expect(page.locator('#pageContent [data-inline-handler-blocked]')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `overflow em ${id}`).toBe(true);
  }
  expect(errors).toEqual([]);
  expect(apiFailures).toEqual([]);
  expect(cspViolations).toEqual([]);
});
test('login apresenta erro, controla senha e não revela o aplicativo', async ({ page }) => {
  await page.route('**/api/auth/session', (route) => route.fulfill({ json: { ok: true, mode: 'supabase', authenticated: false } }));
  await page.route('**/api/auth/login', (route) => route.fulfill({ status: 401, json: { ok: false, error: 'Não foi possível entrar com esses dados.' } }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Bom ter você aqui.' })).toBeVisible();
  await page.getByLabel('E-mail', { exact: true }).fill('test@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('invalid-password');
  await page.getByRole('button', { name: 'Mostrar senha' }).click();
  await expect(page.locator('#authPassword')).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Entrar na minha conta' }).click();
  await expect(page.locator('#authMessage')).toContainText('Não foi possível entrar');
  await expect(page.locator('#app')).toBeHidden();
});
test('CSP restrita preserva ações permitidas e descarta ação injetada', async ({ page }) => {
  let dialogs = 0;
  page.on('dialog', async (dialog) => { dialogs += 1; await dialog.dismiss(); });
  const documentResponse = await page.goto('/');
  expect(documentResponse.headers()['content-security-policy']).toContain("script-src-attr 'none'");
  await expect(page.locator('#pageContent')).not.toHaveAttribute('aria-busy', 'true');
  const refresh = page.waitForResponse((response) => response.url().includes('/api/dashboard') && response.status() === 200);
  await page.getByTitle('Atualizar').click();
  await refresh;
  await page.locator('#pageContent').evaluate((container) => container.insertAdjacentHTML('beforeend', '<button id="injected-action" onclick="window.alert(1)">Teste</button>'));
  await expect(page.locator('#injected-action')).not.toHaveAttribute('onclick');
  await expect(page.locator('#injected-action')).toHaveAttribute('data-inline-handler-blocked', 'true');
  await page.locator('#injected-action').click();
  expect(dialogs).toBe(0);
});
test('reduced motion e fechamento do menu por teclado', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('#app')).toBeVisible();
  if (info.project.name === 'mobile') {
    const toggle = page.getByRole('button', { name: 'Abrir menu', exact: true });
    await toggle.click();
    await expect(page.locator('#closeMenu')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toBeFocused();
  }
});
test('lista de meses fechados não corta a última linha no hover ou no celular', async ({ page }, info) => {
  const months = [
    { id: 1, referencia: 'Maio/2026', fechado_em: '2026-06-01 08:00:00', total_global: 6096, qtd_global: 2152 },
    { id: 2, referencia: 'Junho/2026', fechado_em: '2026-07-01 08:00:00', total_global: 6801, qtd_global: 2417 },
    { id: 3, referencia: 'Julho/2026', fechado_em: '2026-08-01 08:00:00', total_global: 8084, qtd_global: 2856 },
    { id: 4, referencia: 'Agosto/2026', fechado_em: '2026-09-01 08:00:00', total_global: 7961, qtd_global: 2740 },
  ];
  await page.route('**/api/fechamentos/mensais', (route) => route.fulfill({ json: { ok: true, data: months } }));
  await page.goto('/');
  if (info.project.name === 'mobile') await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
  await page.locator('[data-page="fechamento_mes"]').click();
  const items = page.locator('.closed-month');
  await expect(items).toHaveCount(4);
  const last = items.last();
  await last.scrollIntoViewIfNeeded();
  if (info.project.name === 'desktop') await last.hover();
  const geometry = await page.locator('.closed-months-list').evaluate((container) => {
    const list = container.getBoundingClientRect();
    const item = container.lastElementChild.getBoundingClientRect();
    return { bottom: item.bottom, listBottom: list.bottom, right: item.right, listRight: list.right, scrollWidth: container.scrollWidth, clientWidth: container.clientWidth };
  });
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.listBottom + 1);
  expect(geometry.right).toBeLessThanOrEqual(geometry.listRight + 1);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
});
test('metadados da PWA permitem instalação sem cachear a API', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#11131f');
  const manifestResponse = await page.request.get('/manifest.webmanifest');
  expect(manifestResponse.ok()).toBe(true);
  const manifest = await manifestResponse.json();
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.some((icon) => icon.purpose.includes('maskable'))).toBe(true);
  const workerResponse = await page.request.get('/sw.js');
  expect(workerResponse.ok()).toBe(true);
  const worker = await workerResponse.text();
  expect(worker).toContain("url.pathname.startsWith('/api/')");
});
