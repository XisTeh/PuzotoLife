import { request as httpsRequest } from 'node:https';

const origin = process.env.PRODUCTION_ORIGIN || 'https://puzoto-life.vercel.app';
const base = new URL(origin);
if (base.protocol !== 'https:' || base.origin !== origin) throw new Error('PRODUCTION_ORIGIN precisa ser uma origem HTTPS sem caminho.');

const root = await fetch(`${origin}/`, { redirect: 'error' });
const health = await fetch(`${origin}/api/health`, { redirect: 'error' });
const session = await fetch(`${origin}/api/auth/session`, { redirect: 'error' });
const privateData = await fetch(`${origin}/api/dashboard`, { redirect: 'error' });
const crossSiteNavigation = await new Promise((resolve, reject) => {
  const request = httpsRequest(`${origin}/`, {
    method: 'GET',
    headers: {
      Origin: 'https://search.example',
      'Sec-Fetch-Site': 'cross-site',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Dest': 'document',
    },
  }, response => {
    response.resume();
    response.on('end', () => resolve({ status: response.statusCode }));
  });
  request.on('error', reject);
  request.end();
});
const foreignOrigin = await fetch(`${origin}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: 'https://invalid.example', 'X-Puzoto-Request': '1' },
  body: JSON.stringify({ email: 'nobody@example.com', password: 'invalid-password' }),
});
const [rootHtml, healthBody, sessionBody] = await Promise.all([root.text(), health.json(), session.json()]);
const csp = root.headers.get('content-security-policy') || '';
const checks = {
  root: root.status === 200 && root.headers.get('content-type')?.startsWith('text/html') && rootHtml.includes('<title>Puzoto Life'),
  health: health.status === 200 && healthBody.storage === 'postgres' && healthBody.auth === 'supabase',
  anonymousSession: session.status === 200 && sessionBody.authenticated === false,
  privateDataDenied: privateData.status === 401,
  crossSiteNavigation: crossSiteNavigation.status === 200,
  foreignOriginDenied: foreignOrigin.status === 403,
  csp: csp.includes("script-src-attr 'none'") && csp.includes("frame-ancestors 'none'"),
  noSniff: root.headers.get('x-content-type-options') === 'nosniff',
};
if (Object.values(checks).some((value) => !value)) throw new Error(`Validação pública falhou: ${Object.entries(checks).filter(([, value]) => !value).map(([name]) => name).join(', ')}`);
console.log(JSON.stringify({ origin, validated: true, checks }));
