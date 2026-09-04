# Supabase e publicação — passo a passo

Projeto confirmado: **PuzotoLife**, região São Paulo. [Painel do projeto](https://supabase.com/dashboard/project/pbumqabetyzvuathyspn).

## Estado atual

Login e serviços assíncronos PostgreSQL estão implementados. Testes sintéticos verificam Cofre, cartões, recebimentos, fechamentos, laudos e relatórios nos dois bancos. Seu uso atual continua no SQLite: não aplicamos migrações nem copiamos dados para o Supabase real. A Issue #5 permanece aberta até essa validação. Publicação continua bloqueada pela revisão de segurança e pelos gates dos PRs.

## 1. Crie seu acesso

1. Abra **Authentication → Users → Add user → Create new user**.
2. Informe seu e-mail e senha exclusiva. Faça você mesmo a entrada e confirmação da senha; não a envie no chat.
3. Copie o UUID do usuário para identificar o proprietário. Outro usuário autenticado não poderá abrir seu acervo.
4. Em **Authentication → Sign In / Providers**, cadastro público e acesso anônimo já foram desativados. E-mail é o único provedor habilitado.

## 2. Configure o arquivo privado

1. Copie `.env.example` para `.env` na raiz do projeto.
2. Preencha `SUPABASE_URL=https://pbumqabetyzvuathyspn.supabase.co`.
3. Em **Project Settings → API Keys**, copie a chave **publishable** para `SUPABASE_PUBLISHABLE_KEY`. Login não precisa de service_role nem secret key.
4. Coloque seu UUID em `SUPABASE_OWNER_ID`.
5. Mantenha `PUZOTO_DATABASE=sqlite`, `APP_ORIGIN=http://localhost:5174`, `HOST=127.0.0.1` e `PORT=3210` durante a preparação.
6. O `.env` local já contém URL, chave publishable e UUID do proprietário; o banco permanece `sqlite`. Backend e frontend foram reiniciados. Abra `http://localhost:5174` e valide login e logout com sua senha.

O nome correto é `.env`; `.inv` também está ignorado para proteger contra erro de digitação. Senhas e chaves secretas nunca entram em `VITE_*`, código, prints, Issues ou PRs. Cookies são HttpOnly, SameSite Strict e Secure em produção. Tokens ficam na memória do backend: reiniciar exige novo login. Não usar múltiplas réplicas antes de compartilhar sessões e rate limit.

## 3. Recuperação de senha

Em **Authentication → URL Configuration**, Site URL e redirect já estão definidos exatamente como `http://localhost:5174`, sem curingas. Trocar/adicionar o domínio HTTPS final antes do deploy. “Esqueci minha senha” usa e-mail do Supabase; produção exige configurar e testar SMTP próprio. O link abre uma sessão restrita de recuperação, sem liberar dados antes de novo login.

## 4. Migração — depois da revisão dos PRs

1. Aprovar o PR de fundação e depois o PR de `codex/supabase-postgres`, com CI verde. Validar primeiro numa base de teste. Não remover o bloqueio de publicação para pular etapas.
2. Aplicar `supabase/migrations/202609040001_legacy_structure.sql`. Cria 23 tabelas no schema privado `puzoto`, com RLS. Não expor o schema pela Data API. O arquivo contém somente estrutura.
3. Aplicar `202609040002_runtime_role.sql`. Cria `puzoto_runtime` sem login, sem DDL e sem bypass de RLS. Somente esse backend tem DML no acervo. `anon` e `authenticated` continuam sem acesso.
4. Em **Connect**, obter a conexão administrativa **Session pooler** quando necessário para IPv4. Preencher `SUPABASE_DB_URL` somente no `.env` privado. Codificar caracteres especiais da senha na URL. Não enviar a conexão no chat. Manter verificação de certificado TLS.
5. Rodar `node scripts/migrate-supabase.mjs`: valida o snapshot sem conectar nem escrever remotamente.
6. Parar lançamentos durante a janela de migração. **Info é imutável e retrata o início da modernização**. Se houve novos lançamentos, criar snapshot consistente atualizado em `data/`, nunca sobre Info, e indicar `MIGRATION_SOURCE`.
7. Conferir projeto, schema e snapshot; rodar `node scripts/migrate-supabase.mjs --apply`. Exige destino vazio, importa em transação e compara todos os valores/relacionamentos. Não substitui uma base preenchida. O relatório fica privado em `data/migration-reports/`.
8. Conferir anexos, planilhas, saldos e relatórios por competência. A migração relacional não envia arquivos automaticamente.
9. Depois da validação, habilitar login e definir senha exclusiva para `puzoto_runtime` em conexão administrativa privada. Essa etapa de credencial deve ser feita pelo proprietário. Instrução: `ALTER ROLE puzoto_runtime LOGIN PASSWORD '<senha exclusiva>';`. Não enviar no chat nem salvar em SQL versionado. Usar somente no ambiente privado e remover do editor ao concluir.
10. Preencher `SUPABASE_RUNTIME_DB_URL` com usuário `puzoto_runtime` (conexão direta) ou `puzoto_runtime.pbumqabetyzvuathyspn` (pooler), senha desse papel e host/porta de **Connect**. Não usar `postgres` no servidor. A URL não aceita parâmetros que substituam a configuração TLS. Se precisar da CA do painel, salvar em arquivo privado e informar `SUPABASE_DB_CA_FILE`.
11. Definir `PUZOTO_DATABASE=postgres` e reiniciar. A inicialização verifica papel, colunas e RLS; não cria tabelas nem insere registros. Conferir `/api/health` com `storage: postgres`, fazer login e validar saldos, recebimentos e exportação. Continua no loopback até terminar segurança/deploy.
12. Se falhar antes de novas gravações na nuvem, voltar a `PUZOTO_DATABASE=sqlite`. Depois de novas gravações, reconciliar/exportar os dados novos antes de retornar ao snapshot antigo. Não apagar Info nem dados remotos.

## 5. Limitações operacionais

No PostgreSQL, Backup oferece exportação JSON consistente e indica que retenção/restauração devem ser verificadas no Supabase. Backup/restauração `.db`, importação JSON legada e limpeza de testes ficam restritos ao SQLite. Importação na nuvem pela interface ainda não está liberada. Planilhas continuam privadas no backend: o deploy precisa de volume persistente ou Storage privado.

Escritas usam lock transacional por acervo pessoal, inclusive entre processos. Leituras seguem concorrentes. Uma plataforma multiusuário exige particionar dados, lock e políticas por proprietário. Sessões em memória exigem uma réplica até implementar armazenamento compartilhado.

## 6. Celular e computador

Localhost funciona apenas neste computador. Para acesso remoto, concluir #5 e #7, escolher hospedagem Node + HTTPS, configurar segredos no provedor e publicar o commit aprovado em PR. Frontend e `/api` devem usar a mesma origem. Ainda não há URL pública funcional.

Antes do lançamento: login/recuperação reais, persistência entre dispositivos, negação de outro usuário, exportação/restauração, XSS/CSRF, validação de payloads, rate limit, desempenho, observabilidade sem dados pessoais e revisão jurídica humana. O bloqueio de produção não deve ser removido isoladamente.

## Fontes técnicas

- [Supabase Auth](https://supabase.com/docs/reference/javascript/auth-getuser)
- [Conexões PostgreSQL](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Senhas](https://supabase.com/docs/guides/auth/passwords)
- [Transações no pg](https://node-postgres.com/features/transactions)
- [Pool de conexões](https://node-postgres.com/features/pooling)
