# Entregas e estado real

## Fundação local — branch codex/cloud-foundation-design

Issue #1: backup Info consistente, integridade OK, 23 tabelas e 5.382 registros; 92 arquivos preservados com SHA-256. Backup manual aguarda a conclusão; exportação passa a incluir as tabelas que faltavam. Teste de restauração em banco temporário.

Issues #2 e #3: AGENTS.md, templates de Issue/PR, Biome, contratos de arquitetura, proteção de arquivos privados, testes Node, Playwright, auditoria de dependências e orçamento gzip. Não levar o histórico local com bancos e node_modules para o repositório público. O commit da entrega deve ter somente o histórico remoto sanitizado como ancestral.

Issue #4: backend de login Supabase e sessão HttpOnly, autorização pelo UUID de proprietário, recuperação, logout e rate limit implementados. O projeto real tem um usuário proprietário, cadastro público e acesso anônimo desativados, Site URL e redirect local exatos; URL, chave publishable e UUID estão somente no `.env` ignorado. A API local nega dados sem sessão. O Security Advisor registra zero erros e um aviso: prevenção de senhas vazadas não está disponível no plano Free. O login completo com a senha do proprietário ainda precisa de validação manual; integração de Auth não conclui a migração do banco.

Issue #5: schema PostgreSQL de 23 tabelas com RLS e acesso de clientes negado. Em 08/09/2026 foi criado um snapshot WAL consistente do banco corrente, com 5.386 registros, integridade OK e zero violações de chave estrangeira. As duas migrações foram aplicadas no Supabase real e a importação transacional confirmou paridade de todas as tabelas. O papel `puzoto_runtime` foi habilitado com senha exclusiva, sem DDL, superusuário ou bypass de RLS; uma conexão real confirmou as 23 tabelas, 5.386 registros e a negação de DDL. O `Info/` permaneceu intacto.

Issue #6: sidebar com bordas arredondadas, superfícies escuras, navegação móvel, foco/teclado, lazy loading por página, skeleton de navegação, feedback e reduced motion. Inicializadores das páginas passam a ser aguardados, removendo atrasos artificiais. Revisão visual usa dados sintéticos; não publicar screenshots com registros pessoais.

Issues #7 e #8: origem, proteção CSRF, cookies, limites, headers, logs estruturados sem URL/corpo e API de mesma origem. A validação bloqueia IDs inválidos, poluição de protótipo, parâmetros duplicados, payloads excessivamente complexos e tipos de conteúdo inesperados antes dos serviços. A CSP usa `script-src-attr 'none'`; ações legadas passam por uma lista permitida. A defesa central dos sinks HTML com DOMPurify e os testes de ataque sintéticos chegaram à produção pelo commit revisado `1f4f4e6`.

Issue #9: o runtime Express foi publicado na Vercel pelo commit revisado `1f4f4e6`, com PostgreSQL obrigatório, Supabase Auth, sessão assinada, TLS e planilhas no bucket privado. As nove variáveis estão somente no ambiente Production, sem a conexão administrativa; Site URL/redirect HTTPS estão configurados no Auth. O smoke test público confirmou frontend, health PostgreSQL, sessão anônima, bloqueio 401 dos dados, origem externa 403 e CSP. **Ainda falta a validação manual autenticada:** entrar com a conta do proprietário no computador e celular, gravar/ler o mesmo dado, exportar backup e confirmar o procedimento de rollback antes de fechar #9.

Issue #10: checklist para minutas, revisão e aprovação jurídica humana pendentes. Não há termos juridicamente aprovados.

## Critérios de conclusão

Uma Issue só pode ser fechada quando todos os seus critérios forem cumpridos. Usar `Refs #N` no PR para trabalho parcial e `Closes #N` apenas quando o merge concluir todo o escopo. Nunca fechar #4, #5, #7, #9 ou #10 só por arquivos preparatórios.

## Ferramentas e proporcionalidade

