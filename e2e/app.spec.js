import { test, expect } from '@playwright/test';

test('navegação de todas as páginas em desktop e celular', async ({ page }, info) => {
  const errors = [];
  const apiFailures = [];
  page.on('pageerror', (error) => errors.push(error.stack));
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
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `overflow em ${id}`).toBe(true);
  }
  expect(errors).toEqual([]);
  expect(apiFailures).toEqual([]);
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
test('reduced motion e fechamento do menu por teclado', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('#app')).toBeVisible();
  if (info.project.name === 'mobile') {
    const toggle = page.getByRole('button', { name: 'Abrir menu', exact: true });
    await toggle.click();
    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toBeFocused();
  }
});
