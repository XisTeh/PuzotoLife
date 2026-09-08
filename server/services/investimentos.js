import { snapshot, atomic } from '../database/connection.js';
import { getDatabase } from '../database/connection.js';
import { registrarAuditoria } from './auditoria.js';
import { dataHojeLocal } from '../utils/dataLocal.js';

const TIPOS_MOVIMENTO = new Set(['aporte', 'resgate', 'rendimento']);

function arredondarMoeda(valor) {
  return Math.round((Number(valor) + Number.EPSILON) * 100) / 100;
}

function validarTexto(valor, campo) {
  const texto = String(valor || '').trim();
  if (!texto) throw new Error(`${campo} é obrigatório.`);
  return texto;
}

function validarData(data) {
  const texto = String(data || '').trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (!match) throw new Error('Data inválida. Use o formato YYYY-MM-DD.');

  const ano = Number(match[1]);
  const mes = Number(match[2]);
  const dia = Number(match[3]);
  const teste = new Date(ano, mes - 1, dia);
  if (teste.getFullYear() !== ano || teste.getMonth() !== mes - 1 || teste.getDate() !== dia) {
    throw new Error('Data inválida.');
  }
  if (texto > dataHojeLocal()) throw new Error('Não é permitido registrar movimento com data futura.');
  return texto;
}

function validarValorPositivo(valor, campo = 'Valor') {
  const numero = arredondarMoeda(valor);
  if (!Number.isFinite(numero) || numero <= 0) throw new Error(`${campo} deve ser maior que zero.`);
  return numero;
}

async function buscarInvestimento(db, id) {
  const investimento = (await db.prepare('SELECT * FROM investimentos WHERE id = ?').get(Number(id)));
  if (!investimento) throw new Error('Investimento não encontrado.');
  return investimento;
}

function expressaoSaldo(alias = '') {
  const prefixo = alias ? `${alias}.` : '';
  return `CASE ${prefixo}tipo
    WHEN 'aporte' THEN ${prefixo}valor
    WHEN 'rendimento' THEN ${prefixo}valor
    WHEN 'resgate' THEN -${prefixo}valor
    WHEN 'ajuste' THEN ${prefixo}valor
    ELSE 0 END`;
}

async function calcularSaldo(db, investimentoId, ateData = null) {
  let sql = `SELECT COALESCE(SUM(${expressaoSaldo()}), 0) AS saldo
    FROM investimento_movimentos WHERE investimento_id = ?`;
  const params = [Number(investimentoId)];
  if (ateData) {
    sql += ' AND data <= ?';
    params.push(ateData);
  }
  return arredondarMoeda((await db.prepare(sql).get(...params)).saldo);
}

async function validarHistoricoNaoNegativo(db, investimentoId) {
  const movimentos = (await db.prepare(`
    SELECT tipo, valor FROM investimento_movimentos
    WHERE investimento_id = ? ORDER BY data ASC, id ASC
  `).all(Number(investimentoId)));
  let saldo = 0;
  for (const movimento of movimentos) {
    saldo = arredondarMoeda(saldo + (movimento.tipo === 'resgate' ? -movimento.valor : movimento.valor));
    if (saldo < 0) throw new Error('O movimento deixaria o saldo investido negativo na data informada.');
  }
}

export async function listarInvestimentos(incluirInativos = true) {
  return snapshot(async () => {
  const db = getDatabase();
  const filtro = incluirInativos ? '' : ' WHERE i.ativo = 1';
  return (await db.prepare(`
    SELECT i.*,
      COALESCE(SUM(${expressaoSaldo('m')}), 0) AS saldo_atual,
      COUNT(m.id) AS quantidade_movimentos
    FROM investimentos i
    LEFT JOIN investimento_movimentos m ON m.investimento_id = i.id AND m.data <= ?
    ${filtro}
    GROUP BY i.id
    ORDER BY i.ativo DESC, i.nome COLLATE NOCASE ASC
  `).all(dataHojeLocal())).map(item => ({
    ...item,
    saldo_atual: arredondarMoeda(item.saldo_atual)
  }));
  });
}

export async function obterInvestimento(id) {
  return snapshot(async () => {
  const db = getDatabase();
  const investimento = (await buscarInvestimento(db, id));
  return {
    ...investimento,
    saldo_atual: (await calcularSaldo(db, investimento.id, dataHojeLocal()))
  };
  });
}

