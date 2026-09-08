import { snapshot, atomic } from '../database/connection.js';
/**
 * Serviço de Pagadores
 * Gerencia as fontes reais de recebimento (Dr. Alexandre, Dr. Ranon, Padrão).
 */

import { getDatabase } from '../database/connection.js';
import { dataHojeLocal } from '../utils/dataLocal.js';

function converterMesParaReferencia(mesYYYYMM) {
  if (!mesYYYYMM) return '';
  const partes = mesYYYYMM.split('-');
  if (partes.length < 2) return mesYYYYMM;
  const ano = partes[0];
  const mes = parseInt(partes[1], 10);
  const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  return `${meses[mes - 1]}/${ano}`;
}

export async function listarPagadores() {
  return snapshot(async () => {
  const db = getDatabase();
  return (await db.prepare('SELECT * FROM pagadores WHERE ativo = 1 ORDER BY nome').all());
  });
}

export async function listarTodosPagadores() {
  return snapshot(async () => {
  const db = getDatabase();
  return (await db.prepare('SELECT * FROM pagadores ORDER BY nome').all());
  });
}

export async function obterPagadorPorId(id) {
  return snapshot(async () => {
  const db = getDatabase();
  return (await db.prepare('SELECT * FROM pagadores WHERE id = ?').get(id));
  });
}

export async function criarPagador(dados) {
  return atomic(async () => {
  const db = getDatabase();
  const { nome, tipo_pessoa, documento, email, telefone, tipo_recebimento, conta_destino, observacao } = dados;
  const result = (await db.prepare(`
    INSERT INTO pagadores (nome, tipo_pessoa, documento, email, telefone, tipo_recebimento, conta_destino, observacao)
    VALUES (@nome, @tipo_pessoa, @documento, @email, @telefone, @tipo_recebimento, @conta_destino, @observacao)
  `).run({
    nome, tipo_pessoa: tipo_pessoa || 'Outro',
    documento: documento || null, email: email || null,
    telefone: telefone || null, 
    tipo_recebimento: tipo_recebimento || 'A definir',
    conta_destino: conta_destino || 'A definir',
    observacao: observacao || null
  }));
  return { id: result.lastInsertRowid };
  });
}

export async function atualizarPagador(id, dados) {
  return atomic(async () => {
  const db = getDatabase();
  const { nome, tipo_pessoa, documento, email, telefone, tipo_recebimento, conta_destino, observacao, ativo } = dados;
  (await db.prepare(`
    UPDATE pagadores SET
      nome = COALESCE(@nome, nome),
      tipo_pessoa = COALESCE(@tipo_pessoa, tipo_pessoa),
      documento = @documento,
      email = @email,
      telefone = @telefone,
      tipo_recebimento = COALESCE(@tipo_recebimento, tipo_recebimento),
      conta_destino = COALESCE(@conta_destino, conta_destino),
      observacao = @observacao,
      ativo = COALESCE(@ativo, ativo),
      atualizado_em = datetime('now', 'localtime')
    WHERE id = @id
  `).run({
    id, nome, tipo_pessoa,
    documento: documento || null, email: email || null,
    telefone: telefone || null, 
    tipo_recebimento,
    conta_destino,
    observacao: observacao || null,
    ativo: ativo !== undefined ? (ativo ? 1 : 0) : null
  }));
  return (await obterPagadorPorId(id));
  });
}

export async function ativarPagador(id) {
  return atomic(async () => {
  const db = getDatabase();
  (await db.prepare(`UPDATE pagadores SET ativo = 1, atualizado_em = datetime('now', 'localtime') WHERE id = ?`).run(id));
  return (await obterPagadorPorId(id));
  });
}

export async function desativarPagador(id) {
  return atomic(async () => {
  const db = getDatabase();
  (await db.prepare(`UPDATE pagadores SET ativo = 0, atualizado_em = datetime('now', 'localtime') WHERE id = ?`).run(id));
  return (await obterPagadorPorId(id));
  });
}

/**
 * Obtém resumo de produção/recebimento agrupado por pagador para um mês.
 */
