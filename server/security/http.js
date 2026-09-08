import { randomUUID } from 'node:crypto';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { logEvent } from '../observability/logger.js';
import { allowedRequestOrigins, isLoopbackHostname } from './origin.js';

export function installHttpSecurity(app, env = process.env) {
  const allowedOrigins = allowedRequestOrigins(env);
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"], scriptSrc: ["'self'"], scriptSrcAttr: ["'none'"],
    styleSrc: ["'self'", "'unsafe-inline'"], fontSrc: ["'self'"], imgSrc: ["'self'", 'data:', 'blob:'], connectSrc: ["'self'"],
    objectSrc: ["'none'"], baseUri: ["'none'"], frameAncestors: ["'none'"],
    upgradeInsecureRequests: env.NODE_ENV === 'production' ? [] : null,
  } }, strictTransportSecurity: env.NODE_ENV === 'production' ? undefined : false }));
  app.use((req, res, next) => {
    const id = randomUUID();
    const start = performance.now();
    res.locals.requestId = id;
    res.setHeader('X-Request-Id', id);
    res.on('finish', () => logEvent('info', 'http', {
      id,
      method: req.method,
      route: req.route?.path,
      status: res.statusCode,
      durationMs: performance.now() - start,
    }, env));
    if (env.NODE_ENV !== 'production' && !isLoopbackHostname(req.hostname)) return res.sendStatus(403);
    const requestOrigin = req.get('Origin');
    if (requestOrigin && !allowedOrigins.has(requestOrigin)) return res.status(403).json({ ok: false, error: 'Origem não autorizada.' });
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('X-Puzoto-Request') !== '1') return res.status(403).json({ ok: false, error: 'Requisição não autorizada.' });
    if (req.get('Sec-Fetch-Site') === 'cross-site') return res.sendStatus(403);
    if (req.path.startsWith('/api')) res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', rateLimit({ windowMs: 60_000, limit: 180, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { ok: false, error: 'Muitas solicitações. Aguarde um minuto.' } }));
}
