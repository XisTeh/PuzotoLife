import { randomUUID } from 'node:crypto';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';

export function installHttpSecurity(app, env = process.env) {
  const origin = new URL(env.APP_ORIGIN || 'http://localhost:5174').origin;
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"], scriptSrc: ["'self'"], scriptSrcAttr: ["'unsafe-inline'"],
    styleSrc: ["'self'", "'unsafe-inline'"], fontSrc: ["'self'"], imgSrc: ["'self'", 'data:', 'blob:'], connectSrc: ["'self'"],
    objectSrc: ["'none'"], baseUri: ["'none'"], frameAncestors: ["'none'"],
    upgradeInsecureRequests: env.NODE_ENV === 'production' ? [] : null,
  } }, strictTransportSecurity: env.NODE_ENV === 'production' ? undefined : false }));
  app.use((req, res, next) => {
    if (env.NODE_ENV !== 'production' && !['localhost', '127.0.0.1', '[::1]'].includes(req.hostname)) return res.sendStatus(403);
    const requestOrigin = req.get('Origin');
    const allowed = [origin, `http://127.0.0.1:${env.PORT || 3210}`, `http://localhost:${env.PORT || 3210}`];
    if (requestOrigin && !allowed.includes(requestOrigin)) return res.status(403).json({ ok: false, error: 'Origem não autorizada.' });
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('X-Puzoto-Request') !== '1') return res.status(403).json({ ok: false, error: 'Requisição não autorizada.' });
    if (req.get('Sec-Fetch-Site') === 'cross-site') return res.sendStatus(403);
    const id = randomUUID();
    const start = performance.now();
    res.setHeader('X-Request-Id', id);
    res.on('finish', () => {
      if (env.NODE_ENV !== 'test') console.log(JSON.stringify({ event: 'http', id, method: req.method, status: res.statusCode, durationMs: Math.round(performance.now() - start) }));
    });
    if (req.path.startsWith('/api')) res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', rateLimit({ windowMs: 60_000, limit: 180, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { ok: false, error: 'Muitas solicitações. Aguarde um minuto.' } }));
}
