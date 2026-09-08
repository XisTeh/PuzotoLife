# Entregas e estado real

## Fundação local — branch codex/cloud-foundation-design

Issue #1: backup Info consistente, integridade OK, 23 tabelas e 5.382 registros; 92 arquivos preservados com SHA-256. Backup manual aguarda a conclusão; exportação passa a incluir as tabelas que faltavam. Teste de restauração em banco temporário.

Issues #2 e #3: AGENTS.md, templates de Issue/PR, Biome, contratos de arquitetura, proteção de arquivos privados, testes Node, Playwright, auditoria de dependências e orçamento gzip. Não levar o histórico local com bancos e node_modules para o repositório público. O commit da entrega deve ter somente o histórico remoto sanitizado como ancestral.

Issue #4: backend de login Supabase e sessão HttpOnly, autorização pelo UUID de proprietário, recuperação, logout e rate limit implementados. O projeto real tem um usuário proprietário, cadastro público e acesso anônimo desativados, Site URL e redirect local exatos; URL, chave publishable e UUID estão somente no `.env` ignorado. A API local nega dados sem sessão. O Security Advisor registra zero erros e um aviso: prevenção de senhas vazadas não está disponível no plano Free. O login completo com a senha do proprietário ainda precisa de validação manual; integração de Auth não conclui a migração do banco.

Issue #5: schema PostgreSQL de 23 tabelas com RLS e acesso de clientes negado, testado em PostgreSQL local via PGlite. Importador transacional com paridade de valores e pré-validação do snapshot. O port dos serviços e papel de runtime estão na entrega seguinte. **Ainda falta revisão e migrar/validar no Supabase real.** Não manter SQLite como fonte de verdade após o lançamento.

Issue #6: sidebar com bordas arredondadas, superfícies escuras, navegação móvel, foco/teclado, lazy loading por página, skeleton de navegação, feedback e reduced motion. Inicializadores das páginas passam a ser aguardados, removendo atrasos artificiais. Revisão visual usa dados sintéticos; não publicar screenshots com registros pessoais.

Issues #7 e #8: origem, proteção CSRF, cookies, limites, headers, logs estruturados sem URL/corpo e API de mesma origem. A branch `codex/security-hardening` bloqueia IDs inválidos, poluição de protótipo, parâmetros duplicados, payloads excessivamente complexos e tipos de conteúdo inesperados antes dos serviços. A branch empilhada `codex/csp-inline-handlers` usa `script-src-attr 'none'` e converte as ações legadas por uma lista permitida restrita. **Ainda falta validar os campos de cada operação e concluir o escape contextual de todo HTML interpolado.** Não anunciar XSS como integralmente resolvido. Produção e bind externo continuam bloqueados até a revisão e a migração.

Issue #9: deploy não realizado. Definir hospedagem compatível e ambiente protegido após concluir migração, segurança e revisão. Este projeto não é um site estático; hospedar apenas dist não oferece persistência nem login funcional.

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

Enquanto a publicação não acontece, continuar usando o SQLite local. Para reverter código, usar o PR/commit anterior e preservar o banco. Para restaurar dados, parar todos os processos e usar snapshot validado; nunca copiar arquivo SQLite em uso ignorando WAL. O Info não substitui uma cópia externa protegida contra falha do disco.

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

Esta entrega cobre as superfícies mais expostas de feedback e finanças, com testes sintéticos contendo tags, aspas e atributos de evento. Relatórios e partes extensas de cartões/configurações ainda possuem templates legados que precisam de revisão campo a campo; a Issue #7 e o bloqueio de produção permanecem abertos.

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

### Auditoria de prontidão em 07/09/2026

| Área | Evidência verificada | Estado |
| --- | --- | --- |
| Repositório | `origin/main` contém somente `README.md`; esta linha de trabalho está 11 commits à frente | Bloqueado por revisão/merge dos PRs empilhados |
| Proteção da `main` | `quality`, `security` e `e2e` obrigatórios, administração incluída e 1 aprovação exigida | Configurada corretamente |
| PRs | #12, #13, #14, #15, #18 e #19 estão limpos e com checks verdes; #11 tem checks verdes, mas está bloqueado pela aprovação obrigatória | Precisa de revisor diferente do autor |
| Vercel | produção aponta ao commit `5f641bc` da `main`; `https://puzoto-life.vercel.app/` continua respondendo 404 | Não há aplicação publicável na `main` |
| Backend | `server/index.js` bloqueia explicitamente `NODE_ENV=production`; não existe adaptador Vercel/`vercel.json` | Publicação intencionalmente bloqueada |
| Banco | PostgreSQL foi testado localmente com dados sintéticos; migrações e paridade ainda não foram executadas no Supabase pessoal | Issue #5 aberta |
| Sessão | sessões Auth ficam em `Map` na memória do processo | Incompatível com reinícios e múltiplas funções/réplicas |
| Arquivos | planilhas de laudos ainda são gravadas no disco local | Exige Supabase Storage privado ou volume persistente |
| Segurança | CSP e parte dos escapes estão validados; templates legados ainda têm saídas sem escape contextual completo | Issue #7 aberta |
| Dados privados | `.env`, `Info/`, Casaê, bancos, `data/` e `dist/` estão ignorados; nenhum apareceu entre os arquivos rastreados na auditoria | Proteção local confirmada |

Não promover o preview nem empurrar código diretamente para `main`. Para produção na Vercel, primeiro concluir #5 e #7, substituir a sessão em memória, mover planilhas para armazenamento privado e criar a entrega de runtime da Issue #9. Depois, configurar no Supabase as URLs HTTPS finais, SMTP de recuperação e segredos do ambiente protegido; validar login, leitura e gravação entre celular e computador antes da promoção.
