import './environment.js';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeStorage } from './database/initialize.js';
import { databaseDialect } from './database/connection.js';
import { garantirConfiguracoesPadrao } from './services/configuracoes.js';
import apiRoutes from './routes/api.js';
import { createAuth } from './security/auth.js';
import { installHttpSecurity } from './security/http.js';
import { validateApiRequest } from './security/requestValidation.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function createApp(env = process.env, authFactory = createAuth) {
  if (env.NODE_ENV === 'production' || (env.HOST && !['127.0.0.1', 'localhost', '::1'].includes(env.HOST))) {
    throw new Error('Publicação bloqueada: concluir PostgreSQL, revisão XSS e gates em docs/ENTREGAS.md.');
  }
  const app = express();
  installHttpSecurity(app, env);
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', validateApiRequest);
  const auth = authFactory(env);
  app.use('/api/auth', auth.router);
  if (databaseDialect() === 'postgres' && !auth.configured && env.NODE_ENV !== 'test') throw new Error('PostgreSQL exige autenticação Supabase e proprietário configurados.');
  app.get('/api/health', (_req, res) => res.json({ ok: true, status: 'online', storage: databaseDialect(), auth: auth.configured ? 'supabase' : 'local' }));
  app.use('/api', auth.guard, apiRoutes);
  app.use('/api', (_req, res) => res.status(404).json({ ok: false, error: 'Rota não encontrada.' }));
  app.use((req, res, next) => {
    if (req.path.split('/').some(part => part.startsWith('.')) || ['Info', 'data', 'server', 'Casaê'].includes(req.path.split('/')[1])) return res.sendStatus(404);
    next();
  });
  app.use(express.static(path.join(root, 'dist'), { dotfiles: 'deny', index: 'index.html' }));
  app.use((_req, res) => res.status(404).json({ ok: false, error: 'Página não encontrada.' }));
  app.use((err, _req, res, _next) => {
    const status = err.type === 'entity.too.large' ? 413 : err.type === 'entity.parse.failed' ? 400 : err.status || 500;
    const message = status === 413 ? 'Arquivo maior que o limite permitido.' : status === 400 && !err.expose ? 'Conteúdo inválido.' : err.expose ? err.message : 'Não foi possível concluir. Tente novamente.';
    res.status(status).json({ ok: false, error: message });
  });
  return app;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = createApp();
  await initializeStorage();
  if (databaseDialect() === 'sqlite') await garantirConfiguracoesPadrao();
  const port = Number(process.env.PORT || 3210);
  const server = app.listen(port, process.env.HOST || '127.0.0.1', () => console.log('Puzoto Life: http://127.0.0.1:' + port));
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
}
