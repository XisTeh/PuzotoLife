const LEVELS = new Set(['info', 'warn', 'error']);
const METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE']);
const TOKEN = /^[a-zA-Z0-9_.:-]+$/;
const ROUTE = /^\/[a-zA-Z0-9_/:.-]+$/;
const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ERROR_TYPE = /^(?:Error|[A-Z][a-zA-Z0-9]*Error)$/;
const ERROR_CODE = /^[A-Z0-9][A-Z0-9_]{0,79}$/;

function safeToken(value, maxLength = 80) {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength && TOKEN.test(value) ? value : undefined;
}

function safeRoute(value) {
  return typeof value === 'string' && value.length <= 140 && ROUTE.test(value) ? value : undefined;
}

export function createLogEntry(level, event, fields = {}, now = new Date()) {
  const safeLevel = LEVELS.has(level) ? level : 'info';
  const safeEvent = safeToken(event, 60);
  if (!safeEvent) throw new Error('Evento de observabilidade inválido.');

  const entry = { timestamp: now.toISOString(), level: safeLevel, event: safeEvent };
  const id = typeof fields.id === 'string' && REQUEST_ID.test(fields.id) ? fields.id : undefined;
  const method = METHODS.has(fields.method) ? fields.method : undefined;
  const route = safeRoute(fields.route);
  const errorType = typeof fields.errorType === 'string' && ERROR_TYPE.test(fields.errorType) ? fields.errorType : undefined;
  const errorCode = typeof fields.errorCode === 'string' && ERROR_CODE.test(fields.errorCode) ? fields.errorCode : undefined;
  if (id) entry.id = id;
  if (method) entry.method = method;
  if (route) entry.route = route;
  if (Number.isInteger(fields.status) && fields.status >= 100 && fields.status <= 599) entry.status = fields.status;
  if (Number.isFinite(fields.durationMs) && fields.durationMs >= 0) entry.durationMs = Math.round(fields.durationMs);
  if (Number.isSafeInteger(fields.count) && fields.count >= 0) entry.count = fields.count;
  if (Number.isSafeInteger(fields.skipped) && fields.skipped >= 0) entry.skipped = fields.skipped;
  if (errorType) entry.errorType = errorType;
  if (errorCode) entry.errorCode = errorCode;
  return entry;
}

export function logEvent(level, event, fields = {}, env = process.env) {
  const entry = createLogEntry(level, event, fields);
  if (env.NODE_ENV === 'test') return entry;
  const output = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  output(JSON.stringify(entry));
  return entry;
}

export function logApiError(req, res, error, status = 500, env = process.env) {
  return logEvent('error', 'api_error', {
    id: res.locals.requestId,
    method: req.method,
    route: req.route?.path,
    status,
    errorType: error?.constructor?.name || 'Error',
    errorCode: error?.code,
  }, env);
}
