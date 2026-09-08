import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const repo = 'XisTeh/PuzotoLife';
const credential = spawnSync('git', ['-c', 'credential.interactive=false', 'credential', 'fill'], {
  input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8', env: { ...process.env, GCM_INTERACTIVE: 'never' },
});
const fields = Object.fromEntries((credential.stdout || '').trim().split('\n').map((line) => {
  const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1)];
}));
if (!fields.password) throw new Error('Conecte o GitHub pelo Git Credential Manager.');
export async function github(endpoint, method = 'GET', body) {
  const response = await fetch(`https://api.github.com/repos/${repo}${endpoint}`, {
    method, headers: { Authorization: `Bearer ${fields.password}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = response.status === 204 ? {} : await response.json();
  if (!response.ok) throw new Error(`GitHub ${response.status}: ${result.message}`);
  return result;
}
if (process.argv[2] === 'issues') {
  const existing = await github('/issues?state=all&per_page=100');
  const labels = await github('/labels?per_page=100');
  for (const [name, color] of [['Correção', 'd73a4a'], ['Melhoria', '0e8a16'], ['Nova função', '1d76db']]) {
    if (!labels.some((label) => label.name === name)) await github('/labels', 'POST', { name, color });
  }
  const issues = JSON.parse(fs.readFileSync('docs/issues.json', 'utf8'));
  for (const issue of issues) {
    const remote = existing.find((item) => item.title === issue.title) || await github('/issues', 'POST', { title: issue.title, body: issue.body, labels: [issue.type] });
    issue.number = remote.number; issue.url = remote.html_url;
    console.log(`${issue.type}: #${remote.number}`);
  }
  fs.writeFileSync('docs/issues.json', `${JSON.stringify(issues, null, 2)}\n`);
}
