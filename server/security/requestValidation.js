const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const MAX_DEPTH = 8;
const MAX_NODES = 2_000;
const MAX_BODY_STRING = 20_000;
const MAX_QUERY_STRING = 2_048;

export class RequestValidationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'RequestValidationError';
    this.status = status;
    this.expose = true;
  }
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function inspectJson(value, path, state, depth = 0) {
  state.nodes += 1;
  if (state.nodes > MAX_NODES) throw new RequestValidationError('Conteúdo muito complexo.');
  if (depth > MAX_DEPTH) throw new RequestValidationError('Conteúdo excede o limite de profundidade.');

  if (typeof value === 'string') {
    if (value.length > MAX_BODY_STRING) throw new RequestValidationError(`${path} excede o tamanho permitido.`);
    if (value.includes('\0')) throw new RequestValidationError(`${path} contém caractere inválido.`);
    return;
  }
  if (value === null || ['number', 'boolean'].includes(typeof value)) return;
  if (Array.isArray(value)) {
    if (value.length > 1_000) throw new RequestValidationError(`${path} contém itens demais.`);
    value.forEach((item, index) => inspectJson(item, `${path}[${index}]`, state, depth + 1));
    return;
  }
  if (!isPlainObject(value)) throw new RequestValidationError(`${path} possui formato inválido.`);

  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) throw new RequestValidationError(`${path} contém uma chave proibida.`);
    if (key.length > 100 || key.includes('\0')) throw new RequestValidationError(`${path} contém uma chave inválida.`);
    inspectJson(item, `${path}.${key}`, state, depth + 1);
  }
}

function inspectQuery(query) {
  for (const [key, value] of Object.entries(query)) {
    if (FORBIDDEN_KEYS.has(key) || key.length > 100 || key.includes('\0')) throw new RequestValidationError('Consulta inválida.');
    if (typeof value !== 'string') throw new RequestValidationError(`O parâmetro ${key} deve ter um único valor.`);
    if (value.length > MAX_QUERY_STRING || value.includes('\0')) throw new RequestValidationError(`O parâmetro ${key} é inválido.`);
  }
}

function expectsTextImport(req) {
  return req.path === '/importar/validar-json' || req.path === '/importar/json';
}

export function validateApiRequest(req, _res, next) {
  try {
    if (MUTATING_METHODS.has(req.method) && (req.get('Content-Length') || req.get('Transfer-Encoding'))) {
      const accepted = expectsTextImport(req) ? req.is('text/plain') : req.is('application/json');
      if (!accepted) throw new RequestValidationError('Tipo de conteúdo não suportado.', 415);
    }
    inspectQuery(req.query);
    if (req.body !== undefined) {
      if (!isPlainObject(req.body)) throw new RequestValidationError('O corpo da requisição deve ser um objeto JSON.');
      inspectJson(req.body, 'body', { nodes: 0 });
    }
    next();
  } catch (error) {
    next(error);
  }
}

export function validateIdParam(req, _res, next, value) {
  const installmentGroup = req.path.startsWith('/financas/pessoas-dividas/') && /^dp_[1-9]\d*$/.test(value);
  if ((!/^[1-9]\d*$/.test(value) && !installmentGroup) || Number(value.replace('dp_', '')) > 2_147_483_647) {
    return next(new RequestValidationError('Identificador inválido.'));
  }
  next();
}

export function validateTextParam(label, maxLength = 200) {
  return (_req, _res, next, value) => {
    if (typeof value !== 'string' || value.length === 0 || value.length > maxLength || value.includes('\0')) {
      return next(new RequestValidationError(`${label} inválido.`));
    }
    next();
  };
}

export function validateBackupFilenameParam(_req, _res, next, value) {
  if (!/^puzoto_life_(?:backup|auto_before_(?:restore|import))_[A-Za-z0-9_.-]+\.db$/.test(value)) {
    return next(new RequestValidationError('Nome de backup inválido.'));
  }
  next();
}
