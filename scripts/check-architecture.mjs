import fs from 'node:fs';
import path from 'node:path';

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
}
const problems = [];
for (const file of files('src').filter((name) => name.endsWith('.js'))) {
  const source = fs.readFileSync(file, 'utf8');
  if (/from\s+['"][^'"]*(?:server\/|node:|better-sqlite3|postgres|pg['"])/.test(source)) problems.push(`${file}: backend importado pelo frontend`);
  if (/SUPABASE_SERVICE_ROLE|SUPABASE_DB_URL|DATABASE_URL|sb_secret_/.test(source)) problems.push(`${file}: segredo no frontend`);
  if (/https?:\/\/(?:localhost|127\.0\.0\.1):3210/.test(source)) problems.push(`${file}: API com endereço local fixo`);
  if (file !== path.join('src', 'services', 'http.js') && /\bfetch\(/.test(source)) problems.push(`${file}: usar apiFetch para preservar sessão e proteção CSRF`);
  if (/\son(?!click=|change=|input=|submit=|keydown=|keyup=)[a-z]+=/i.test(source)) problems.push(`${file}: atributo de evento fora do adaptador restrito`);
  if (/(?:toast|\bt)\.innerHTML\s*=.*\bmessage\b/.test(source)) problems.push(`${file}: mensagem dinâmica deve usar nó de texto`);
}
for (const file of files('public')) {
  if (/\.(?:db|sqlite|env|key|pem|xlsx|csv|jsonl)(?:-|$)/i.test(file)) problems.push(`${file}: arquivo privado em public`);
}
const httpSecurity = fs.readFileSync(path.join('server', 'security', 'http.js'), 'utf8');
if (!/scriptSrcAttr:\s*\["'none'"\]/.test(httpSecurity)) problems.push('server/security/http.js: CSP deve negar scripts em atributos');
if (problems.length) throw new Error(problems.join('\n'));
console.log('Contratos de arquitetura: OK');