export async function obterResumoPorPagador(mes) {
  return snapshot(async () => {
  const db = getDatabase();
  const pagadores = (await db.prepare('SELECT * FROM pagadores WHERE ativo = 1 ORDER BY nome').all());
  
  const mesFilter = mes || new Date().toISOString().slice(0, 7);
  const resultado = [];

  for (const pagador of pagadores) {
    // Buscar empresas vinculadas
    const empresas = (await db.prepare('SELECT id, nome FROM empresas WHERE pagador_id = ? AND ativa = 1').all(pagador.id));
    const empresaIds = empresas.map(e => e.id);
    const empresaNomes = empresas.map(e => e.nome);

    let totalProduzido = 0;
    let totalRecebido = 0;
    let totalExames = 0;
    let examesPendentes = 0;

    if (empresaIds.length > 0) {
      const placeholders = empresaIds.map(() => '?').join(',');
      
      // Lançamentos de trabalho (exceto cancelados)
      const lancamentos = (await db.prepare(`
        SELECT 
          COALESCE(SUM(quantidade), 0) as qtd,
          COALESCE(SUM(total), 0) as valor
        FROM lancamentos_trabalho
        WHERE empresa_id IN (${placeholders})
          AND data LIKE ? || '%'
          AND status != 'cancelado'
      `).get(...empresaIds, mesFilter));
      
      totalExames += lancamentos.qtd;
      totalProduzido += lancamentos.valor;

      // Recebidos
      const recebidos = (await db.prepare(`
        SELECT COALESCE(SUM(total), 0) as valor
        FROM lancamentos_trabalho
        WHERE empresa_id IN (${placeholders})
          AND data LIKE ? || '%'
          AND status = 'recebido'
      `).get(...empresaIds, mesFilter));
      
      totalRecebido += recebidos.valor;

      // Pendentes (fechado, mas não recebido)
      const pendentes = (await db.prepare(`
        SELECT COALESCE(SUM(quantidade), 0) as qtd
        FROM lancamentos_trabalho
        WHERE empresa_id IN (${placeholders})
          AND data LIKE ? || '%'
          AND status = 'fechado'
      `).get(...empresaIds, mesFilter));
      
      examesPendentes += pendentes.qtd;
    }

    // Se for Dr. Ranon, incluir também laudos_ranon
    if (pagador.nome === 'Dr. Ranon / RX') {
      const laudos = (await db.prepare(`
        SELECT 
          COALESCE(SUM(total), 0) as valor,
          COUNT(*) as qtd
        FROM laudos_ranon
        WHERE data LIKE ? || '%'
          AND status != 'cancelado'
      `).get(mesFilter));

      const laudosRecebidos = (await db.prepare(`
        SELECT COALESCE(SUM(total), 0) as valor
        FROM laudos_ranon
        WHERE data LIKE ? || '%'
          AND status = 'recebido'
      `).get(mesFilter));

      totalProduzido += laudos.valor;
      totalExames += laudos.qtd;
      totalRecebido += laudosRecebidos.valor;
    }

    resultado.push({
      pagador_id: pagador.id,
      pagador_nome: pagador.nome,
      pagador_tipo_pessoa: pagador.tipo_pessoa,
      tipo_recebimento: pagador.tipo_recebimento,
      conta_destino: pagador.conta_destino,
      empresas: empresaNomes,
      total_exames: totalExames,
      total_produzido: totalProduzido,
      total_recebido: totalRecebido,
      total_a_receber: totalProduzido - totalRecebido,
      exames_pendentes: examesPendentes
    });
  }

  return resultado;
  });
}

