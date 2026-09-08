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