| Área | Adotado nesta etapa | Decisão para próximas etapas |
| --- | --- | --- |
| Qualidade | Biome e contratos de arquitetura locais | arch-contract não é necessário para os contratos simples atuais; ampliar regras conforme migração |
| Testes | Node unitários/integração, Playwright desktop/mobile, PGlite para schema | Cobertura e Codecov quando critérios por domínio estiverem definidos; Stryker nas regras financeiras críticas |
| Código não usado | Lazy loading e revisão de imports | Knip após normalizar os handlers globais; hoje geraria falsos positivos no legado |
| Commits | Mensagens convencionais nas entregas | Commitlint ao ampliar colaboração; não duplicar regras no pipeline sem benefício |
| E2E | Playwright versionado e reproduzível | Endtest seria redundante nesta etapa |
| Observabilidade | Correlation ID, status e duração sem dados privados | Sentry ou OpenTelemetry após definir destino/retencão; Datadog e New Relic seriam redundantes agora |
| Jurídico | Escopo de revisão documentado | Aprovação depende de profissional responsável, não de agente |

## Rollback

Enquanto a publicação não acontece, o SQLite local continua disponível, mas o snapshot migrado também está preservado no Supabase. Para reverter código, usar o PR/commit anterior. Antes de retornar ao SQLite depois de qualquer gravação em produção, exportar e reconciliar os registros novos. Nunca copiar arquivo SQLite em uso ignorando WAL. O Info não substitui uma cópia externa protegida contra falha do disco.

## Runtime PostgreSQL — branch codex/supabase-postgres

Refs #5; depende do PR #11. PR encadeado contra codex/cloud-foundation-design, sem mesclar diretamente em main.

- Serviços SQL e rotas aguardam persistência. Pool pg com TLS verificado, transação na mesma conexão, timeouts, escrita serializada por acervo e snapshots consistentes. SQLite temporário e modo local continuam suportados.
- Papel puzoto_runtime com DML e RLS, sem login habilitado automaticamente. Inicialização verifica estrutura/permissões e não migra dados remotos. Corrigida conversão BOOLEAN SQLite para número PostgreSQL; agrupamento de remessas explícito e determinístico.
- Backup local aguarda conclusão; restauração impede intercalar consultas. JSON é completo e consistente ou falha inteiro. Planilhas usam nomes únicos, I/O assíncrono e fechamento atômico. Operações de arquivo SQLite não são aplicadas ao PostgreSQL.
- Validação local: 44 testes Node aprovados; 6 jornadas Playwright por engine (SQLite/PostgreSQL), desktop/mobile. CI configurada com PostgreSQL 17 e conexões independentes; confirmação remota registrada no PR.
- Limitações: PGlite não comprova TLS nem conectividade PostgreSQL do Supabase. Nenhuma migração real executada. Backup/restauração remotos, importação JSON pela interface e armazenamento persistente de anexos seguem pendentes. O roundtrip de login real com senha, XSS/validação completa e jurídico continuam abertos.

A base pessoal continua SQLite no loopback. Info não foi alterado. Antes da migração final, criar novo snapshot consistente se houver lançamentos posteriores ao Info.

## Validação HTTP — branch codex/security-hardening

Refs #7; depende do PR PostgreSQL. A camada central limita profundidade, quantidade de nós, tamanho de textos e parâmetros de consulta sem alterar valores válidos. Chaves de poluição de protótipo, query duplicada, corpo que não seja objeto JSON, `Content-Type` incorreto, IDs fora do intervalo e nomes de backup que não possam ter sido gerados pelo sistema recebem 400/415 antes de acessar persistência. O identificador especial `dp_N` fica restrito ao fluxo de dívidas parceladas.

Os testes são executados em servidor isolado e não usam o banco pessoal. Esta etapa é defesa de borda; não substitui schemas por operação nem resolve os pontos XSS do frontend.

## CSP e ações do frontend — branch codex/csp-inline-handlers

Refs #7; depende da validação HTTP. A CSP passa a negar qualquer JavaScript de atributo. Para preservar os fluxos enquanto as páginas são componentizadas, um adaptador lê somente chamadas simples de uma lista fixa, remove o atributo antes da interação e instala `addEventListener`. Comandos adicionais, funções fora da lista, strings quebradas e atributos injetados são descartados. Argumentos dinâmicos de nomes, pagadores e arquivos recebem escape para contexto JavaScript/HTML; o nome exibido na tabela de dívidas também recebe escape HTML. O fallback do logo e os efeitos de hover deixam de usar eventos inline.

Validação: 53 testes Node, CSP com `script-src-attr 'none'`, ação legítima de atualização executada e ação `alert` injetada descartada. A navegação verifica todas as páginas, ausência de atributos remanescentes, ações bloqueadas e mensagens de violação CSP em desktop/celular. O adaptador é compatibilidade transitória; os atributos devem virar listeners declarativos conforme cada página for componentizada. A revisão completa de todos os textos interpolados continua pendente, portanto o bloqueio de produção permanece.

