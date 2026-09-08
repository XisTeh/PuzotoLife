# Contexto obrigatório — Puzoto Life

Leia este arquivo antes de implementar qualquer mudança, independentemente do agente ou modelo.

## Produto e preservação

Aplicação pessoal de trabalho, laudos e finanças em JavaScript, Vite e Express. Preservar as regras existentes e todos os dados. O Casaê é referência visual, não outro produto a ser modificado. Adaptar sua navegação arredondada, espaçamento e hierarquia ao tema escuro do Puzoto Life.

O backup local `Info/`, criado antes da modernização, contém snapshot SQLite consistente, código, anexos e manifesto SHA-256. É privado e imutável. Não publicar dados, bancos, backups, planilhas, credenciais ou o Casaê no GitHub, artifacts de CI ou hospedagem estática. Antes de migrar, conferir contagens, integridade, relações e totais; testar restauração. Nunca rodar testes sobre o banco real.

## GitHub e entregas (instrução permanente do proprietário)

- Toda tarefa deve ter Issue com exatamente uma classificação principal: `Correção`, `Melhoria` ou `Nova função`.
- Criar a Issue antes de implementar quando o GitHub estiver acessível. Se não estiver, registrar o escopo em `docs/issues.json` e informar o bloqueio; não inventar números ou links.
- Trabalhar em branches `codex/*`, nunca implementar/mesclar diretamente em `main`.
- Usar Pull Requests para entregas e deploys. Descrição obrigatória: Issue relacionada (`Closes #N`), problema e mudança, validação com resultados reais, riscos, limitações e próximos passos.
- Nenhum código entra na principal sem CI aprovado, revisão do proprietário e resolução dos comentários. Este é um repositório de proprietário único: o GitHub não aceita autoaprovação formal, portanto a proteção da `main` usa zero aprovações obrigatórias e preserva `quality`, `security` e `e2e`, conversas resolvidas, bloqueio de push direto e aplicação aos administradores. A autorização explícita do proprietário registrada na conversa ou na Issue vale como revisão para o merge. Não contornar falhas nem baixar os checks para publicar.
- Deploy somente do commit revisado e validado, com ambiente protegido e rollback documentado. Não anunciar publicação, Issue, PR ou proteção como concluídos sem confirmação remota.

## Segurança e arquitetura

- Objetivo: Supabase Auth + PostgreSQL como fonte de verdade; frontend separado do backend. A integração Auth não significa migração do banco concluída.
- Enquanto o domínio operar em SQLite, manter o servidor no loopback e bloquear publicação. A troca exige portabilidade das consultas/transações, testes de paridade e migração validada.
- Autorização no servidor, negação por padrão, escopo de proprietário explícito. Nunca abrir o acervo pessoal a qualquer usuário cadastrado. Se virar multiusuário, modelar isolamento e RLS antes de habilitar cadastros gerais.
- `.env` (não `.inv`) só local/segredos da hospedagem. Variáveis `VITE_*` são públicas; jamais colocar senha do banco ou chave service role nelas. Não registrar tokens, corpos, nomes de pacientes ou dados financeiros.
- Aplicar rate limit, validação, controle de origem, headers de segurança e revisão de XSS/CSRF. A CSP nega scripts em atributos. A política central DOMPurify sanitiza `innerHTML`, `outerHTML` e `insertAdjacentHTML`; handlers legados são colocados em atributos de dados, compilados somente pela lista permitida e removidos do DOM. Nunca inserir HTML antes de `installSafeHtmlPolicy()`, desativar essa política ou criar outro sink sem ampliar o contrato e os testes de ataque.
- Evitar overengineering, bloqueio do event loop, consultas N+1 e abstrações prematuras. Reusar componentes existentes, componentizar por responsabilidade e aplicar DRY com critério.
- Observabilidade proporcional: logs estruturados com ID de correlação e duração, sem dados pessoais; Sentry/OpenTelemetry quando houver ambiente e retenção definidos. Não acumular Sentry, Datadog e New Relic sem necessidade.
- Logs de runtime passam por `server/observability/logger.js`, que aceita somente metadados operacionais permitidos. Não registrar mensagens brutas de exceção, URL concreta, query, corpo, cookie, token, nomes, arquivos ou valores; não criar writers paralelos com `console.error`/`console.warn`.

## Qualidade

- Executar `npm run quality` e E2E nas mudanças de fluxo. CI deve validar lint, arquitetura, testes, build, orçamento de performance e vulnerabilidades.
- Testes unitários para regras; integração para persistência/autorização/transações; Playwright para jornadas e mobile. Nunca confundir um teste mockado com validação do Supabase real.
- Avaliar Biome, Commitlint, Knip, Stryker, Codecov, arch-contract e Endtest pelo benefício concreto. Não instalar ferramentas redundantes só por constarem na lista.
- Termos e política de privacidade: minutas precisam de revisão e aprovação jurídica humana antes do lançamento. Agentes não podem declarar essa aprovação.

## Interface e motion

Aplicar Design Motion Principles de Kyle Zantos: https://github.com/kylezantos/design-motion-principles (o endereço original design-principles não estava disponível). Para produtividade: Emil Kowalski como referência principal, Jakub Krehel para acabamento. Feedback rápido, animações discretas de 120–220 ms, saída mais suave que entrada, sem pulsos decorativos. Respeitar `prefers-reduced-motion`, foco visível, teclado e alvos de toque de pelo menos 44 px.

Lazy loading por página, skeletons, estados vazios/erro/progresso, proteção contra clique duplo, feedback de sucesso/falha e transições consistentes. Revisar como designer de produto sênior em desktop e celular, corrigindo cortes, estouros, saltos, baixa legibilidade e controles sem ação. Não reconstruir componentes existentes desnecessariamente.

## Situação da modernização

Consultar `docs/ENTREGAS.md` e `docs/SUPABASE.md`. Diferenciar implementado localmente, validado e pendente de serviço externo. Manter estes documentos atualizados junto das entregas.

## Persistência assíncrona (Issue #5)

- Todos os serviços de domínio e chamadas SQL são assíncronos: aguardar a conclusão antes de responder HTTP. Não usar callbacks síncronos em transações.
- Usar `atomic` para operações que leem e gravam; a leitura que decide pagamento/resgate/fechamento deve ocorrer dentro da transação. `snapshot` agrupa leituras consistentes. Não iniciar gravação dentro de snapshot.
- PostgreSQL usa conexão dedicada por transação, papel `puzoto_runtime` sem DDL/bypass de RLS, TLS validado e lock transacional do acervo pessoal. Não usar usuário administrador no runtime. SQLite fica restrito ao modo local.
- Testes locais usam SQLite temporário e PGlite; CI também usa PostgreSQL com conexões independentes. `TEST_POSTGRES_URL` só pode apontar ao loopback. Nunca apontar testes à base Supabase pessoal.
- A branch `codex/supabase-postgres` depende de `codex/cloud-foundation-design`. Manter PRs encadeados enquanto a entrega anterior aguarda checks e merge; não contornar a proteção de main.
