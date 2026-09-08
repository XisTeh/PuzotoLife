import fs from 'node:fs';

const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
if (event.pull_request) {
  const body = event.pull_request.body || '';
  const checks = [/(?:Closes|Fixes|Refs|Relacionad[ao])\s+#\d+/i, /mudan[çc]a/i, /valida[çc][ãa]o/i, /riscos/i, /limita[çc][õo]es/i, /pr[óo]ximos passos/i];
  if (!checks.every((pattern) => pattern.test(body))) throw new Error('O PR deve mencionar uma Issue e descrever mudanças, validação, riscos, limitações e próximos passos.');
}
console.log('Descrição do PR atende ao padrão do projeto.');
