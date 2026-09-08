import { createHmac, timingSafeEqual } from 'node:crypto';
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

function requireSessionSecret(env, configured) {
  if (!configured) return null;
  if (typeof env.SESSION_SECRET !== 'string' || Buffer.byteLength(env.SESSION_SECRET, 'utf8') < 32) {
    throw new Error('Configure SESSION_SECRET com pelo menos 32 caracteres somente no backend.');
  }
  return env.SESSION_SECRET;
}

function parseCookie(req, name) {
  const entry = req.headers.cookie?.split(';').map((value) => value.trim()).find((value) => value.startsWith(`${name}=`));
  if (!entry) return null;
  try { return decodeURIComponent(entry.slice(name.length + 1)); } catch { return null; }
}

export function createAuth(env = process.env, clientFactory = createClient) {
  const configured = authConfigured(env);
  const sessionSecret = requireSessionSecret(env, configured);
  const client = () => clientFactory(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const router = Router();
  const cookieOptions = { httpOnly: true, secure: env.NODE_ENV === 'production', sameSite: 'strict', path: '/api' };

  function sign(value) {
    return createHmac('sha256', sessionSecret).update(value).digest('base64url');
  }

  function encodeSession(session, recoveryOnly = false) {
    if (typeof session?.access_token !== 'string' || typeof session?.refresh_token !== 'string') throw new Error('Sessão Supabase inválida.');
    const body = Buffer.from(JSON.stringify({
      access: session.access_token,
      refresh: session.refresh_token,
      recoveryOnly,
      until: Date.now() + MAX_AGE,
    })).toString('base64url');
    return `${body}.${sign(body)}`;
  }

  function decodeSession(req) {
    const value = parseCookie(req, COOKIE);
    if (!value || value.length > 12_000) return null;
    const [body, signature, extra] = value.split('.');
    if (!body || !signature || extra) return null;
    const expected = Buffer.from(sign(body));
    const actual = Buffer.from(signature);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    try {
      const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
      if (typeof parsed.access !== 'string' || typeof parsed.refresh !== 'string' || typeof parsed.until !== 'number' || parsed.until < Date.now()) return null;
      if (typeof parsed.recoveryOnly !== 'boolean') return null;
      return parsed;
    } catch { return null; }
  }

  function endSession(res) {
    res.clearCookie(COOKIE, cookieOptions);
  }

  function startSession(res, session, recoveryOnly = false) {
    res.cookie(COOKIE, encodeSession(session, recoveryOnly), { ...cookieOptions, maxAge: MAX_AGE });
  }

  async function validate(req, res) {
    const saved = decodeSession(req);
    if (!saved) { endSession(res); return null; }
    const authClient = client();
    const { data: sessionData, error: sessionError } = await authClient.auth.setSession({ access_token: saved.access, refresh_token: saved.refresh });
    if (sessionError) { endSession(res); return null; }
    const { data, error } = await authClient.auth.getUser();
    if (error || data.user?.id !== env.SUPABASE_OWNER_ID) { endSession(res); return null; }
    if (sessionData?.session && (sessionData.session.access_token !== saved.access || sessionData.session.refresh_token !== saved.refresh)) {
      startSession(res, sessionData.session, saved.recoveryOnly);
    }
    return { client: authClient, recoveryOnly: saved.recoveryOnly };
  }

  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  router.get('/session', async (req, res) => {
    if (!configured) return res.json({ ok: true, mode: 'local', authenticated: true });
    try {
      const saved = await validate(req, res);
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
      if (error || data.user?.id !== env.SUPABASE_OWNER_ID || !data.session) return res.status(401).json({ ok: false, error: 'Não foi possível entrar com esses dados.' });
      startSession(res, data.session);
      res.json({ ok: true });
    } catch { res.status(503).json({ ok: false, error: 'Serviço de login indisponível. Tente novamente.' }); }
  });
  router.post('/logout', async (req, res) => {
    let saved;
    try { saved = await validate(req, res); } catch { /* O cookie será removido mesmo se o Supabase estiver indisponível. */ }
    endSession(res);
    if (saved) { try { await saved.client.auth.signOut({ scope: 'global' }); } catch { /* Cookie removido. */ } }
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
      if (error || data.user?.id !== env.SUPABASE_OWNER_ID || !data.session) return res.status(401).json({ ok: false, error: 'Link inválido ou expirado.' });
      startSession(res, data.session, true);
      res.json({ ok: true });
    } catch { res.status(401).json({ ok: false, error: 'Link inválido ou expirado.' }); }
  });
  router.post('/password', async (req, res) => {
    const password = req.body?.password;
    if (typeof password !== 'string' || password.length < 12 || password.length > 128) return res.status(400).json({ ok: false, error: 'Use uma senha entre 12 e 128 caracteres.' });
    try {
      const saved = await validate(req, res);
      if (!saved) return res.status(401).json({ ok: false, error: 'Entre novamente para alterar sua senha.' });
      const { error } = await saved.client.auth.updateUser({ password });
      if (error) return res.status(400).json({ ok: false, error: 'Não foi possível alterar a senha. Solicite outro link.' });
      endSession(res);
      res.json({ ok: true });
    } catch { res.status(503).json({ ok: false, error: 'Serviço temporariamente indisponível.' }); }
  });
  const guard = async (req, res, next) => {
    if (!configured) return next();
    try {
      const saved = await validate(req, res);
      if (!saved || saved.recoveryOnly) return res.status(401).json({ ok: false, error: 'Entre na sua conta para continuar.' });
      req.user = { id: env.SUPABASE_OWNER_ID };
      next();
    } catch { res.status(503).json({ ok: false, error: 'Não foi possível verificar sua sessão.' }); }
  };
  return { router, guard, configured };
}