## Escape de saídas — branch codex/xss-output-escaping

Refs #7; depende do PR de CSP. Mensagens de sucesso/erro das páginas deixam de usar `innerHTML`: ícone e mensagem são nós separados e o texto nunca é interpretado como markup. Nomes de empresas, categorias, cartões, pagadores, origens e pessoas recebem escape antes de entrar em opções e listas financeiras. Descrições, observações, motivos, formas de pagamento e status das telas de gastos, receitas, contas e dívidas recebem escape em conteúdo e atributos. O contrato de arquitetura impede voltar a interpolar mensagens de toast com `innerHTML`.

Esta entrega cobre as superfícies mais expostas de feedback e finanças, com testes sintéticos contendo tags, aspas e atributos de evento. Os templates legados restantes passam pela política central descrita na entrega de sanitização abaixo.

## Origem local e recuperação — branch codex/local-origin-alias

Refs #7; depende do PR de escape de saídas. Em desenvolvimento, a API reconhece `localhost`, `127.0.0.1` e IPv6 loopback como aliases da mesma origem local, preservando a porta configurada do frontend. Isso corrige login e recuperação quando o Vite abre em `127.0.0.1:5174`. Em produção, somente a origem exata de `APP_ORIGIN` é aceita; aliases e origens do backend não são adicionados.

O e-mail de recuperação continua apontando para a origem canônica configurada em `APP_ORIGIN`, que deve também constar na lista de redirects do Supabase. Validação local: 9 testes de segurança aprovados, incluindo alias local, bloqueio de origem externa, regra exata de produção e redirect canônico. O roundtrip com a senha e o e-mail reais permanece uma validação manual do proprietário.

## Identidade visual, meses fechados e PWA — branch codex/visual-identity-pwa

Refs #6, #16 e #17; depende do PR de origem local. A paleta verde foi substituída por grafite, azul aço e índigo; coral fica restrito a alertas e estados negativos. A marca anterior do Puzoto Life foi preservada com o “P”, pessoa/folhas e seta, trocando apenas a seta verde por azul/índigo. Sidebar e login usam textura pontilhada, luz ambiente, indicador ativo e profundidade inspirados na linguagem do Casaê, sem copiar sua identidade. Entradas usam 220 ms com foco progressivo; ações frequentes permanecem rápidas e todas respeitam `prefers-reduced-motion`.

A lista de meses fechados virou uma lista responsiva de botões com rolagem estável, sem translação do item inteiro no hover. O último mês permanece dentro do card em desktop e celular. O sistema inclui manifesto, ícones próprios, metadados para iOS/Android, convite de instalação quando suportado e service worker que nunca intercepta nem armazena `/api`.

Validação local: revisão visual em desktop e 390 × 844; 12 jornadas Playwright aprovadas em desktop/iPhone 13, incluindo todos os fluxos existentes, sidebar móvel, reduced motion, lista cheia de meses e metadados PWA. `npm run quality` aprovado com 57 testes, build, arquitetura, Biome e orçamento gzip de 203 KB. A PWA torna a interface instalável, mas não transforma SQLite em serviço remoto.

A URL informada `https://puzoto-life.vercel.app/` retornou 404 em 04/09/2026. Publicação segue bloqueada pelas Issues #5, #7 e #9: o backend atual impede produção por segurança e o acervo ainda depende do SQLite local. Não publicar somente `dist`, pois login, persistência e sincronização entre dispositivos não funcionariam.

## Navegação, Cofre e alinhamento — branch codex/navigation-performance-fixes

Refs #6 e resolve #20, #21, #22, #23 e #24; depende do PR visual. Os módulos das páginas são aquecidos em segundo plano depois do primeiro conteúdo, e o foco ou ponteiro sobre a navegação antecipa somente o código estático da seção. Clicar na seção atual não inicia outra renderização. O skeleton aparece apenas quando a importação excede 100 ms, e as entradas deixam de usar atrasos escalonados de até 600 ms; nenhuma consulta ou dado pessoal é antecipado. Leituras independentes de Gastos, Lançamentos, Dr. Ranon e Pessoas/Dívidas são executadas em paralelo, preservando a ordem de gravações e transações.

