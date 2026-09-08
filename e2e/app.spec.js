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
    const tableIntegrity = await page.locator('#pageContent').evaluate((root) => ({
      malformed: [...root.querySelectorAll('table')].flatMap((table, tableIndex) => {
        const headerCount = table.querySelectorAll('thead th').length;
        const body = table.tBodies[0];
        if (!body) return [];
        const rows = [...body.rows];
        if (body.textContent.trim() && rows.length === 0) return [{ tableIndex, reason: 'conteúdo sem linhas' }];
        return rows.flatMap((row, rowIndex) => {
          const isSpanningState = row.cells.length === 1 && row.cells[0].colSpan > 1;
          return !isSpanningState && headerCount > 0 && row.cells.length !== headerCount
            ? [{ tableIndex, rowIndex, headerCount, cellCount: row.cells.length }]
            : [];
        });
      }),
      literalMarkup: (root.textContent.match(/<\/?(?:div|span|table|thead|tbody|tr|td)\b[^>]*>/gi) || []).slice(0, 5),
    }));
    expect(tableIntegrity.malformed, `estrutura das tabelas em ${id}`).toEqual([]);
    expect(tableIntegrity.literalMarkup, `markup aparecendo como texto em ${id}`).toEqual([]);
    const inlineHandlers = await page.locator('[onclick], [onchange], [oninput], [onsubmit], [onkeydown], [onkeyup], [onerror], [onmouseover], [onmouseout]').evaluateAll((elements) => elements.map((element) => ({ tag: element.tagName, id: element.id, code: ['onclick', 'onchange', 'oninput', 'onsubmit', 'onkeydown', 'onkeyup', 'onerror', 'onmouseover', 'onmouseout'].map((name) => element.getAttribute(name)).find(Boolean) })));
    expect(inlineHandlers, `handlers inline em ${id}`).toEqual([]);
    await expect(page.locator('#pageContent [data-inline-handler-blocked]')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `overflow em ${id}`).toBe(true);
  }
  expect(errors).toEqual([]);
  expect(apiFailures).toEqual([]);
  expect(cspViolations).toEqual([]);
});

test('todas as páginas cabem entre 320 e 390 px e mantêm leitura vertical', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile');
  await page.goto('/');
  await expect(page.locator('#app')).toBeVisible();
  const pages = ['dashboard', 'lancamentos', 'dr_ranon', 'fechamento_mes', 'historico', 'gastos', 'cartoes', 'contas_pagar', 'pessoas_dividas', 'receitas', 'investimentos', 'rel_geral', 'rel_trabalho', 'rel_financas', 'rel_comparativo', 'configuracoes', 'backup', 'importar_dados', 'diagnostico', 'ajuda'];

  for (const width of [320, 360, 390]) {
    await page.setViewportSize({ width, height: 760 });
    for (const id of pages) {
      await page.evaluate((pageId) => window.navigateTo(pageId), id);
      await expect(page.locator('#pageContent')).not.toHaveAttribute('aria-busy', 'true');
      await page.waitForTimeout(60);
      const layout = await page.locator('#pageContent').evaluate((root) => {
        const boundary = root.getBoundingClientRect();
        const offenders = [...root.querySelectorAll('*')]
          .filter((element) => {
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 1 &&
              (rect.left < boundary.left - 1 || rect.right > boundary.right + 1);
          })
          .slice(0, 8)
          .map((element) => ({ tag: element.tagName, id: element.id, className: String(element.className).slice(0, 100), rect: element.getBoundingClientRect().toJSON() }));
        const compressedGridItems = [...root.querySelectorAll('.dashboard-grid > *')]
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            return getComputedStyle(element).display !== 'none' && rect.height > 0 && rect.width < 180;
          })
          .map((element) => ({ className: String(element.className), width: element.getBoundingClientRect().width }));
        return {
          pageScrollWidth: root.scrollWidth,
          pageClientWidth: root.clientWidth,
          documentScrollWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
          mainScrollTop: document.getElementById('mainContent').scrollTop,
          offenders,
          compressedGridItems,
        };
      });
      expect(layout.offenders, `elementos fora da tela em ${id} a ${width}px`).toEqual([]);
      expect(layout.compressedGridItems, `colunas comprimidas em ${id} a ${width}px`).toEqual([]);
      expect(layout.documentScrollWidth, `documento em ${id} a ${width}px`).toBeLessThanOrEqual(layout.viewportWidth + 1);
      expect(layout.pageScrollWidth, `conteúdo em ${id} a ${width}px`).toBeLessThanOrEqual(layout.pageClientWidth + 1);
      expect(layout.mainScrollTop, `cabeçalho deslocado em ${id} a ${width}px`).toBe(0);
    }
  }
  expect(await page.locator('body').evaluate((body) => getComputedStyle(body).fontFamily)).toMatch(/Segoe UI|Roboto|system-ui/);
});

