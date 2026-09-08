# Observabilidade sem dados pessoais

## Estado atual

O backend produz eventos JSON de baixa cardinalidade nos logs da Vercel. Toda resposta recebe `X-Request-Id`, inclusive quando a origem ou o cabeçalho de proteção são recusados. Ao terminar, a requisição registra somente horário, nível, evento, ID de correlação, método, padrão da rota quando disponível, status e duração.

Erros registram apenas classe e código técnico sanitizados. Corpos, parâmetros de consulta, URL concreta, mensagem da exceção, cookies, tokens, UUID do usuário, nomes, arquivos e valores financeiros não pertencem ao contrato e são descartados pelo logger central. O ID de correlação permite encontrar o evento HTTP e o erro correspondente sem expor o conteúdo da operação.

Eventos operacionais de backup, restauração, importação e limpeza não incluem nomes de arquivos ou registros. Contagens agregadas podem ser registradas quando ajudam a diagnosticar uma importação.

## Diagnóstico

1. Reproduza a ação e anote o `X-Request-Id` exibido na resposta de rede.
2. Procure esse ID nos logs do deployment da Vercel.
3. Compare `status`, `durationMs`, `errorType` e `errorCode` com o horário do incidente.
4. Use o banco e o Supabase apenas por canais administrativos protegidos para investigar o dado; não amplie o conteúdo do log.

## Destino e retenção

Não há SDK externo habilitado. Para este sistema pessoal, enviar os mesmos eventos simultaneamente a Sentry, Datadog e New Relic aumentaria custo, superfície de acesso e duplicação sem benefício atual.

Se volume, equipe ou necessidade de alertas justificarem um destino dedicado, a escolha preferida é OpenTelemetry com um único coletor. Antes de ativar, registrar em nova Issue: operador do coletor, região, pessoas com acesso, retenção, exclusão, amostragem, orçamento e teste de que atributos privados continuam ausentes. A integração deve reutilizar os eventos permitidos pelo logger central.

## Validação

Os testes verificam que campos não permitidos são descartados, mensagens de exceção e caminhos concretos não aparecem no evento, e respostas negadas ainda recebem um ID de correlação. A busca por `console.error` e `console.warn` no backend deve apontar apenas para o writer central.