export async function obterRecebimentosPendentes(mes) {
  return snapshot(async () => {
  const db = getDatabase();
  const mesFilter = mes || new Date().toISOString().slice(0, 7);
  
  const pagadores = (await db.prepare('SELECT * FROM pagadores WHERE ativo = 1 ORDER BY nome').all());
  const resultado = [];

  for (const pagador of pagadores) {
    const empresas = (await db.prepare('SELECT id, nome FROM empresas WHERE pagador_id = ? AND ativa = 1').all(pagador.id));
    const empresaIds = empresas.map(e => e.id);
    const placeholders = empresaIds.map(() => '?').join(',');

    if (pagador.nome === 'Dr. Alexandre') {
      if (empresaIds.length > 0) {
        const remessas = (await db.prepare(`
          SELECT 
            lt.origem_fechamento_dia_id as fechamento_id,
            COALESCE(MAX(fd.data), MIN(lt.data)) as data_referencia,
            SUM(lt.quantidade) as qtd,
            SUM(lt.total) as valor,
            SUM(CASE WHEN lt.status = 'recebido' THEN 1 ELSE 0 END) as qtd_recebidos,
            COUNT(lt.id) as total_itens
          FROM lancamentos_trabalho lt
          LEFT JOIN fechamentos_diarios fd ON lt.origem_fechamento_dia_id = fd.id
          WHERE lt.empresa_id IN (${placeholders})
            AND COALESCE(fd.data, lt.data) LIKE ? || '%'
            AND lt.status != 'cancelado'
          GROUP BY lt.origem_fechamento_dia_id,
            CASE WHEN lt.origem_fechamento_dia_id IS NULL THEN lt.data END
          ORDER BY data_referencia DESC
        `).all(...empresaIds, mesFilter));

        for (const remessa of remessas) {
          resultado.push({
            pagador: 'Dr. Alexandre',
            tipo: 'remessa',
            referencia: remessa.fechamento_id ? remessa.fechamento_id.toString() : remessa.data_referencia,
            data_referencia: remessa.data_referencia,
            qtd: remessa.qtd,
            valor: remessa.valor,
            status: remessa.qtd_recebidos === remessa.total_itens ? 'recebido' : 'fechado'
          });
        }
      }
    } else if (pagador.nome === 'Padrão') {
      if (empresaIds.length > 0) {
        // Filtra por lt.data (data da produção digitada), não pela data do fechamento físico.
        // Isso garante que exames de 31/05 fechados em 01/06 ainda aparecem em maio.
        const totais = (await db.prepare(`
          SELECT 
            SUM(lt.quantidade) as qtd,
            SUM(lt.total) as valor,
            SUM(CASE WHEN lt.status = 'recebido' THEN 1 ELSE 0 END) as qtd_recebidos,
            COUNT(lt.id) as total_itens
          FROM lancamentos_trabalho lt
          WHERE lt.empresa_id IN (${placeholders})
            AND lt.data LIKE ? || '%'
            AND lt.status IN ('fechado', 'recebido')
        `).get(...empresaIds, mesFilter));

        const empresaNomes = empresas.map(e => e.nome);
        const placeholdersNomes = empresaNomes.map(() => '?').join(',');
        const referenciaVisivel = converterMesParaReferencia(mesFilter);

        const ajustes = (await db.prepare(`
          SELECT 
            SUM(quantidade) as qtd,
            SUM(total) as valor
          FROM ajustes_retroativos
          WHERE referencia = ? AND empresa IN (${placeholdersNomes})
        `).get(referenciaVisivel, ...empresaNomes));

        const qtdAjustes = ajustes && ajustes.qtd ? ajustes.qtd : 0;
        const valorAjustes = ajustes && ajustes.valor ? ajustes.valor : 0;

        const totalQtd = (totais && totais.qtd ? totais.qtd : 0) + qtdAjustes;
        const totalValor = (totais && totais.valor ? totais.valor : 0) + valorAjustes;

        if (totalValor > 0) {
          resultado.push({
            pagador: 'Padrão',
            tipo: 'mensal',
            referencia: mesFilter,
            qtd: totalQtd,
            valor: totalValor,
            status: totais && totais.total_itens > 0 && totais.qtd_recebidos === totais.total_itens ? 'recebido' : 'fechado'
          });
        }
      }
    } else if (pagador.nome === 'Dr. Ranon / RX') {
      // Planilhas já salvas (histórico definitivo)
      const planilhas = (await db.prepare(`
        SELECT 
          arquivo_excel_backup,
          MAX(data) as max_data,
          COUNT(*) as qtd,
          SUM(total) as valor,
          SUM(CASE WHEN status = 'recebido' THEN 1 ELSE 0 END) as qtd_recebidos,
          COUNT(*) as total_itens
        FROM laudos_ranon
        WHERE arquivo_excel_backup IS NOT NULL
          AND data LIKE ? || '%'
          AND status != 'cancelado'
        GROUP BY arquivo_excel_backup
      `).all(mesFilter));

      for (const p of planilhas) {
        resultado.push({
          pagador: 'Dr. Ranon / RX',
          tipo: 'planilha',
          referencia: p.arquivo_excel_backup,
          qtd: p.qtd,
          valor: p.valor,
          status: p.qtd_recebidos === p.total_itens ? 'recebido' : 'fechado'
        });
      }

      // Laudos pendentes ainda não salvos (em tempo real)
      const pendentes = (await db.prepare(`
        SELECT COALESCE(SUM(quantidade), 0) as qtd, COALESCE(SUM(total), 0) as valor
        FROM laudos_ranon_pendentes
        WHERE data LIKE ? || '%'
      `).get(mesFilter));

      if (pendentes && pendentes.qtd > 0) {
        resultado.push({
          pagador: 'Dr. Ranon / RX',
          tipo: 'pendente',
          referencia: 'Em aberto (não salvo)',
          qtd: pendentes.qtd,
          valor: pendentes.valor,
          status: 'pendente'
        });
      }
    }
  }
  
  return resultado.sort((a, b) => {
    if (a.pagador !== b.pagador) return a.pagador.localeCompare(b.pagador);
    // Pendentes sempre no final
    if (a.status === 'pendente' && b.status !== 'pendente') return 1;
    if (a.status !== 'pendente' && b.status === 'pendente') return -1;
    // Usa data_referencia quando disponível (remessas Dr. Alexandre), senão referencia
    const dataA = a.data_referencia || a.referencia || '';
    const dataB = b.data_referencia || b.referencia || '';
    return dataB.localeCompare(dataA); // mais recentes primeiro
  });
  });
}

