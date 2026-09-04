# Puzoto Life

Controle pessoal de trabalho e finanças. Modernização em andamento para Supabase e acesso por celular/computador.

**Situação:** a versão desta branch funciona localmente com SQLite. Login Supabase foi implementado e aguarda configuração/validação real. Migração do runtime PostgreSQL e publicação estão pendentes. Não disponibilizar o backend atual na internet.

Leia [AGENTS.md](AGENTS.md) antes de qualquer mudança. Entregas via Issues classificadas e Pull Requests com validação, riscos e próximos passos.

## Desenvolvimento

Node.js 24 e npm. Execute `npm ci` e `npm run dev:all`. Frontend em `http://localhost:5174`; backend no loopback. Para login, siga [o guia Supabase](docs/SUPABASE.md).

`npm run quality` valida lint, arquitetura, testes, build e orçamento de performance. `npm run test:e2e` usa banco sintético isolado (execute `npx playwright install chromium` antes). `npm audit --audit-level=high` valida dependências.

Estado das entregas: [docs/ENTREGAS.md](docs/ENTREGAS.md). Dados, backups, `.env` e referência Casaê são privados e não pertencem a este repositório. O histórico local anterior contém dados; não fazer `git push --all` ou publicar esse histórico.
