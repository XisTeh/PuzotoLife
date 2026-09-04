/**
 * Utilitários de formatação — Padrão Brasileiro
 */

/**
 * Formata valor monetário no padrão BR: R$ 1.234,56
 */
export function formatarMoedaBR(valor) {
  if (valor == null || isNaN(valor)) return 'R$ 0,00';
  return valor.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * Formata data no padrão BR: DD/MM/AAAA
 * Aceita string ISO (YYYY-MM-DD) ou objeto Date
 */
export function formatarDataBR(data) {
  if (!data) return '';
  
  if (typeof data === 'string') {
    // Se formato ISO (YYYY-MM-DD), converter sem timezone
    const parts = data.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    data = new Date(data);
  }

  if (data instanceof Date) {
    const dia = String(data.getDate()).padStart(2, '0');
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const ano = data.getFullYear();
    return `${dia}/${mes}/${ano}`;
  }

  return String(data);
}

/**
 * Formata data e hora no padrão BR: DD/MM/AAAA HH:mm:ss
 */
export function formatarDataHoraBR(dataHora) {
  if (!dataHora) return '';

  const d = typeof dataHora === 'string' ? new Date(dataHora) : dataHora;
  
  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const ano = d.getFullYear();
  const horas = String(d.getHours()).padStart(2, '0');
  const minutos = String(d.getMinutes()).padStart(2, '0');
  const segundos = String(d.getSeconds()).padStart(2, '0');

  return `${dia}/${mes}/${ano} ${horas}:${minutos}:${segundos}`;
}

/**
 * Retorna a data atual no formato ISO (YYYY-MM-DD)
 */
export function dataAtualISO() {
  const now = new Date();
  const ano = now.getFullYear();
  const mes = String(now.getMonth() + 1).padStart(2, '0');
  const dia = String(now.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

/**
 * Retorna o horário atual no formato HH:mm:ss
 */
export function horarioAtual() {
  const now = new Date();
  const horas = String(now.getHours()).padStart(2, '0');
  const minutos = String(now.getMinutes()).padStart(2, '0');
  const segundos = String(now.getSeconds()).padStart(2, '0');
  return `${horas}:${minutos}:${segundos}`;
}

/**
 * Retorna o mês atual no formato YYYY-MM
 */
export function mesAtualReferencia() {
  const now = new Date();
  const ano = now.getFullYear();
  const mes = String(now.getMonth() + 1).padStart(2, '0');
  return `${ano}-${mes}`;
}

/**
 * Calcula total = quantidade × valor_unitario
 */
export function calcularTotal(quantidade, valor_unitario) {
  return Math.round(quantidade * valor_unitario * 100) / 100;
}

/**
 * Limpa registro de paciente mantendo apenas números
 */
export function limparRegistroPaciente(registro) {
  if (!registro) return '';
  return String(registro).replace(/\D/g, '');
}

/**
 * Formata referência mensal (YYYY-MM → Mês/Ano)
 */
export function formatarReferenciaMensal(referencia) {
  if (!referencia) return '';
  const meses = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];
  const [ano, mes] = referencia.split('-');
  const idx = parseInt(mes, 10) - 1;
  return `${meses[idx]} ${ano}`;
}
