# Pacote para revisão jurídica — não aprovado para publicação

Este documento organiza a Issue #10. Ele descreve o comportamento técnico observado em 08/09/2026 e não substitui parecer jurídico. As minutas vinculadas não devem aparecer na interface até que um profissional identifique o controlador, decida as bases legais e os prazos, ajuste o texto e registre a aprovação.

## Escopo observado

O Puzoto Life é uma aplicação pessoal de trabalho e finanças com uma única conta proprietária. O cadastro público está desativado. O backend autoriza o acervo pelo UUID dessa conta e armazena dados no PostgreSQL e no Storage privado do Supabase; a Vercel executa o frontend e o backend.

Embora o uso seja pessoal, o acervo pode conter dados de terceiros. O jurídico deve confirmar se o responsável atua somente para si ou no contexto de prestação de serviços, quais deveres profissionais se aplicam e quem ocupa os papéis de controlador, operador e encarregado.

## Inventário técnico

| Categoria | Exemplos observados no schema | Origem e uso | Local atual |
| --- | --- | --- | --- |
| Conta | e-mail, UUID, hash de senha, sessão e recuperação | autenticar e limitar o acesso ao proprietário | Supabase Auth; cookie de sessão `HttpOnly` no dispositivo |
| Trabalho | empresa, pagador, e-mail de pagador, datas, quantidades, status, valores e observações | registrar produção, recebimentos e relatórios | Supabase PostgreSQL |
| Laudos | número de registro do paciente, data, quantidade, valores e observações | organizar laudos e gerar planilha | Supabase PostgreSQL e arquivos XLSX no Storage privado |
| Finanças | descrições, categorias, valores, formas de pagamento, contas, cartões, limites e vencimentos | controle de gastos, contas, receitas e faturas | Supabase PostgreSQL |
| Pessoas e dívidas | nome da pessoa, valores, parcelas, datas, status e observações | acompanhar valores a receber ou pagar | Supabase PostgreSQL |
| Investimentos | nome, instituição, titular da conta, movimentos, saldos e observações | controle patrimonial pessoal | Supabase PostgreSQL |
| Auditoria e configurações | estado anterior/posterior, preferências, chave PIX e datas | rastreabilidade e funcionamento | Supabase PostgreSQL |
| Operação | ID aleatório de requisição, método, padrão de rota, status, duração, classe/código de erro | diagnóstico técnico | logs temporários da Vercel |
| Cópias privadas | exportações JSON/CSV/XLSX, snapshot de migração e backup `Info/` | portabilidade, restauração e preservação | dispositivo do proprietário; nunca GitHub ou bundle público |

O campo `registro_paciente` e quaisquer observações associadas merecem análise específica. O jurídico deve decidir se permitem identificar uma pessoa e se revelam ou se relacionam a informação de saúde, além de verificar sigilo profissional, necessidade, minimização e controles adicionais.

## Fluxos e prestadores

- **Supabase:** autenticação, PostgreSQL e Storage privado. O projeto está na região São Paulo, mas contratos, subprocessadores, suporte e eventual transferência internacional precisam ser conferidos no DPA e na lista vigente do fornecedor.
- **Vercel:** hospedagem, funções e logs operacionais. A aplicação remove dados pessoais dos eventos próprios, mas a plataforma também registra metadados técnicos da requisição. A retenção depende do plano e precisa ser confirmada antes da aprovação.
- **GitHub:** código, Issues, PRs e CI. O desenho proíbe bancos, backups, planilhas, credenciais e dados pessoais no repositório e nos artifacts.
- **E-mail de autenticação:** recuperação é enviada pelo serviço configurado no Supabase. Definir provedor SMTP, remetente, retenção e contrato antes de tratar o fluxo como definitivo.

