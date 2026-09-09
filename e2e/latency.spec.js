import { test, expect } from '@playwright/test';

async function navigate(page, id) {
  await page.evaluate(pageId => window.navigateTo(pageId), id);
  await expect(page.locator('#pageContent')).not.toHaveAttribute('aria-busy', 'true');
}

for (const scenario of [
  { page: 'lancamentos', panel: '/api/lote-trabalho/painel', mutation: '/api/lote-trabalho', table: '#tabela-lote-body', field: '#form-obs' },
  { page: 'dr_ranon', panel: '/api/ranon/painel', mutation: '/api/ranon/pendentes', table: '#tabela-ranon-body', field: '#form-obs' },
]) {
  test(`${scenario.page}: carga única, confirmação sem recarga e bloqueio de envio repetido`, async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#pageContent')).not.toHaveAttribute('aria-busy', 'true');
    const requests = [];
    page.on('request', request => {
      if (request.url().includes('/api/')) requests.push({ path: new URL(request.url()).pathname, method: request.method() });
    });
    await navigate(page, scenario.page);
    expect(requests).toEqual([{ path: scenario.panel, method: 'GET' }]);
    const label = `Teste de latência ${Date.now()}`;
    await page.locator(scenario.field).fill(label);
    await page.locator('#form-quantidade').fill('3');
    if (scenario.page === 'dr_ranon') await page.locator('#form-registro').fill('987654');
    const metric = page.locator(scenario.page === 'dr_ranon' ? '#metrica-qtd-laudos' : '#metrica-qtd');
    const before = Number(await metric.textContent());
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await page.route(`**${scenario.mutation}?painel=true`, async route => {
      await gate;
      await route.continue();
    });
    requests.length = 0;
    await page.locator('#form-lancamento').evaluate(form => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    const button = page.locator('#form-lancamento button[type="submit"]');
    await expect(button).toBeDisabled();
    await expect(button).toHaveText('Salvando…');
    await expect(metric).toHaveText(String(before));
    release();
    await expect(page.locator(scenario.table)).toContainText(label);
    await expect(button).toBeEnabled();
    await expect(metric).toHaveText(String(before + 3));
    expect(requests).toEqual([{ path: scenario.mutation, method: 'POST' }]);

    const row = page.locator(`${scenario.table} tr`).filter({ hasText: label });
    await row.getByTitle('Editar', { exact: true }).click();
    await page.locator('#form-quantidade').fill('4');
    requests.length = 0;
    await button.click();
    await expect(metric).toHaveText(String(before + 4));
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe('PUT');
    await navigate(page, 'dashboard');
    await navigate(page, scenario.page);
    await expect(page.locator(scenario.table)).toContainText(label);
  });

  test(`${scenario.page}: falha mantém formulário e totais, resposta antiga não altera outra página`, async ({ page }) => {
    await page.goto('/');
    await navigate(page, scenario.page);
    await page.locator('#form-obs').fill('Preservar em falha');
    if (scenario.page === 'dr_ranon') await page.locator('#form-registro').fill('987650');
    const before = await page.locator(scenario.table).textContent();
    await page.route(`**${scenario.mutation}?painel=true`, route => route.fulfill({ status: 500, json: { ok: false, error: 'Falha sintética' } }));
    const button = page.locator('#form-lancamento button[type="submit"]');
    await button.click();
    await expect(page.locator('.toast.error').last()).toBeVisible();
    await expect(button).toBeEnabled();
    await expect(page.locator('#form-obs')).toHaveValue('Preservar em falha');
    await expect(page.locator(scenario.table)).toHaveText(before);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let release;
    let started;
    const gate = new Promise(resolve => { release = resolve; });
    const requestStarted = new Promise(resolve => { started = resolve; });
    await page.route(`**${scenario.panel}`, async route => {
      const response = await route.fetch();
      started();
      await gate;
      await route.fulfill({ response });
    });
    await navigate(page, 'dashboard');
    await page.evaluate(pageId => { window.navigateTo(pageId); }, scenario.page);
    await requestStarted;
    await navigate(page, scenario.page === 'dr_ranon' ? 'lancamentos' : 'dr_ranon');
    release();
    await page.waitForTimeout(150);
    expect(errors).toEqual([]);
    await expect(page.locator('#form-obs')).toHaveValue('');
  });
}

for (const scenario of [
  { page: 'gastos', endpoint: '/api/financas/gastos', button: '#btn-salvar-gasto', description: '#form-gasto-desc', value: '#form-gasto-valor', category: '#form-gasto-categoria', table: '#gastos-tabela-body' },
  { page: 'receitas', endpoint: '/api/financas/receitas', button: '#btn-salvar-rec', description: '#form-rec-desc', value: '#form-rec-valor', category: '#form-rec-categoria', table: '#tbody-receitas' },
]) {
  test(`${scenario.page}: inclusão atualiza dados e resumo com uma única requisição`, async ({ page }) => {
    await page.goto('/');
    await navigate(page, scenario.page);
    const label = `Financeiro sintético ${Date.now()}`;
    await page.locator(scenario.description).fill(label);
    await page.locator(scenario.value).fill('17');
    await page.locator(scenario.category).selectOption({ index: 1 });
    if (scenario.page === 'receitas') {
      await page.locator('#form-rec-origem').fill('Origem sintética');
      await page.locator('#form-rec-data').fill(new Date().toISOString().slice(0, 10));
    }
    const requests = [];
    page.on('request', request => { if (request.url().includes('/api/')) requests.push(request); });
    await page.locator(scenario.button).click();
    await expect(page.locator(scenario.description)).toHaveValue('');
    await expect(page.locator(scenario.table)).toContainText(label);
    expect(requests).toHaveLength(1);
    expect(new URL(requests[0].url()).pathname).toBe(scenario.endpoint);
    await expect(page.locator('.toast.error')).toHaveCount(0);
  });
}
