/**
 * Utilitários de Data — Fuso Horário de Brasília (BRT = UTC-3)
 * 
 * PROBLEMA: new Date().toISOString() retorna UTC.
 * Às 22:21 em Brasília (UTC-3) = 01:21 UTC do dia SEGUINTE.
 * Isso faz o fechamento de 31/05 às 22:21 ser registrado como 01/06.
 * 
 * SOLUÇÃO: sempre usar o horário local do sistema (que está configurado
 * para Brasília) via toLocaleDateString com locale 'en-CA' (formato YYYY-MM-DD).
 */

/**
 * Retorna a data local atual no formato YYYY-MM-DD (sem UTC).
 * Equivalente correto de: new Date().toISOString().split('T')[0]
 */
export function dataHojeLocal() {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  const dia = String(agora.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

/**
 * Retorna uma data futura somando N dias à data local atual, no formato YYYY-MM-DD.
 * Substitui: new Date(x); x.setDate(x.getDate() + N); x.toISOString().split('T')[0]
 */
export function dataFuturaLocal(diasAFrente = 0) {
  const agora = new Date();
  agora.setDate(agora.getDate() + diasAFrente);
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  const dia = String(agora.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}
