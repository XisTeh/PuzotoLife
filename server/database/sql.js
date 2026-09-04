// Only repository-owned SQL reaches this compiler. Values always remain parameters.
export function postgresQuery(source, args = [], mode = 'all') {
  let sql = source.trim().replace(/;$/, '');
  sql = sql.replace(/datetime\(['"]now['"],\s*['"]localtime['"]\)/gi, "to_char(timezone('America/Sao_Paulo', now()), 'YYYY-MM-DD HH24:MI:SS')")
    .replace(/date\(['"]now['"],\s*['"]localtime['"]\)/gi, "to_char(timezone('America/Sao_Paulo', now()), 'YYYY-MM-DD')")
    .replace(/([\w.]+)\s+COLLATE NOCASE/gi, 'lower($1)')
    .replace(/\bsqlite_master\b/g, "(SELECT table_name AS name, 'table' AS type FROM information_schema.tables WHERE table_schema = 'puzoto' AND table_type = 'BASE TABLE') AS catalog");
  const pragma = /^PRAGMA table_info\((\w+)\)$/i.exec(sql);
  if (pragma) return { text: "SELECT column_name AS name FROM information_schema.columns WHERE table_schema = 'puzoto' AND table_name = $1 ORDER BY ordinal_position", values: [pragma[1]] };
  if (/^INSERT OR IGNORE /i.test(sql)) sql = sql.replace(/^INSERT OR IGNORE /i, 'INSERT ') + ' ON CONFLICT DO NOTHING';

  const named = args.length === 1 && args[0] !== null && typeof args[0] === 'object' && !Array.isArray(args[0]);
  const positional = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
  const values = [];
  let position = 0;
  // Skip quoted strings, identifiers and SQL comments when binding placeholders.
  sql = sql.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|--[^\n]*|\/\*[\s\S]*?\*\/|@[a-zA-Z_]\w*|\?/g, token => {
    if (token !== '?' && !token.startsWith('@')) return token;
    const value = token === '?' ? positional[position++] : named && args[0][token.slice(1)];
    if (value === undefined || (token.startsWith('@') && !named)) throw new Error('Parâmetro SQL obrigatório ausente.');
    values.push(typeof value === 'boolean' ? Number(value) : value);
    return `$${values.length}`;
  });
  if (mode === 'run' && /^INSERT\s+INTO\b/i.test(sql) && !/\bRETURNING\b/i.test(sql)) {
    sql += /^INSERT\s+INTO\s+configuracoes\b/i.test(sql) ? ' RETURNING chave' : ' RETURNING id';
  }
  return { text: sql, values };
}