O Cofre associa cada carregamento ao elemento raiz que o iniciou. Se o usuário sair antes da resposta, o resultado obsoleto é descartado e não atualiza outro DOM. As ações de Trabalho e Dr. Ranon / RX usam cartões flexíveis de mesma altura no desktop e fluxo empilhado no celular. A marca mantém o símbolo aprovado e passa a ter transparência real, integrada à superfície da sidebar sem quadrado preto. O resumo mensal de Gastos agora forma um painel único com cinco cartões, ícones, valores e hierarquia responsiva, em grafite, azul e dourado discreto.

Validação local: `npm run quality` aprovado com 57 testes, build, arquitetura, Biome, zero vulnerabilidades de produção em `npm audit --omit=dev` e orçamento gzip de 204 KB. O Playwright cobre a troca de tela durante uma resposta suspensa do Cofre, leituras paralelas, ausência de atrasos CSS, alinhamento desktop, alvos mobile, painel de Gastos e canal alfa da logo, além das jornadas existentes. São 20 testes aprovados em Desktop Chrome e iPhone 13.

## Governança de proprietário único — branch codex/single-owner-governance

Closes #26; depende do PR de navegação. O proprietário confirmou que o repositório terá somente a conta `XisTeh`. Como o GitHub não permite que o autor aprove o próprio PR, a exigência de uma segunda conta foi removida. A revisão passa a ser a autorização explícita do proprietário, registrada na conversa ou na Issue relacionada.

A proteção da `main` continua exigindo `quality`, `security` e `e2e`, conversas resolvidas, bloqueio de push direto e aplicação aos administradores. Somente a quantidade de aprovações formais muda de 1 para 0. Falhas de CI não podem ser ignoradas e o fluxo continua usando Issues, branches `codex/*` e PRs encadeados.

### Auditoria de prontidão em 07/09/2026

| Área | Evidência verificada | Estado |
| --- | --- | --- |
| Repositório | `origin/main` contém somente `README.md`; esta linha de trabalho está 11 commits à frente | Aguardando merge sequencial dos PRs empilhados |
| Proteção da `main` | `quality`, `security` e `e2e` obrigatórios, administração incluída, conversas resolvidas e zero aprovações formais para o proprietário único | Ajuste autorizado pelo proprietário na Issue #26 |
| PRs | #11, #12, #13, #14, #15, #18, #19 e #25 estão com checks verdes na auditoria; devem ser revalidados a cada mudança de base | Prontos para a sequência de merge condicionada aos checks |
| Vercel | produção aponta ao commit `5f641bc` da `main`; `https://puzoto-life.vercel.app/` continua respondendo 404 | Não há aplicação publicável na `main` |
| Backend | `server/index.js` bloqueia explicitamente `NODE_ENV=production`; não existe adaptador Vercel/`vercel.json` | Publicação intencionalmente bloqueada |
| Banco | PostgreSQL foi testado localmente com dados sintéticos; migrações e paridade ainda não foram executadas no Supabase pessoal | Issue #5 aberta |
| Sessão | sessões Auth ficam em `Map` na memória do processo | Incompatível com reinícios e múltiplas funções/réplicas |
| Arquivos | planilhas de laudos ainda são gravadas no disco local | Exige Supabase Storage privado ou volume persistente |
| Segurança | CSP e parte dos escapes estão validados; templates legados ainda têm saídas sem escape contextual completo | Issue #7 aberta |
| Dados privados | `.env`, `Info/`, Casaê, bancos, `data/` e `dist/` estão ignorados; nenhum apareceu entre os arquivos rastreados na auditoria | Proteção local confirmada |

Os PRs #29 e #28 foram validados e mesclados na ordem, sem push direto para `main`. A Vercel promoveu o commit `1f4f4e6` e as verificações públicas não autenticadas passaram. A Issue #9 permanece aberta apenas para o ensaio autenticado entre computador e celular, exportação de backup e confirmação prática do rollback. SMTP próprio e jurídico continuam pendências separadas.

## Migração real e runtime Vercel — branch codex/vercel-runtime

Refs #5 e #9. Esta etapa parte da `main` depois da fusão de todos os PRs anteriores.

