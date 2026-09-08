import { createClient } from '@supabase/supabase-js';
import { databaseDialect } from '../database/connection.js';

const BUCKET = 'puzoto-private';
let storageClient;

function client(env = process.env) {
  if (storageClient) return storageClient;
  if (typeof env.SUPABASE_SECRET_KEY !== 'string' || !env.SUPABASE_SECRET_KEY.startsWith('sb_secret_')) {
    throw new Error('Configure SUPABASE_SECRET_KEY somente no backend para o Storage privado.');
  }
  if (env.SUPABASE_SECRET_KEY === env.SUPABASE_PUBLISHABLE_KEY) throw new Error('A chave do Storage privado não pode ser a chave publicável.');
  storageClient = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return storageClient;
}

function validPath(value) {
  if (typeof value !== 'string' || value.length > 240 || !/^[a-z0-9_/-]+\.[a-z0-9]+$/i.test(value) || value.includes('..') || value.startsWith('/')) {
    throw new Error('Caminho de arquivo privado inválido.');
  }
  return value;
}

export async function initializePrivateStorage(env = process.env) {
  if (databaseDialect() !== 'postgres') return;
  const service = client(env);
  const { data, error } = await service.storage.getBucket(BUCKET);
  if (!error) {
    if (data.public) throw new Error('O bucket puzoto-private precisa permanecer privado.');
    return;
  }
  const { error: createError } = await service.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: 10 * 1024 * 1024,
    allowedMimeTypes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  });
  if (createError) throw new Error('Não foi possível validar o Storage privado do Supabase.');
}

export async function uploadPrivateFile(filePath, buffer, contentType, env = process.env) {
  validPath(filePath);
  if (!Buffer.isBuffer(buffer) || buffer.length === 0 || buffer.length > 10 * 1024 * 1024) throw new Error('Arquivo privado inválido ou maior que 10 MB.');
  const { error } = await client(env).storage.from(BUCKET).upload(filePath, buffer, { contentType, upsert: false });
  if (error) throw new Error('Não foi possível salvar o arquivo no Storage privado.');
}

export async function removePrivateFile(filePath, env = process.env) {
  validPath(filePath);
  const { error } = await client(env).storage.from(BUCKET).remove([filePath]);
  if (error) throw new Error('Não foi possível remover o arquivo incompleto do Storage privado.');
}
