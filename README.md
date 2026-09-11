# Puzoto Life

Controle pessoal de trabalho e finanças, publicado com Supabase, PostgreSQL e acesso por celular/computador.

**Situação:** a produção usa Supabase Auth, PostgreSQL e runtime Express na Vercel. SQLite e os servidores em loopback existem somente para desenvolvimento e testes isolados.

Leia [AGENTS.md](AGENTS.md) antes de qualquer mudança. Entregas via Issues classificadas e Pull Requests com validação, riscos e próximos passos.

## Desenvolvimento

No uso diário, abra [puzoto-life.vercel.app](https://puzoto-life.vercel.app/) ou o PWA instalado; nenhum servidor precisa iniciar com o Windows. Para desenvolvimento, use Node.js 24, `npm ci` e `npm run dev:all`; frontend e backend permanecem no loopback. Para a arquitetura e os ambientes, siga [o guia Supabase](docs/SUPABASE.md).

`npm run quality` valida lint, arquitetura, testes, build e orçamento de performance. `npm run test:e2e` usa banco sintético isolado (execute `npx playwright install chromium` antes). `npm audit --audit-level=high` valida dependências.

Estado das entregas: [docs/ENTREGAS.md](docs/ENTREGAS.md). Dados, backups e `.env` são privados e não pertencem a este repositório. O histórico local anterior contém dados; não fazer `git push --all` ou publicar esse histórico.