- Snapshot atual criado por cópia segura do SQLite/WAL em `data/migration-source/`, ignorado pelo Git: integridade OK, zero violações de chave estrangeira, 23 tabelas e 5.386 registros. O `Info/` permaneceu privado e imutável.
- Migrações aplicadas no Supabase real e dados importados em uma única transação. A comparação tolera somente diferenças binárias de ponto flutuante de até `1e-9`; textos, IDs, datas e demais valores continuam exatos. Paridade confirmada em todas as tabelas.
- Conexões usam o pooler transacional e a CA oficial do Supabase, armazenada fora do repositório. A exigência de SSL foi ativada no banco. O papel de aplicação `puzoto_runtime` foi provisionado com senha aleatória local. Uma verificação remota confirmou 23 tabelas, 5.386 registros e tentativa de DDL negada.
- A sessão deixa de depender de `Map`: o backend assina os tokens Supabase em cookie `HttpOnly`, `SameSite=Strict` e `Secure` em produção, valida a revogação no Supabase a cada requisição e funciona entre instâncias. `SESSION_SECRET` nunca é exposto ao frontend.
- Planilhas de laudo passam ao bucket privado `puzoto-private` quando o runtime é PostgreSQL. A chave `sb_secret_` fica somente no backend. SQLite local e testes continuam usando diretórios temporários.
- O ponto de entrada Express para Vercel exige PostgreSQL, Auth Supabase e `APP_ORIGIN` HTTPS exata em produção. A função inclui apenas os assets públicos necessários; bancos, relatórios de migração, anexos e backups continuam fora do bundle.

Validação concluída antes do PR: `npm run quality` com 58 testes Node, build e orçamento gzip de 204 KB; 20 jornadas Playwright em desktop e iPhone 13; inicialização do entrypoint Vercel em modo produção; bucket privado e runtime PostgreSQL verificados no projeto real. A validação não incluiu senha do proprietário nem enviou e-mail de recuperação.

Resultado de produção: PR #28 mesclado somente depois de `quality`, `security`, `e2e` e Vercel verdes; `/api/health` retornou `storage: postgres` e `auth: supabase`; a sessão anônima respondeu sem autenticação; `/api/dashboard` respondeu 401; origem externa recebeu 403. As nove variáveis de produção permanecem como Secret na Vercel sem `SUPABASE_DB_URL`. A validação com senha, gravação cruzada e backup depende do proprietário; a aprovação jurídica da Issue #10 continua com seu próprio critério humano.

## Sanitização integral dos sinks HTML — branch codex/xss-sanitization

Closes #7; PR encadeado sobre `codex/vercel-runtime`.

- DOMPurify é instalado antes de qualquer renderização e sanitiza toda atribuição a `innerHTML`, `outerHTML` e `insertAdjacentHTML`, incluindo os templates legados de relatórios, cartões e configurações.
- Textos vindos do banco ou de arquivos recebem escape contextual antes da composição em relatórios, cartões, configurações, dashboard, históricos, laudos, fechamentos, diagnóstico, importação e backup. Cores persistidas só entram em estilos quando correspondem a hexadecimal de seis dígitos.
- Atributos `onclick`, `onchange`, `oninput`, `onsubmit`, `onkeydown` e `onkeyup` existentes são colocados em quarentena como dados antes da sanitização. O adaptador compila somente chamadas simples da lista permitida, remove o atributo transitório e instala um listener; ações desconhecidas ficam bloqueadas.
- Scripts, iframes, SVG ativo, atributos de evento, URLs `javascript:` e `formaction` ativo são removidos antes de alcançar o DOM. A CSP continua negando scripts em atributos como uma segunda camada.
- O contrato de arquitetura exige a instalação da política central e a cobertura dos três sinks. Testes sintéticos verificam que nenhum marcador de execução muda e que nenhum nó ou atributo ativo permanece.

Validação local: `npm run quality` aprovado com 58 testes Node, build e orçamento gzip de 215 KB; `npm audit --omit=dev --audit-level=high` com zero vulnerabilidades; 24 jornadas Playwright aprovadas em desktop e iPhone 13, incluindo payload direto nos sinks e texto ativo retornado pela API de relatório. O PR #29 passou por `quality`, `security`, `e2e` e Vercel, foi mesclado na base do PR #28 e chegou à `main` pelo commit revisado `1f4f4e6`. Os critérios técnicos da Issue #7 estão concluídos. Qualquer novo sink HTML exige sanitização e teste equivalente. A aprovação jurídica da Issue #10 continua sendo uma decisão humana separada.