Referências que o revisor deve conferir na data da aprovação: [Supabase DPA](https://supabase.com/downloads/docs/Supabase%2BDPA%2B231211.pdf), [Supabase Auth por senha](https://supabase.com/docs/guides/auth/passwords), [Vercel DPA](https://vercel.com/legal/Vercel_Inc_-_Data_Processing_Addendum.pdf), [subprocessadores da Vercel](https://vercel.com/legal/sub-processors) e [retenção de logs da Vercel](https://vercel.com/docs/logs/runtime).

## Retenção e descarte

O sistema ainda não executa retenção automática. Registros permanecem até exclusão pelo proprietário; exportações e backups permanecem onde ele os guardar. A interface permite excluir parte dos registros e exportar o acervo, mas não oferece uma jornada completa de solicitação de titular, anonimização, expurgo de backups ou encerramento da conta.

O jurídico e o responsável devem preencher esta matriz antes da aprovação:

| Conjunto | Prazo ou critério | Justificativa/base | Exclusão de cópias | Responsável |
| --- | --- | --- | --- | --- |
| Conta e autenticação | `[DEFINIR]` | `[DEFINIR]` | `[DEFINIR]` | `[DEFINIR]` |
| Trabalho e finanças | `[DEFINIR]` | `[DEFINIR]` | `[DEFINIR]` | `[DEFINIR]` |
| Registros de laudos | `[DEFINIR]` | `[DEFINIR]` | `[DEFINIR]` | `[DEFINIR]` |
| Auditoria | `[DEFINIR]` | `[DEFINIR]` | `[DEFINIR]` | `[DEFINIR]` |
| Planilhas e exportações | `[DEFINIR]` | `[DEFINIR]` | `[DEFINIR]` | `[DEFINIR]` |
| Logs operacionais | `[CONFIRMAR PLANO VERCEL]` | diagnóstico e segurança | expiração do provedor | `[DEFINIR]` |

## Medidas técnicas existentes

- HTTPS, TLS validado para PostgreSQL e segredos somente no backend/provedor.
- Conta única, cookie `HttpOnly`, `Secure` em produção e revalidação no Supabase.
- Papel PostgreSQL restrito, RLS com negação ao acesso público e Storage privado.
- Rate limit, origem exata, proteção contra mutações externas, limites de payload, CSP, DOMPurify e headers de segurança.
- Logs com campos permitidos, sem corpo, query, URL concreta, token, usuário, nome ou valor.
- CI obrigatório, testes sintéticos, auditoria de dependências, backup privado e rollback documentado.

Essas medidas não equivalem a certificação, anonimização, criptografia ponta a ponta, SLA ou conformidade jurídica completa.

## Decisões obrigatórias do revisor

1. Identidade, documento, endereço e contato do controlador; necessidade de encarregado/canal de titulares.
2. Contexto real do tratamento, categorias de titulares e existência de dados pessoais sensíveis.
3. Finalidades, necessidade e base legal para cada categoria; deveres profissionais e contratuais.
4. Prazos de retenção, bloqueio, exclusão, cópias, restauração e descarte seguro.
5. Procedimento para acesso, correção, portabilidade, oposição, revogação e eliminação quando aplicável.
6. Papéis e contratos com Supabase, Vercel e SMTP; subprocessadores e transferências internacionais.
7. Processo de incidente, comunicação, suporte, indisponibilidade e continuidade.
8. Texto final, forma e momento do aceite, prova de versão e tratamento de mudanças.
9. Lei aplicável, foro, limitações de responsabilidade e regras de uso profissional.

## Registro de aprovação

| Campo | Valor |
| --- | --- |
| Versão revisada | `[PENDENTE]` |
| Data | `[PENDENTE]` |
| Nome e qualificação do revisor | `[PENDENTE]` |
| Documento/parecer de referência | `[PENDENTE]` |
| Minuta de Termos aprovada | `[PENDENTE]` |
| Minuta de Privacidade aprovada | `[PENDENTE]` |
| Restrições e próximos passos | `[PENDENTE]` |

Enquanto qualquer campo permanecer pendente, não criar checkbox de aceite, não exibir as minutas como políticas vigentes e não afirmar aprovação jurídica.