export async function criarInvestimento(dados) {
  return atomic(async () => {
  const db = getDatabase();
  const registro = {
    nome: validarTexto(dados.nome, 'Nome'),
    instituicao: validarTexto(dados.instituicao, 'Instituição'),
    conta_titular: validarTexto(dados.conta_titular, 'Titular/conta')
  };

  const info = (await db.prepare(`
    INSERT INTO investimentos (nome, instituicao, conta_titular)
    VALUES (@nome, @instituicao, @conta_titular)
  `).run(registro));
  const criado = (await obterInvestimento(info.lastInsertRowid));
  (await registrarAuditoria('INVESTIMENTO_CRIAR', `Investimento ${criado.nome} cadastrado`, null, criado));
  return criado;
  });
}

export async function atualizarInvestimento(id, dados) {
  return atomic(async () => {
  const db = getDatabase();
  const anterior = (await buscarInvestimento(db, id));
  const registro = {
    id: anterior.id,
    nome: validarTexto(dados.nome ?? anterior.nome, 'Nome'),
    instituicao: validarTexto(dados.instituicao ?? anterior.instituicao, 'Instituição'),
    conta_titular: validarTexto(dados.conta_titular ?? anterior.conta_titular, 'Titular/conta')
  };

  (await db.prepare(`
    UPDATE investimentos
    SET nome = @nome, instituicao = @instituicao, conta_titular = @conta_titular,
        atualizado_em = datetime('now', 'localtime')
    WHERE id = @id
  `).run(registro));
  const atualizado = (await obterInvestimento(anterior.id));
  (await registrarAuditoria('INVESTIMENTO_ATUALIZAR', `Investimento ${anterior.nome} atualizado`, anterior, atualizado));
  return atualizado;
  });
}

export async function definirInvestimentoAtivo(id, ativo) {
  return atomic(async () => {
  const db = getDatabase();
  const anterior = (await buscarInvestimento(db, id));
  const novoAtivo = ativo ? 1 : 0;
  (await db.prepare(`
    UPDATE investimentos SET ativo = ?, atualizado_em = datetime('now', 'localtime') WHERE id = ?
  `).run(novoAtivo, anterior.id));
  const atualizado = (await obterInvestimento(anterior.id));
  (await registrarAuditoria(
    novoAtivo ? 'INVESTIMENTO_ATIVAR' : 'INVESTIMENTO_DESATIVAR',
    `Investimento ${anterior.nome} ${novoAtivo ? 'ativado' : 'desativado'}`,
    anterior,
    atualizado
  ));
  return atualizado;
  });
}

export async function listarMovimentosInvestimento(investimentoId) {
  return snapshot(async () => {
  const db = getDatabase();
  (await buscarInvestimento(db, investimentoId));
  const movimentos = (await db.prepare(`
    SELECT * FROM investimento_movimentos
    WHERE investimento_id = ?
    ORDER BY data ASC, id ASC
  `).all(Number(investimentoId)));

  let saldo = 0;
  const enriquecidos = movimentos.map(movimento => {
    const impactoInvestido = movimento.tipo === 'resgate' ? -movimento.valor : movimento.valor;
    saldo = arredondarMoeda(saldo + impactoInvestido);
    return { ...movimento, saldo_resultante: saldo };
  });
  return enriquecidos.reverse();
  });
}

export async function registrarMovimentoInvestimento(investimentoId, dados) {
  return atomic(async () => {
  const db = getDatabase();
  const tipo = String(dados.tipo || '').trim().toLowerCase();
  if (!TIPOS_MOVIMENTO.has(tipo)) {
    throw new Error('Tipo inválido. Use aporte, resgate ou rendimento.');
  }
  const valor = validarValorPositivo(dados.valor);
  const data = validarData(dados.data);
  const observacao = String(dados.observacao || '').trim();

  const transacao = db.transaction(async () => {
    const investimento = (await buscarInvestimento(db, investimentoId));
    if (!investimento.ativo) throw new Error('O investimento está inativo. Ative-o antes de registrar movimentos.');

    const saldoAntes = (await calcularSaldo(db, investimento.id, dataHojeLocal()));
    if (tipo === 'resgate' && valor > saldoAntes) {
      throw new Error(`Resgate superior ao saldo disponível de R$ ${saldoAntes.toFixed(2)}.`);
    }

    const info = (await db.prepare(`
      INSERT INTO investimento_movimentos (investimento_id, tipo, valor, data, observacao)
      VALUES (?, ?, ?, ?, ?)
    `).run(investimento.id, tipo, valor, data, observacao));
    (await validarHistoricoNaoNegativo(db, investimento.id));
    const movimento = (await db.prepare('SELECT * FROM investimento_movimentos WHERE id = ?').get(info.lastInsertRowid));
    const saldoDepois = (await calcularSaldo(db, investimento.id, dataHojeLocal()));
    (await registrarAuditoria(
      'INVESTIMENTO_MOVIMENTO',
      `${tipo} de ${valor} em ${investimento.nome}`,
      { saldo: saldoAntes },
      { movimento, saldo: saldoDepois }
    ));
    return { ...movimento, saldo_anterior: saldoAntes, saldo_resultante: saldoDepois };
  });

  return (await transacao());
  });
}