## Validação pública — branch codex/production-validation

Refs #9. O comando `npm run verify:production` verifica a origem HTTPS sem credenciais: frontend e headers de segurança, saúde PostgreSQL/Supabase, sessão anônima, bloqueio 401 de dados privados e rejeição 403 de origem externa. Ele não imprime cookies, tokens, respostas pessoais nem valores de ambiente.

O primeiro ensaio público do commit `1f4f4e6` passou em todos esses pontos. A etapa manual que resta exige a senha do proprietário: entrar no computador e no celular, criar um registro temporário identificável, confirmar a leitura no outro dispositivo, removê-lo e gerar uma exportação autenticada.

Rollback de código: promover na Vercel o último deployment de produção estável e registrar o commit promovido. Rollback de dados: interromper escritas, exportar o estado remoto e reconciliar somente os registros posteriores ao snapshot validado; o SQLite e o `Info/` servem como referência privada, nunca devem ser restaurados diretamente sobre o PostgreSQL.

## Observabilidade sanitizada — branch codex/observability-production

Closes #8. O logger central aceita somente metadados operacionais permitidos. Todas as respostas recebem `X-Request-Id`, inclusive bloqueios antecipados; o evento HTTP registra método, padrão da rota, status e duração. Erros registram classe e código técnico, sem mensagem bruta, URL, query, corpo, cookie, token, usuário, nome de arquivo ou valor financeiro.

Operações de banco, backup, restauração, importação e limpeza usam eventos JSON sem nomes de arquivos ou registros. Testes sintéticos injetam e-mail, token e caminho pessoal em campos proibidos e confirmam que eles não chegam ao evento.

OpenTelemetry fica selecionado como opção futura de destino único. A ativação depende de uma nova Issue que defina operador, região, acesso, retenção, exclusão, amostragem e orçamento; adicionar Sentry, Datadog e New Relic ao mesmo tempo não é proporcional ao uso pessoal atual. O procedimento de diagnóstico e a decisão estão em `docs/OBSERVABILIDADE.md`.

## Pacote para revisão jurídica — branch codex/legal-review-pack

Refs #10. O inventário cobre conta, trabalho, identificadores de laudos, finanças, pessoas/dívidas, investimentos, auditoria, arquivos, backups e logs, além dos fluxos por Supabase, Vercel, GitHub e e-mail de autenticação. Os pontos que exigem decisão humana estão destacados: controlador, contexto profissional, dados sensíveis, bases legais, retenção, direitos, contratos, transferências, incidentes e aceite.

As minutas de Termos e Privacidade ficam marcadas como rascunho não aprovado e usam campos explícitos para as decisões do jurídico. Nenhum texto é exibido no produto e nenhum aceite fictício foi criado. A Issue #10 permanece aberta até receber versão, data, nome/qualificação do revisor e registro da aprovação.

## Navegação no Brave — branch codex/brave-navigation

Closes #33. A verificação de Fetch Metadata passa a distinguir navegação principal de documento e chamadas de API. Uma abertura `GET`/`HEAD` com `Sec-Fetch-Mode: navigate` e destino `document` pode carregar o frontend mesmo quando o navegador informa que o link veio de outro site. Mutações com origem externa, leituras cross-site por `cors` e requisições sem o cabeçalho interno continuam recebendo 403.

O smoke test de produção inclui a navegação cross-site que reproduzia o `Forbidden` do Brave. Testes de segurança também confirmam que a exceção não libera uma leitura cross-site da API.

## Responsividade integral e ciclo assíncrono — branch codex/mobile-layout-audit

Closes #35 e #36. A camada móvel passa a reorganizar todas as grades embutidas, formulários, filtros, cartões e modais entre 320 e 390 px, sem rolagem horizontal. Colunas com posicionamento explícito são liberadas no fluxo de uma coluna; resumos preservam duas colunas quando há espaço e o último cartão ímpar ocupa a linha. As abas de Histórico viram um controle segmentado com estado ativo visível. A tipografia usa a pilha nativa do dispositivo com suavização e tamanhos de formulário que evitam zoom involuntário.

O componente compartilhado `ResponsiveTables` deriva os rótulos dos cabeçalhos e os associa às células, permitindo que cada registro vire um cartão vertical no celular. Isso se aplica também a linhas adicionadas após o carregamento, sem implementar uma tabela móvel diferente em cada página.

