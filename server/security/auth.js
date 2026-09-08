import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { rateLimit } from 'express-rate-limit';
import { applicationOrigin } from './origin.js';

const COOKIE = 'puzoto_session';
const MAX_AGE = 12 * 60 * 60 * 1000;

export function authConfigured(env) {
  const values = [env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, env.SUPABASE_OWNER_ID];
  if (values.some(Boolean) && !values.every(Boolean)) throw new Error('Complete as três variáveis SUPABASE no .env.');
  if (values.every(Boolean) && (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(env.SUPABASE_URL) || !/^[0-9a-f-]{36}$/i.test(env.SUPABASE_OWNER_ID))) throw new Error('URL ou UUID do Supabase inválido.');
  return values.every(Boolean);
}

export function createAuth(env = process.env, clientFactory = createClient) {
  const configured = authConfigured(env);
  const sessions = new Map();
  const client = () => clientFactory(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const router = Router();
  const cookieOptions = { httpOnly: true, secure: env.NODE_ENV === 'production', sameSite: 'strict', path: '/api' };
  const sessionId = (req) => req.headers.cookie?.split(';').map((v) => v.trim()).find((v) => v.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  function endSession(req, res) {
    sessions.delete(sessionId(req));
    res.clearCookie(COOKIE, cookieOptions);
  }
  function startSession(req, res, authClient, recoveryOnly = false) {
    for (const [key, value] of sessions) if (value.until < Date.now()) sessions.delete(key);
    while (sessions.size >= 32) sessions.delete(sessions.keys().next().value);
    endSession(req, res);
    const id = randomBytes(32).toString('hex');
    sessions.set(id, { client: authClient, until: Date.now() + MAX_AGE, recoveryOnly });
    res.cookie(COOKIE, id, { ...cookieOptions, maxAge: MAX_AGE });
  }
  async function validate(req) {
    const saved = sessions.get(sessionId(req));
    if (!saved || saved.until < Date.now()) { sessions.delete(sessionId(req)); return null; }
    const { data, error } = await saved.client.auth.getUser();
    if (error || data.user?.id !== env.SUPABASE_OWNER_ID) { sessions.delete(sessionId(req)); return null; }
    return saved;
  }
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  router.get('/session', async (req, res) => {
    if (!configured) return res.json({ ok: true, mode: 'local', authenticated: true });
    try {
      const saved = await validate(req);
      res.json({ ok: true, mode: 'supabase', authenticated: Boolean(saved) && !saved.recoveryOnly, recovery: Boolean(saved?.recoveryOnly) });
    } catch { res.status(503).json({ ok: false, error: 'Não foi possível verificar sua sessão.' }); }
  });
  router.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { ok: false, error: 'Muitas tentativas. Aguarde alguns minutos.' } }));
  router.post('/login', async (req, res) => {
    if (!configured) return res.status(503).json({ ok: false, error: 'Login ainda não configurado.' });
    const { email, password } = req.body ?? {};
    if (typeof email !== 'string' || email.length > 254 || typeof password !== 'string' || password.length > 128) return res.status(400).json({ ok: false, error: 'Informe e-mail e senha válidos.' });
    try {
      const authClient = client();
      const { data, error } = await authClient.auth.signInWithPassword({ email, password });
      if (error || data.user?.id !== env.SUPABASE_OWNER_ID) return res.status(401).json({ ok: false, error: 'Não foi possível entrar com esses dados.' });
      startSession(req, res, authClient);
      res.json({ ok: true });
    } catch { res.status(503).json({ ok: false, error: 'Serviço de login indisponível. Tente novamente.' }); }
  });
  router.post('/logout', async (req, res) => {
    const saved = sessions.get(sessionId(req));
    endSession(req, res);
    if (saved) { try { await saved.client.auth.signOut({ scope: 'local' }); } catch { /* Cookie revogado. */ } }
    res.json({ ok: true });
  });
  router.post('/forgot-password', async (req, res) => {
    if (!configured) return res.sendStatus(503);
    const email = req.body?.email;
    if (typeof email !== 'string' || email.length > 254) return res.status(400).json({ ok: false, error: 'Informe um e-mail válido.' });
    try { await client().auth.resetPasswordForEmail(email, { redirectTo: `${applicationOrigin(env)}/` }); } catch { /* Evitar enumeração. */ }
    res.json({ ok: true, message: 'Se houver uma conta para esse e-mail, você receberá as instruções.' });
  });
  router.post('/recover-session', async (req, res) => {
    if (!configured) return res.sendStatus(503);
    const { access_token, refresh_token } = req.body ?? {};
    if (typeof access_token !== 'string' || access_token.length > 8192 || typeof refresh_token !== 'string' || refresh_token.length > 8192) return res.sendStatus(400);
    try {
      const authClient = client();
      const { data, error } = await authClient.auth.setSession({ access_token, refresh_token });
      if (error || data.user?.id !== env.SUPABASE_OWNER_ID) return res.status(401).json({ ok: false, error: 'Link inválido ou expirado.' });
      startSession(req, res, authClient, true);
      res.json({ ok: true });
    } catch { res.status(401).json({ ok: false, error: 'Link inválido ou expirado.' }); }
  });
  router.post('/password', async (req, res) => {
    const password = req.body?.password;
    if (typeof password !== 'string' || password.length < 12 || password.length > 128) return res.status(400).json({ ok: false, error: 'Use uma senha entre 12 e 128 caracteres.' });
    try {
      const saved = await validate(req);
      if (!saved) return res.status(401).json({ ok: false, error: 'Entre novamente para alterar sua senha.' });
      const { error } = await saved.client.auth.updateUser({ password });
      if (error) return res.status(400).json({ ok: false, error: 'Não foi possível alterar a senha. Solicite outro link.' });
      sessions.clear();
      endSession(req, res);
      res.json({ ok: true });
    } catch { res.status(503).json({ ok: false, error: 'Serviço temporariamente indisponível.' }); }
  });
  const guard = async (req, res, next) => {
    if (!configured) return next();
    try {
      const saved = await validate(req);
      if (!saved || saved.recoveryOnly) return res.status(401).json({ ok: false, error: 'Entre na sua conta para continuar.' });
      req.user = { id: env.SUPABASE_OWNER_ID };
      next();
    } catch { res.status(503).json({ ok: false, error: 'Não foi possível verificar sua sessão.' }); }
  };
  return { router, guard, configured };
}
