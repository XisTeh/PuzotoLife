import './environment.js';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeStorage } from './database/initialize.js';
import { databaseDialect } from './database/connection.js';
import { logApiError, logEvent } from './observability/logger.js';
import { garantirConfiguracoesPadrao } from './services/configuracoes.js';
import apiRoutes from './routes/api.js';
import { createAuth } from './security/auth.js';
import { installHttpSecurity } from './security/http.js';
import { validateApiRequest } from './security/requestValidation.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function setStaticCacheHeaders(res, filePath) {
  const name = path.basename(filePath);
  if (name === 'index.js' || name === 'index.css' || name.endsWith('.html')) res.setHeader('Cache-Control', 'no-store');
}

export function createApp(env = process.env, authFactory = createAuth, application = express()) {
  const production = env.NODE_ENV === 'production';
  if (!production && env.HOST && !['127.0.0.1', 'localhost', '::1'].includes(env.HOST)) throw new Error('Publicação bloqueada: o runtime local deve permanecer no loopback.');
  if (production && env.PUZOTO_DATABASE !== 'postgres') throw new Error('Produção exige PostgreSQL como fonte de verdade.');
  if (production) {
    let origin;
    try { origin = new URL(env.APP_ORIGIN); } catch { throw new Error('Produção exige APP_ORIGIN HTTPS válido.'); }
    if (origin.protocol !== 'https:' || origin.origin !== env.APP_ORIGIN) throw new Error('Produção exige APP_ORIGIN HTTPS sem caminho.');
  }
  const app = application;
  installHttpSecurity(app, env);
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', validateApiRequest);
  const auth = authFactory(env);
  app.use('/api/auth', auth.router);
  if (production && !auth.configured) throw new Error('Produção exige autenticação Supabase configurada.');
  if (databaseDialect() === 'postgres' && !auth.configured && env.NODE_ENV !== 'test') throw new Error('PostgreSQL exige autenticação Supabase e proprietário configurados.');
  app.get('/api/health', (_req, res) => res.json({ ok: true, status: 'online', storage: databaseDialect(), auth: auth.configured ? 'supabase' : 'local' }));
  app.use('/api', auth.guard, apiRoutes);
  app.use('/api', (_req, res) => res.status(404).json({ ok: false, error: 'Rota não encontrada.' }));
  app.use((req, res, next) => {
    if (req.path.split('/').some(part => part.startsWith('.')) || ['Info', 'data', 'server', 'Casaê'].includes(req.path.split('/')[1])) return res.sendStatus(404);
    next();
  });
  app.get('/sw.js', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.sendFile(path.join(root, 'dist', 'sw.js'), (error) => { if (error) next(error); });
  });
  app.use(express.static(path.join(root, 'dist'), { dotfiles: 'deny', index: 'index.html', setHeaders: setStaticCacheHeaders }));
  app.use((_req, res) => res.status(404).json({ ok: false, error: 'Página não encontrada.' }));
  app.use((err, req, res, _next) => {
    const status = err.type === 'entity.too.large' ? 413 : err.type === 'entity.parse.failed' ? 400 : err.status || 500;
    const message = status === 413 ? 'Arquivo maior que o limite permitido.' : status === 400 ? 'Conteúdo inválido.' : !production && err.expose ? err.message : 'Não foi possível concluir. Tente novamente.';
    logApiError(req, res, err, status);
    res.status(status).json({ ok: false, error: message });
  });
  return app;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = createApp();
  await initializeStorage();
  if (databaseDialect() === 'sqlite') await garantirConfiguracoesPadrao();
  const port = Number(process.env.PORT || 3210);
  const server = app.listen(port, process.env.HOST || '127.0.0.1', () => logEvent('info', 'server_started'));
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
}