Contas a Pagar associa categorias, resumo, gráfico, vencimentos, tabela e ações ao elemento raiz que iniciou a operação. Se a página for removida antes da resposta, a conclusão é ignorada; botões e mensagens também verificam o ciclo atual antes de tocar no DOM. O teste reproduz a resposta atrasada durante uma troca de tela e confirma ausência do erro `Cannot set properties of null`.

Validação local: `npm run quality` aprovado com 61 testes Node, arquitetura, Biome, build e orçamento de 217 KB gzip; `npm audit --omit=dev` sem vulnerabilidades; 27 jornadas Playwright aprovadas em desktop e celular. A varredura percorre as 20 páginas em 320, 360 e 390 px, verificando largura do documento, largura rolável do conteúdo, elementos fora da margem, colunas comprimidas e cabeçalho deslocado. Há cobertura específica para transformação de tabelas e navegação rápida em Contas a Pagar. A revisão visual foi feita em 390 × 844 com dados sintéticos; nenhuma imagem com dados pessoais foi gerada.

## Recuperação do cache PWA — branch codex/pwa-cache-recovery

Closes #38. Um celular exibiu apenas o fundo escuro porque o cache `puzoto-shell-v1` devolveu HTML de uma implantação anterior. Esse HTML apontava para os bundles `index-CF3yt2xF.js` e `index-CI3LXTob.css`, ambos ausentes na produção atual e confirmados com HTTP 404.

O service worker deixa de armazenar HTML e bundles versionados. Navegação busca a implantação ativa com `cache: no-store` e, sem rede, abre uma página offline estável que não contém dados. O novo cache mantém somente manifesto e imagens públicas; remove caches PWA legados na ativação e continua ignorando integralmente `/api`. O navegador busca `/sw.js` sem cache e solicita atualização. O servidor local envia `no-store`; a Vercel serve o arquivo estático com `max-age=0, must-revalidate`, que exige revalidação antes de reutilizar conforme a documentação oficial da plataforma.

A primeira publicação do worker novo não recuperou imediatamente um aparelho ainda preso ao HTML antigo: sem o JavaScript dessa página, ela não conseguia solicitar a atualização. As entradas principais passam a usar os caminhos estáveis `/assets/index.js` e `/assets/index.css`. Rewrites transitórios atendem os hashes de entrada observados nas implantações anteriores, inclusive o par reproduzido no aparelho, permitindo que o HTML legado carregue o código atual e conclua a troca do worker.

Uma segunda falha apareceu na validação do deploy seguinte: `max-age=0` ainda permitia revalidação condicional do entrypoint estável. Como a troca dos nomes de chunks não necessariamente altera o tamanho do bundle, o ETag fraco coincidiu e uma sessão persistente reutilizou JavaScript antigo; Gastos, Contas a Pagar e Receitas então pediram chunks removidos. Os entrypoints estáveis passam a usar `no-store`, têm conteúdo alterado para substituir a cópia já guardada e os três hashes observados recebem aliases temporários. O verificador público agora exige `no-store` nos dois entrypoints.

## Latência dos dados autenticados — branch codex/production-data-performance

Closes #42. A medição autenticada inicial em produção registrou 5,2 s para o Dashboard, 4,5 s para Gastos, 3,5 s para Contas a Pagar e cerca de 2,4 s para Receitas e Cofre. Cada rota privada primeiro criava uma sessão Supabase e depois consultava o usuário, duplicando trabalho remoto; o Dashboard ainda enviava dezenas de consultas sequenciais pela mesma conexão PostgreSQL.

A validação normal passa a chamar diretamente `auth.getUser(accessToken)`, que continua consultando o Supabase e sustentando autorização e revogação remotas. `setSession` fica restrito às operações que precisam anexar a sessão e ao refresh de JWT comprovadamente expirado. Os agregados do Dashboard são executados em quatro comandos dentro do mesmo snapshot: totais, parcelas ativas, alertas e gráficos. Gastos, Contas a Pagar e Receitas iniciam juntas as leituras que não dependem entre si.

Antes do deploy, a implementação atual foi comparada à anterior em quatro competências de um SQLite temporário: totais, gráficos e alertas permaneceram idênticos. Testes locais usam somente SQLite temporário e PGlite; a melhora final precisa ser medida novamente no runtime publicado depois dos checks e do merge.
