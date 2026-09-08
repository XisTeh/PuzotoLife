import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const assets = fs.readdirSync('dist/assets').filter((name) => /\.(js|css)$/.test(name));
const html = fs.readFileSync('dist/index.html', 'utf8');
if (!html.includes('/assets/index.js') || !html.includes('/assets/index.css')) throw new Error('Entradas principais precisam de nomes estáveis para recuperar PWAs antigas.');
let total = 0;
for (const name of assets) {
  const bytes = gzipSync(fs.readFileSync(path.join('dist/assets', name))).length;
  total += bytes;
  const limit = name.startsWith('chart-') ? 90_000 : name === 'index.js' || name.startsWith('index-') ? 45_000 : 25_000;
  if (bytes > limit) throw new Error(`${name} excedeu orçamento gzip (${bytes}/${limit}).`);
}
if (total > 280_000) throw new Error(`Assets excederam 280 KB gzip: ${total}.`);
console.log(`Orçamento de performance: ${Math.round(total / 1000)} KB gzip, páginas sob demanda.`);