test('tabelas preservam colunas no desktop e viram cartões legíveis no celular', async ({ page }, info) => {
  if (info.project.name === 'mobile') await page.setViewportSize({ width: 320, height: 760 });
  await page.goto('/');
  await page.evaluate(() => window.navigateTo('configuracoes'));
  await expect(page.locator('#pageContent')).not.toHaveAttribute('aria-busy', 'true');
  const table = page.locator('#pageContent table.table').first();
  await expect(table.locator('tbody tr').first()).toBeVisible();
  const structure = await table.evaluate((element) => ({
    ready: element.dataset.responsiveReady,
    headers: element.querySelectorAll('thead th').length,
    rows: [...element.tBodies[0].rows].map((row) => row.cells.length),
    text: element.textContent,
  }));
  expect(structure.ready).toBe('true');
  expect(structure.rows.length).toBeGreaterThan(0);
  expect(structure.rows.every((cellCount) => cellCount === structure.headers)).toBe(true);
  expect(structure.text).not.toContain('<span');

  const firstDataRow = table.locator('tbody tr').first();
  if (info.project.name === 'desktop') {
    await expect(firstDataRow).toHaveCSS('display', 'table-row');
    return;
  }

  await expect(firstDataRow).toHaveCSS('display', 'grid');
  const cells = firstDataRow.locator('td:not([colspan])');
  await expect(cells.first()).toHaveAttribute('data-label', /.+/);
});

test('sanitização contextual preserva fragmentos de tabela e bloqueia ações injetadas', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.navigateTo('configuracoes'));
  await expect(page.locator('#pageContent')).not.toHaveAttribute('aria-busy', 'true');
  const table = page.locator('#pageContent table.table').first();
  await table.locator('tbody').evaluate((tbody) => {
    tbody.innerHTML = '<tr id="context-row"><td>Seguro</td><td><button onclick="window.alert(1)">Ação</button></td><td>Tipo</td><td>Status</td><td>Ações</td></tr>';
  });
  const injectedRow = table.locator('#context-row');
  await expect(injectedRow.locator('td')).toHaveCount(5);
  await expect(injectedRow.locator('button')).not.toHaveAttribute('onclick');
  await expect(injectedRow.locator('button')).toHaveAttribute('data-inline-handler-blocked', 'true');
});