export async function processarRecebimentoPagador(dados) {
  return atomic(async () => {
  const db = getDatabase();
  const { pagador, tipo, referencia, mes } = dados; // mes é necessário para Padrão
  
  const pagadorInfo = (await db.prepare('SELECT * FROM pagadores WHERE nome = ?').get(pagador));
  if (!pagadorInfo) throw new Error('Pagador não encontrado.');
  
  const empresas = (await db.prepare('SELECT id, nome FROM empresas WHERE pagador_id = ?').all(pagadorInfo.id));
  const empresaIds = empresas.map(e => e.id);
  const placeholders = empresaIds.map(() => '?').join(',');

  const dataAtual = dataHojeLocal();
  let idsLancamentos = [];
  let idsLaudos = [];

  const transacao = db.transaction(async () => {
    if (pagador === 'Dr. Alexandre' && tipo === 'remessa') {
      const ehId = !isNaN(referencia) && !referencia.includes('-');
      const condition = ehId ? `origem_fechamento_dia_id = ?` : `data = ?`;

      const lancamentos = (await db.prepare(`
        SELECT id, total 
        FROM lancamentos_trabalho
        WHERE empresa_id IN (${placeholders}) 
          AND ${condition} 
          AND status = 'fechado'
      `).all(...empresaIds, referencia));
      
      idsLancamentos = lancamentos.map(l => l.id);
      
      if (idsLancamentos.length > 0) {
        const pIds = idsLancamentos.map(() => '?').join(',');
        (await db.prepare(`UPDATE lancamentos_trabalho SET status = 'recebido', recebido_em = ? WHERE id IN (${pIds})`).run(dataAtual, ...idsLancamentos));
      }
    } else if (pagador === 'Padrão' && tipo === 'mensal') {
      const lancamentos = (await db.prepare(`
        SELECT id, total 
        FROM lancamentos_trabalho
        WHERE empresa_id IN (${placeholders}) 
          AND data LIKE ? || '%' 
          AND status = 'fechado'
      `).all(...empresaIds, mes || referencia));
      
      idsLancamentos = lancamentos.map(l => l.id);
      
      if (idsLancamentos.length > 0) {
        const pIds = idsLancamentos.map(() => '?').join(',');
        (await db.prepare(`UPDATE lancamentos_trabalho SET status = 'recebido', recebido_em = ? WHERE id IN (${pIds})`).run(dataAtual, ...idsLancamentos));
      }
    } else if (pagador === 'Dr. Ranon / RX' && tipo === 'planilha') {
      const laudos = (await db.prepare(`
        SELECT id, total FROM laudos_ranon 
        WHERE arquivo_excel_backup = ? AND status = 'fechado'
      `).all(referencia));
      
      idsLaudos = laudos.map(l => l.id);
      
      if (idsLaudos.length > 0) {
        const pIds = idsLaudos.map(() => '?').join(',');
        (await db.prepare(`UPDATE laudos_ranon SET status = 'recebido', recebido_em = ? WHERE id IN (${pIds})`).run(dataAtual, ...idsLaudos));
      }
    }

    // Criar uma receita única para o somatório
    let totalSomado = 0;
    if (idsLancamentos.length > 0) {
       const sumL = (await db.prepare(`SELECT SUM(total) as val FROM lancamentos_trabalho WHERE id IN (${idsLancamentos.map(()=>'?').join(',')})`).get(...idsLancamentos));
       totalSomado += sumL.val || 0;
    }

    if (pagador === 'Padrão' && tipo === 'mensal') {
       const refVisivel = converterMesParaReferencia(mes || referencia);
       const placeholdersNomes = empresas.map(() => '?').join(',');
       const empresaNomes = empresas.map(e => e.nome);
       const sumA = (await db.prepare(`
         SELECT SUM(total) as val 
         FROM ajustes_retroativos 
         WHERE referencia = ? AND empresa IN (${placeholdersNomes})
       `).get(refVisivel, ...empresaNomes));
       if (sumA && sumA.val) {
         totalSomado += sumA.val;
       }
    }

    if (idsLaudos.length > 0) {
       const sumR = (await db.prepare(`SELECT SUM(total) as val FROM laudos_ranon WHERE id IN (${idsLaudos.map(()=>'?').join(',')})`).get(...idsLaudos));
       totalSomado += sumR.val || 0;
    }

    if (totalSomado > 0) {
      (await db.prepare(`
        INSERT INTO receitas (descricao, valor, data, origem, categoria_nome, observacao, status, recebido_em)
        VALUES (?, ?, ?, ?, ?, ?, 'recebido', ?)
      `).run(
        `Recebimento ${pagador} (${tipo === 'mensal' ? mes || referencia : referencia})`,
        totalSomado,
        dataAtual,
        pagador,
        'Trabalho',
        `Recebimento gerado automaticamente em Histórico (Por Pagador).`,
        dataAtual
      ));
    }
  });

  (await transacao());
  return { success: true, message: 'Recebimento processado com sucesso.' };
  });
}