export async function ajustarSaldoInvestimento(investimentoId, dados) {
  return atomic(async () => {
  const db = getDatabase();
  const saldoInformado = dados?.saldo_correto;
  if (saldoInformado === null || saldoInformado === undefined || String(saldoInformado).trim() === '') {
    throw new Error('Informe explicitamente o novo saldo do Cofre.');
  }
  const saldoCorreto = arredondarMoeda(saldoInformado);
  if (!Number.isFinite(saldoCorreto) || saldoCorreto < 0) {
    throw new Error('Saldo atual correto deve ser zero ou maior.');
  }
  const data = validarData(dados.data);
  const observacaoInformada = String(dados.observacao || '').trim();

  const transacao = db.transaction(async () => {
    const investimento = (await buscarInvestimento(db, investimentoId));
    if (!investimento.ativo) throw new Error('O investimento está inativo. Ative-o antes de ajustar o saldo.');

    const saldoAntes = (await calcularSaldo(db, investimento.id, dataHojeLocal()));
    const diferenca = arredondarMoeda(saldoCorreto - saldoAntes);
    if (diferenca === 0) {
      return { movimento_criado: false, saldo_anterior: saldoAntes, saldo_resultante: saldoAntes };
    }
    if (dados.confirmar_correcao !== true) {
      throw new Error('Confirme explicitamente a correção de saldo antes de continuar.');
    }

    const observacao = observacaoInformada || `Ajuste para saldo correto de R$ ${saldoCorreto.toFixed(2)}`;
    const info = (await db.prepare(`
      INSERT INTO investimento_movimentos (investimento_id, tipo, valor, data, observacao)
      VALUES (?, 'ajuste', ?, ?, ?)
    `).run(investimento.id, diferenca, data, observacao));
    (await validarHistoricoNaoNegativo(db, investimento.id));
    const movimento = (await db.prepare('SELECT * FROM investimento_movimentos WHERE id = ?').get(info.lastInsertRowid));
    (await registrarAuditoria(
      'INVESTIMENTO_AJUSTE',
      `Saldo de ${investimento.nome} ajustado de ${saldoAntes} para ${saldoCorreto}`,
      { saldo: saldoAntes },
      { movimento, saldo: saldoCorreto }
    ));
    return { movimento_criado: true, ...movimento, saldo_anterior: saldoAntes, saldo_resultante: saldoCorreto };
  });

  return (await transacao());
  });
}

export async function obterResumoInvestimentosDashboard(mes) {
  return snapshot(async () => {
  if (!/^\d{4}-\d{2}$/.test(String(mes || ''))) throw new Error('Competência inválida.');
  const db = getDatabase();
  const inicioMes = `${mes}-01`;
  const [ano, numeroMes] = mes.split('-').map(Number);
  const proximoMesData = new Date(ano, numeroMes, 1);
  const proximoMes = `${proximoMesData.getFullYear()}-${String(proximoMesData.getMonth() + 1).padStart(2, '0')}-01`;

  const saldoAtual = (await db.prepare(`
    SELECT COALESCE(SUM(${expressaoSaldo()}), 0) AS total
    FROM investimento_movimentos WHERE data <= ?
  `).get(dataHojeLocal())).total;
  const saldoCompetencia = (await db.prepare(`
    SELECT COALESCE(SUM(${expressaoSaldo()}), 0) AS total
    FROM investimento_movimentos WHERE data < ?
  `).get(proximoMes)).total;
  const impactoAnterior = (await db.prepare(`
    SELECT COALESCE(SUM(CASE tipo WHEN 'aporte' THEN -valor WHEN 'resgate' THEN valor ELSE 0 END), 0) AS total
    FROM investimento_movimentos WHERE data < ?
  `).get(inicioMes)).total;
  const impactoMes = (await db.prepare(`
    SELECT COALESCE(SUM(CASE tipo WHEN 'aporte' THEN -valor WHEN 'resgate' THEN valor ELSE 0 END), 0) AS total
    FROM investimento_movimentos WHERE data >= ? AND data < ?
  `).get(inicioMes, proximoMes)).total;

  return {
    saldo_investido_atual: arredondarMoeda(saldoAtual),
    saldo_investido_na_competencia: arredondarMoeda(saldoCompetencia),
    impacto_caixa_anterior: arredondarMoeda(impactoAnterior),
    impacto_caixa_mes: arredondarMoeda(impactoMes)
  };
  });
}