test('Contas a Pagar ignora resposta concluída depois da troca de página', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile');
  const errors = [];
  let releaseResponse;
  let markStarted;
  const responseReleased = new Promise((resolve) => { releaseResponse = resolve; });
  const requestStarted = new Promise((resolve) => { markStarted = resolve; });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/financas/contas-pagar-painel?*', async (route) => {
    markStarted();
    await responseReleased;
    await route.fulfill({ json: { ok: true, data: { categorias: [], contas: [], resumo: { totalPendente: 0, totalVencido: 0, totalPago: 0, quantidadeContas: 0, proximoVencimento: null, categorias: [] } } } });
  });
  await page.goto('/');
  await page.evaluate(() => { window.navigateTo('contas_pagar'); });
  await requestStarted;
  await page.evaluate(() => { window.navigateTo('gastos'); });
  releaseResponse();
  await expect(page.getByRole('heading', { name: 'Gastos', exact: true })).toBeVisible();
  await page.waitForTimeout(150);
  await expect(page.locator('body')).not.toContainText('Cannot set properties of null');
  expect(errors).toEqual([]);
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
test('sanitização central bloqueia HTML ativo em todos os sinks legados', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.__xssMarker = 0;
    const target = document.createElement('section');
    target.id = 'xss-audit-target';
    document.body.append(target);
    target.innerHTML = '<script>window.__xssMarker=1</script><img src=x onerror="window.__xssMarker=2"><svg onload="window.__xssMarker=3"></svg><a href="javascript:window.__xssMarker=4">link</a><iframe srcdoc="<script>parent.__xssMarker=5<\/script>"></iframe>';
    target.insertAdjacentHTML('beforeend', '<button formaction="javascript:window.__xssMarker=6">ação</button>');
  });
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.__xssMarker)).toBe(0);
  await expect(page.locator('#xss-audit-target script, #xss-audit-target iframe')).toHaveCount(0);
  await expect(page.locator('#xss-audit-target [onerror], #xss-audit-target [onload], #xss-audit-target [href^="javascript:"], #xss-audit-target [formaction^="javascript:"]')).toHaveCount(0);
});
test('texto ativo vindo da API não executa nos relatórios legados', async ({ page }, info) => {
  await page.addInitScript(() => { window.__apiXssMarker = 0; });
  await page.route('**/api/relatorios/geral?*', (route) => route.fulfill({ json: { ok: true, data: {
    resumo: {
      total_entradas_potenciais: 10, total_saidas_potenciais: 10, trabalho_produzido: 10,
      entradas_recebidas: 10, entradas_previstas: 0, saidas_pagas: 10, saidas_pendentes: 0,
      saldo_real: 0, saldo_previsto: 0, trabalho_recebido: 10, trabalho_a_receber: 0,
    },
    comparativos: { distribuicao_saidas: [], gastos_por_categoria: [], receitas_por_origem: [] },
    rankings: {
      maiores_gastos: [{ descricao: '<button id="api-action-injection" onclick="window.navigateTo(\'backup\')">Despesa</button><img src=x onerror="window.__apiXssMarker=1">', categoria: '<svg onload="window.__apiXssMarker=2"></svg>', data: '2026-09-08', valor: 10 }],
      maiores_receitas: [], proximos_vencimentos: [],
    },
  } } }));
  await page.goto('/');
  if (info.project.name === 'mobile') await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
  await page.locator('[data-page="rel_geral"]').click();
  await expect(page.locator('#list-maiores-gastos')).toContainText('Despesa');
  await expect(page.locator('#api-action-injection')).toHaveCount(0);
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.__apiXssMarker)).toBe(0);
  await expect(page.locator('#pageContent [onerror], #pageContent [onload]')).toHaveCount(0);
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
  expect(worker).toContain("cache: 'no-store'");
  expect(worker).toContain("caches.match('/offline.html')");
  expect(worker).not.toContain("cache.put('/',");
  expect(worker).not.toContain("['script', 'style'");
  const offlineResponse = await page.request.get('/offline.html');
  expect(offlineResponse.ok()).toBe(true);
  expect(await offlineResponse.text()).toContain('Você está sem conexão.');
});

