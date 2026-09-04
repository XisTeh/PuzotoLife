import { execFileSync } from 'node:child_process';

const names = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const privateFiles = names.filter((name) => /(^|\/)(?:Info|data|node_modules|Casaê|local-tools)\/|(^|\/)\.env(?:\.|$)|\.(?:db|sqlite|key|pem)(?:-|$)/i.test(name) && !name.endsWith('.env.example'));
if (privateFiles.length) throw new Error(`${privateFiles.length} arquivos privados/runtimes rastreados pelo Git. Remova apenas do índice antes do push.`);
console.log('Índice Git sem bancos, backups ou segredos locais.');
