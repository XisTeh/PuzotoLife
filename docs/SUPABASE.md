# Supabase e publicação — passo a passo

Projeto confirmado: **PuzotoLife**, região São Paulo. [Painel do projeto](https://supabase.com/dashboard/project/pbumqabetyzvuathyspn).

## Estado atual

Login e serviços assíncronos PostgreSQL estão implementados. Em 08/09/2026, as migrações foram aplicadas no projeto real e um snapshot corrente foi importado com paridade: 23 tabelas e 5.386 registros, integridade OK e zero violações de chave estrangeira. A conexão restrita `puzoto_runtime` foi testada no pooler com TLS verificado e não consegue executar DDL; o projeto também passou a rejeitar conexões sem SSL. O bucket privado `puzoto-private` foi criado e validado. O commit revisado `14e22fe` está publicado na Vercel e as rotas públicas passaram no smoke test automatizado.

## 1. Crie seu acesso

1. Abra **Authentication → Users → Add user → Create new user**.
2. Informe seu e-mail e senha exclusiva. Faça você mesmo a entrada e confirmação da senha; não a envie no chat.
3. Copie o UUID do usuário para identificar o proprietário. Outro usuário autenticado não poderá abrir seu acervo.
4. Em **Authentication → Sign In / Providers**, cadastro público e acesso anônimo já foram desativados. E-mail é o único provedor habilitado.

## 2. Configure o arquivo privado

1. Copie `.env.example` para `.env` na raiz do projeto.
2. Preencha `SUPABASE_URL=https://pbumqabetyzvuathyspn.supabase.co`.
3. Em **Project Settings → API Keys**, copie a chave **publishable** para `SUPABASE_PUBLISHABLE_KEY`. A chave `sb_secret_` é usada somente pelo backend para o Storage privado e fica em `SUPABASE_SECRET_KEY`; nunca use essa chave no frontend.
4. Coloque seu UUID em `SUPABASE_OWNER_ID`.
5. Mantenha `PUZOTO_DATABASE=sqlite`, `APP_ORIGIN=http://localhost:5174`, `HOST=127.0.0.1` e `PORT=3210` durante a preparação.
6. O `.env` local já contém URL, chave publishable e UUID do proprietário; o banco permanece `sqlite`. Abra `http://localhost:5174` ou `http://127.0.0.1:5174` e valide login e logout com sua senha. Os dois endereços são equivalentes somente no desenvolvimento; o link de recuperação usa a origem canônica `http://localhost:5174`.

O nome correto é `.env`; `.inv` também está ignorado para proteger contra erro de digitação. Senhas e chaves secretas nunca entram em `VITE_*`, código, prints, Issues ou PRs. Cookies são HttpOnly, SameSite Strict e Secure em produção. Os tokens Supabase ficam em cookie assinado pelo backend e cada requisição privada comum revalida o access token uma vez no Auth remoto com `getUser(token)`, permitindo revogação, reinícios e múltiplas instâncias sem uma tabela de sessão. O refresh token só é usado quando o access token está realmente expirado; logout e troca de senha anexam a sessão após a validação. O limite de tentativas da aplicação é por instância; os limites adicionais do Supabase Auth continuam ativos.

O Security Advisor do projeto registra zero erros. O único aviso é “Leaked Password Protection Disabled”; o Supabase disponibiliza essa verificação somente no plano Pro. O backend exige pelo menos 12 caracteres ao definir uma nova senha, e cadastro público continua bloqueado.

## 3. Recuperação de senha

Em **Authentication → URL Configuration**, Site URL e redirect já estão definidos exatamente como `http://localhost:5174`, sem curingas. O acesso local pode começar em `127.0.0.1:5174`, mas o link enviado volta para o endereço canônico permitido pelo Supabase. Trocar/adicionar o domínio HTTPS final antes do deploy. “Esqueci minha senha” usa e-mail do Supabase; produção exige configurar e testar SMTP próprio. O link abre uma sessão restrita de recuperação, sem liberar dados antes de novo login.

## 4. Migração — executada em 08/09/2026

As etapas abaixo registram o procedimento executado e servem para auditoria ou uma futura restauração controlada.

1. Os PRs de fundação e PostgreSQL foram mesclados com CI verde. A paridade foi validada antes em SQLite temporário, PGlite e PostgreSQL de CI.
2. Aplicar `supabase/migrations/202609040001_legacy_structure.sql`. Cria 23 tabelas no schema privado `puzoto`, com RLS. Não expor o schema pela Data API. O arquivo contém somente estrutura.
3. Aplicar `202609040002_runtime_role.sql`. Cria `puzoto_runtime` sem login, sem DDL e sem bypass de RLS. Somente esse backend tem DML no acervo. `anon` e `authenticated` continuam sem acesso.
4. Em **Connect**, obter a conexão administrativa **Session pooler** quando necessário para IPv4. Preencher `SUPABASE_DB_URL` somente no `.env` privado. Codificar caracteres especiais da senha na URL. Não enviar a conexão no chat. Manter verificação de certificado TLS.
5. Rodar `node scripts/snapshot-current-database.mjs` para criar uma cópia WAL consistente e privada; depois usar `node scripts/migrate-supabase.mjs` para validar sem escrita remota.
6. Parar lançamentos durante a janela de migração. **Info é imutável e retrata o início da modernização**. Se houve novos lançamentos, criar snapshot consistente atualizado em `data/`, nunca sobre Info, e indicar `MIGRATION_SOURCE`.
7. Conferir projeto, schema e snapshot; rodar `node scripts/migrate-supabase.mjs --apply`. Exige destino vazio, importa em transação e compara todos os valores/relacionamentos. Não substitui uma base preenchida. O relatório fica privado em `data/migration-reports/`.
8. Conferir anexos, planilhas, saldos e relatórios por competência. A migração relacional não envia arquivos automaticamente.
9. Depois da validação, `node scripts/provision-supabase-runtime.mjs --apply` habilita o login de `puzoto_runtime` com senha aleatória e registra somente a URL restrita no `.env`. A conexão administrativa não vai para o runtime.
10. Preencher `SUPABASE_RUNTIME_DB_URL` com usuário `puzoto_runtime` (conexão direta) ou `puzoto_runtime.pbumqabetyzvuathyspn` (pooler), senha desse papel e host/porta de **Connect**. Não usar `postgres` no servidor. A URL não aceita parâmetros que substituam a configuração TLS. Se precisar da CA do painel, salvar em arquivo privado e informar `SUPABASE_DB_CA_FILE`.
11. Definir `PUZOTO_DATABASE=postgres` e reiniciar. A inicialização verifica papel, colunas e RLS; não cria tabelas nem insere registros. `node scripts/verify-supabase-runtime.mjs` confirmou no projeto real as 23 tabelas, 5.386 registros e DDL negado. A conferência pública de `/api/health`, login, saldos e gravação será feita depois do deploy aprovado.
12. Se falhar antes de novas gravações na nuvem, voltar a `PUZOTO_DATABASE=sqlite`. Depois de novas gravações, reconciliar/exportar os dados novos antes de retornar ao snapshot antigo. Não apagar Info nem dados remotos.

## 5. Limitações operacionais

No PostgreSQL, Backup oferece exportação JSON consistente e indica que retenção/restauração devem ser verificadas no Supabase. Backup/restauração `.db`, importação JSON legada e limpeza de testes ficam restritos ao SQLite. Importação na nuvem pela interface ainda não está liberada. Planilhas novas são gravadas no bucket privado `puzoto-private`; anexos históricos precisam ser conferidos separadamente se existirem fora do banco.

Escritas usam lock transacional por acervo pessoal, inclusive entre processos. Leituras seguem concorrentes. Uma plataforma multiusuário exige particionar dados, lock e políticas por proprietário. As sessões são assinadas e revalidadas no Supabase, sem dependência de memória compartilhada. O Dashboard agrupa seus agregados em quatro comandos no mesmo snapshot para evitar a latência de dezenas de viagens pela conexão. Gastos, Contas a Pagar, Receitas e Cofre reúnem a carga inicial de cada tela em uma rota privada para pagar uma única validação Auth e conexão serverless. Qualquer alteração futura deve preservar a transação adequada e a paridade com SQLite/PGlite. O rate limit local ainda é por instância; para o uso de proprietário único, ele complementa os limites do Supabase Auth.

O projeto Supabase opera em São Paulo (`sa-east-1`). A função Express da Vercel usa `gru1`, também em São Paulo, para reduzir a distância de cada validação Auth e consulta PostgreSQL. Depois do PR #48, o header operacional `x-vercel-id` confirmou `gru1::gru1`, sem o salto anterior para Washington. A medição autenticada aquecida registrou abertura em 727 ms e navegações entre 206 e 357 ms; a primeira abertura após o deploy levou 4,4 s.

## 6. Celular e computador

Localhost funciona apenas neste computador. Para acesso remoto, frontend e `/api` estão publicados na mesma origem HTTPS da Vercel. A migração da Issue #5 e a sanitização da Issue #7 chegaram à `main` depois dos gates obrigatórios; as variáveis de Production e as URLs HTTPS do Auth estão configuradas. O smoke test público confirma o runtime PostgreSQL/Supabase e as barreiras de autenticação e origem. Resta ao proprietário validar a mesma conta no computador e celular.

A interface está preparada como PWA instalável: manifesto, ícones comuns, ícone maskable, tema e service worker armazenam somente imagens públicas estáveis, manifesto e uma página offline sem dados. O ícone Apple usa 180 px; Android e demais launchers recebem 192 e 512 px, com uma variante própria para recortes maskable. HTML de navegação, bundles JavaScript/CSS e toda rota `/api` ficam fora do cache para que um deploy não deixe referências a arquivos versionados removidos. Os entrypoints estáveis `/assets/index.js` e `/assets/index.css` usam `Cache-Control: no-store`; os chunks de página continuam versionados por hash. A instalação no celular é oferecida pelo navegador quando os critérios do dispositivo são atendidos. No iPhone, também é possível usar **Compartilhar → Adicionar à Tela de Início**. A validação final deve ser feita em `https://puzoto-life.vercel.app/` depois do login do proprietário.

O splash instalado no Android usa o `background_color` do manifesto e o ícone maskable, não o HTML da página. A cor externa dos dois agora é idêntica para a marca aparecer integrada, sem um quadrado visível. Uma instalação já existente pode conservar metadados do WebAPK; depois do deploy, remova o atalho/aplicativo anterior e instale novamente para validar imediatamente. As leituras da interface encerram em 15 segundos e as gravações em 20 segundos, mostrando erro e nova tentativa em vez de manter spinners indefinidamente.

Em 08/09/2026, `https://puzoto-life.vercel.app/` passou a servir o runtime Express da `main`: `/api/health` confirmou PostgreSQL e Supabase, `/api/auth/session` retornou uma sessão anônima válida, `/api/dashboard` negou acesso sem login com 401 e uma origem externa foi recusada com 403. O comando `npm run verify:production` repete essas verificações sem usar credenciais. Login real, gravação cruzada e exportação autenticada permanecem manuais porque a senha do proprietário não deve ser compartilhada.

Para encerrar a Issue #9: validar login/recuperação reais, persistência entre dispositivos, exportação autenticada e o procedimento de rollback. XSS/CSRF, payloads, rate limit e desempenho já têm gates automatizados; observabilidade externa sem dados pessoais e revisão jurídica humana continuam em tarefas próprias.

## Fontes técnicas

- [Supabase Auth](https://supabase.com/docs/reference/javascript/auth-getuser)
- [Conexões PostgreSQL](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Senhas](https://supabase.com/docs/guides/auth/passwords)
- [Transações no pg](https://node-postgres.com/features/transactions)
- [Pool de conexões](https://node-postgres.com/features/pooling)