test('Cofre ignora uma resposta concluída depois da troca de página', async ({ page }, info) => {
  const errors = [];
  let liberarResposta;
  let marcarInicio;
  const respostaLiberada = new Promise(resolve => { liberarResposta = resolve; });
  const requisicaoIniciada = new Promise(resolve => { marcarInicio = resolve; });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/financas/investimentos-painel?*', async route => {
    marcarInicio();
    await respostaLiberada;
    await route.fulfill({ json: { ok: true, data: { investimentos: [{ id: 1, nome: 'Cofre teste', instituicao: 'Banco teste', saldo_atual: 20, ativo: 1 }], movimentos: [] } } });
  });
  await page.goto('/');
  if (info.project.name === 'mobile') await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
  await page.locator('[data-page="investimentos"]').click();
  await requisicaoIniciada;
  if (info.project.name === 'mobile') await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
  await page.locator('[data-page="gastos"]').click();
  liberarResposta();
  await expect(page.getByRole('heading', { name: 'Gastos', exact: true })).toBeVisible();
  await page.waitForTimeout(150);
  await expect(page.locator('body')).not.toContainText('Cannot set properties of null');
  expect(errors).toEqual([]);
});

test('ações de Trabalho e Dr. Ranon permanecem alinhadas', async ({ page }, info) => {
  await page.goto('/');
  if (info.project.name === 'mobile') await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
  await page.locator('[data-page="configuracoes"]').click();
  const trabalho = page.getByRole('button', { name: 'Salvar Trabalho' });
  const ranon = page.getByRole('button', { name: 'Salvar Dr. Ranon / RX' });
  await expect(trabalho).toBeVisible();
  await expect(ranon).toBeVisible();
  const [caixaTrabalho, caixaRanon] = await Promise.all([trabalho.boundingBox(), ranon.boundingBox()]);
  if (info.project.name === 'desktop') expect(Math.abs(caixaTrabalho.y - caixaRanon.y)).toBeLessThanOrEqual(1);
  expect(caixaTrabalho.width).toBeGreaterThanOrEqual(44);
  expect(caixaRanon.width).toBeGreaterThanOrEqual(44);
});

test('logo usa transparência real e se integra ao fundo da barra lateral', async ({ page }) => {
  await page.goto('/');
  const cantoAlpha = await page.evaluate(async () => {
    const response = await fetch('/images/PuzotoLifeBlue.png');
    const bitmap = await createImageBitmap(await response.blob());
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    context.drawImage(bitmap, 0, 0);
    return context.getImageData(0, 0, 1, 1).data[3];
  });
  expect(cantoAlpha).toBe(0);
  await expect(page.locator('.sidebar__logo')).toHaveCSS('object-fit', 'contain');
});

test('resumo de Gastos tem hierarquia e usa uma carga autenticada', async ({ page }, info) => {
  let iniciarPainel;
  const liberarPainel = new Promise(resolve => { iniciarPainel = resolve; });
  const requisicoes = [];
  const suspender = async (route) => {
    requisicoes.push(new URL(route.request().url()).pathname);
    await liberarPainel;
    await route.fulfill({ json: { ok: true, data: {
      categorias: [], gastos: [], resumo: {
        totalPago: 261.87, totalPendente: 0, qtdLancamentos: 6, mediaPorDia: 37.41,
        maiorCategoria: { nome: 'Alimentação' }, gastosPorCategoria: []
      }
    } } });
  };
  await page.route('**/api/financas/gastos-painel?*', route => suspender(route));
  await page.goto('/');
  if (info.project.name === 'mobile') await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
  await page.locator('[data-page="gastos"]').click();
  await expect.poll(() => requisicoes.length).toBe(1);
  iniciarPainel();
  await expect(page.locator('#pageContent')).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('.expense-summary__tile')).toHaveCount(5);
  await expect(page.locator('.expense-summary svg')).toHaveCount(6);
  await expect(page.locator('#card-total-pago')).toHaveText('R$ 261,87');
  const delays = await page.locator('#pageContent .animate-in').evaluateAll(elements => elements.map(element => getComputedStyle(element).animationDelay));
  expect(delays.every(delay => delay === '0s')).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
