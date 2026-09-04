# Supabase e publicação — passo a passo

Projeto confirmado: **PuzotoLife**, região São Paulo. Painel: https://supabase.com/dashboard/project/pbumqabetyzvuathyspn

## O que já existe e o que falta

O código de login está implementado. O banco usado pelas regras financeiras ainda é SQLite. A estrutura PostgreSQL e a ferramenta de migração foram preparadas e testadas localmente; elas não ligam os serviços antigos ao PostgreSQL. A Issue #5 acompanha essa conversão. Não publicar o sistema como se a migração estivesse pronta.

## 1. Crie seu acesso

1. No painel, abra **Authentication → Users → Add user → Create new user**.
2. Informe seu e-mail e uma senha exclusiva. Faça você mesmo a entrada e confirmação da senha. Não mande a senha no chat.
3. Copie o UUID exibido para o novo usuário. Esse é o identificador de proprietário; outro usuário autenticado não poderá abrir seus dados.
4. Em **Authentication → Sign In / Providers**, mantenha cadastro público desabilitado para este sistema pessoal. Não habilite acesso anônimo.

## 2. Configure o arquivo privado

1. Copie `.env.example` para `.env` na raiz do projeto.
2. Preencha `SUPABASE_URL=https://pbumqabetyzvuathyspn.supabase.co`.
3. Em **Project Settings → API Keys**, copie a chave **publishable** para `SUPABASE_PUBLISHABLE_KEY`. Não precisa de `service_role` nem `secret key` para login.
4. Coloque o UUID de seu usuário em `SUPABASE_OWNER_ID`.
5. Para desenvolvimento use `APP_ORIGIN=http://localhost:5174`, `HOST=127.0.0.1` e `PORT=3210`.
6. Reinicie o backend (`npm run server`). Abra `http://localhost:5174` com `npm run dev` também em execução. Entre com seu e-mail e senha.

O nome correto é `.env`. O `.gitignore` também protege `.inv` contra o erro de digitação. A chave publishable é pública por natureza, mas senha de banco e chaves secretas nunca podem ir para `VITE_*`, código, print, Issue ou PR. Cookies de sessão são HttpOnly, SameSite Strict e Secure em produção; tokens ficam na memória do backend. Reiniciar o processo exige entrar novamente. Não usar múltiplas réplicas sem um armazenamento compartilhado de sessões e rate limit.

## 3. Recuperação de senha

Em **Authentication → URL Configuration**, configure a URL do ambiente e autorize exatamente o endereço usado no desenvolvimento; depois substitua/adapte para o domínio HTTPS final. Não use curingas amplos. A opção “Esqueci minha senha” usa o serviço de e-mail do Supabase; produção exige configurar e testar SMTP próprio. O link retorna ao aplicativo, estabelece sessão restrita de recuperação e só permite liberar dados após entrar novamente.

## 4. Migração dos dados — executar após a Issue #5

O backup `Info/puzoto_life-consistente.db` é um retrato do início da modernização. Se você continuar lançando informações durante o trabalho, ele ficará desatualizado para a migração final. Faça um novo snapshot consistente numa pasta privada em `data/`, mantenha o Info intacto e indique esse novo caminho em `MIGRATION_SOURCE`.

1. Finalizar o adaptador PostgreSQL e testar paridade de todos os serviços, transações, relatórios e arquivos.
2. Abrir `supabase/migrations/202609040001_legacy_structure.sql`. Ele só tem estrutura, sem seus registros. Revisar/aplicar em um projeto de teste primeiro. Schema `puzoto` privado, RLS ativada e acesso de `anon`/`authenticated` negado por padrão; não expor o schema pela Data API para “fazer funcionar”.
3. Configurar um papel dedicado de menor privilégio para o runtime. Não colocar senha de `postgres` ou `service_role` no frontend. As permissões finais do runtime fazem parte da Issue #5 e não estão concedidas por este script.
4. No botão **Connect**, obter a conexão **Session pooler** quando necessário para IPv4. A senha do banco deve ser inserida só no `.env` privado, em `SUPABASE_DB_URL`, com caracteres especiais codificados na URL. Não colar a conexão no chat. Manter validação de certificado TLS.
5. Rodar `node scripts/migrate-supabase.mjs`: valida o snapshot local sem conectar nem escrever no Supabase.
6. Parar lançamentos no sistema local para a janela de migração. Gerar e validar um snapshot final.
7. Somente após conferir projeto, schema e snapshot final, rodar `node scripts/migrate-supabase.mjs --apply`. O comando exige tabelas de destino vazias, usa transação, compara todos os valores e confere as relações antes de confirmar. Não substitui uma base preenchida. Relatório privado em `data/migration-reports/`.
8. Conferir também arquivos/planilhas em armazenamento privado, saldos e relatórios por competência. A migração relacional não envia anexos automaticamente.
9. Trocar o runtime apenas após os testes no Supabase real. Se houver falha, manter a versão local e o banco original; não apagar Info nem apagar dados remotos sem avaliar o que já foi gravado.

## 5. Lançamento em celular e computador

O endereço localhost funciona somente neste computador. Para acesso remoto, terminar #5 e #7, escolher hospedagem Node + HTTPS compatível com o backend, configurar segredos no provedor e publicar o commit aprovado em PR. O frontend deve chamar `/api` na mesma origem. Ainda não há URL pública funcional nesta entrega.

Antes do lançamento: testar login e recuperação reais, persistência entre dispositivos, negação de outro usuário, exportação/restauração, XSS/CSRF, rate limit, desempenho, observabilidade sem dados pessoais e revisão jurídica. O servidor contém um bloqueio explícito de produção enquanto esses pré-requisitos estão em aberto; não remover o bloqueio isoladamente.

## Fontes técnicas

- https://supabase.com/docs/reference/javascript/auth-getuser
- https://supabase.com/docs/guides/database/connecting-to-postgres
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/auth/passwords
