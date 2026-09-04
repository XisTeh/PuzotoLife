import { getDatabase } from '../database/connection.js';
import { registrarAuditoria } from './auditoria.js';
import crypto from 'crypto';

function formatarDataIso(data) {
  var ano = data.getFullYear();
  var mes = String(data.getMonth() + 1).padStart(2, '0');
  var dia = String(data.getDate()).padStart(2, '0');
  return ano + '-' + mes + '-' + dia;
}

function dataIsoHoje() {
  return formatarDataIso(new Date());
}

export function listarPessoasDividas(filtros) {
  const db = getDatabase();
  let sql = 'SELECT * FROM pessoas_dividas WHERE 1=1';
  const params = [];

  if (filtros) {
    if (filtros.mes) {
      sql += " AND data_combinada LIKE ?";
      params.push(filtros.mes + '-%');
    }
    if (filtros.tipo && filtros.tipo !== 'todos') {
      sql += ' AND tipo = ?';
      params.push(filtros.tipo);
    }
    if (filtros.status && filtros.status !== 'todos') {
      sql += ' AND status = ?';
      params.push(filtros.status);
    }
    if (filtros.pessoa) {
      sql += ' AND nome_pessoa LIKE ?';
      params.push('%' + filtros.pessoa + '%');
    }
  }

  sql += ' ORDER BY data_combinada ASC';
  const stmt = db.prepare(sql);
  const registros = stmt.all(...params);

  // Se tiver filtro de mês, gerar as parcelas de dividas_parceladas_grupos correspondentes a esse mês
  if (filtros && filtros.mes) {
    let queryDP = "SELECT * FROM dividas_parceladas_grupos WHERE status != 'cancelada'";
    const paramsDP = [];
    
    if (filtros.pessoa) {
      queryDP += " AND nome_pessoa LIKE ?";
      paramsDP.push('%' + filtros.pessoa + '%');
    }
    if (filtros.tipo && filtros.tipo !== 'todos') {
      queryDP += " AND tipo = ?";
      paramsDP.push(filtros.tipo);
    }

    const grupos = db.prepare(queryDP).all(...paramsDP);

    grupos.forEach(grupo => {
      // Calcular qual parcela desse grupo cai no mês filtros.mes
      const [anoI, mesI] = grupo.competencia_inicio.split('-');
      const [anoF, mesF] = filtros.mes.split('-');
      
      const diffMeses = (Number(anoF) - Number(anoI)) * 12 + (Number(mesF) - Number(mesI));
      const numParcela = diffMeses + 1;

      if (numParcela >= 1 && numParcela <= grupo.total_parcelas) {
        // Verificar se já existe um registro físico em pessoas_dividas correspondente a esta parcela do grupo
        const existeFisico = registros.some(r => 
          !r.is_parcela_virtual && 
          r.nome_pessoa === grupo.nome_pessoa && 
          r.grupo_parcelas_id === `dp_grupo_${grupo.id}` && 
          r.parcela_atual === numParcela
        );
        
        if (existeFisico) {
          return; // ignora a virtual para não duplicar!
        }

        // Esta dívida parcelada tem uma parcela neste mês!
        // Determinar status da parcela
        const statusParcela = numParcela <= grupo.parcelas_pagas 
          ? (grupo.tipo === 'eu_devo' ? 'pago' : 'recebido') 
          : 'pendente';

        // Se o filtro de status for específico e não bater, ignora
        if (filtros.status && filtros.status !== 'todos' && filtros.status !== statusParcela) {
          return;
        }

        // Calcular data combinada real para exibição (vencimento)
        const d = new Date(Number(anoF), Number(mesF) - 1, 1);
        const ultimoDia = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        const diaReal = grupo.dia_vencimento > ultimoDia ? ultimoDia : grupo.dia_vencimento;
        const dataCombinada = `${filtros.mes}-${String(diaReal).padStart(2, '0')}`;

        let valorParcela = grupo.valor_parcela;
        if (grupo.id === 4 && numParcela === 1 && filtros.mes === '2026-06') {
          valorParcela = 194.57; // Exceção Meu Peixe no mês 6
        }

        registros.push({
          id: `dp_${grupo.id}`,
          nome_pessoa: grupo.nome_pessoa,
          tipo: grupo.tipo,
          valor: valorParcela,
          motivo: `${grupo.motivo} (${numParcela}/${grupo.total_parcelas})`,
          data_combinada: dataCombinada,
          status: statusParcela,
          pago_recebido_em: statusParcela !== 'pendente' ? dataCombinada : null,
          parcela_atual: numParcela,
          total_parcelas: grupo.total_parcelas,
          grupo_parcelas_id: `dp_grupo_${grupo.id}`,
          observacao: grupo.observacao || '',
          is_parcela_virtual: true
        });
      }
    });

    // Reordenar todos os registros por data_combinada após a mesclagem
    registros.sort((a, b) => a.data_combinada.localeCompare(b.data_combinada));
  }

  // Calcula atraso visualmente se pendente e data < hoje
  const hoje = dataIsoHoje();
  return registros.map(r => {
    r.atrasado = (r.status === 'pendente' && r.data_combinada < hoje);
    return r;
  });
}


export function criarPessoaDivida(dados) {
  const db = getDatabase();
  
  if (!dados.nome_pessoa || !dados.tipo || !dados.valor || !dados.motivo || !dados.data_combinada) {
    throw new Error('Campos obrigatórios faltando');
  }

  const parcelas = parseInt(dados.parcelas) || 1;
  const frequencia = dados.frequencia || 'mensal';
  const valorTotal = parseFloat(dados.valor);
  const valorParcela = parcelas > 1 ? (valorTotal / parcelas) : valorTotal;

  const transaction = db.transaction(() => {
    const stmt = db.prepare(`
      INSERT INTO pessoas_dividas (nome_pessoa, tipo, valor, motivo, data_combinada, parcela_atual, total_parcelas, grupo_parcelas_id, observacao)
      VALUES (@nome_pessoa, @tipo, @valor, @motivo, @data_combinada, @parcela_atual, @total_parcelas, @grupo_parcelas_id, @observacao)
    `);

    const grupoId = parcelas > 1 ? crypto.randomUUID() : null;
    
    const partes = dados.data_combinada.split('-');
    const dataOriginal = new Date(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2]));

    for (let i = 0; i < parcelas; i++) {
      const novaData = new Date(dataOriginal.getTime());
      
      if (frequencia === 'mensal') {
        novaData.setMonth(novaData.getMonth() + i);
      } else if (frequencia === 'semanal') {
        novaData.setDate(novaData.getDate() + (i * 7));
      } else if (frequencia === 'anual') {
        novaData.setFullYear(novaData.getFullYear() + i);
      }

      stmt.run({
        nome_pessoa: dados.nome_pessoa,
        tipo: dados.tipo,
        valor: valorParcela,
        motivo: parcelas > 1 ? `${dados.motivo} (${i + 1}/${parcelas})` : dados.motivo,
        data_combinada: formatarDataIso(novaData),
        parcela_atual: i + 1,
        total_parcelas: parcelas,
        grupo_parcelas_id: grupoId,
        observacao: dados.observacao || ''
      });
    }
  });

  transaction();
  registrarAuditoria('PESSOAS_DIVIDAS_CRIAR', `Registro p/ ${dados.nome_pessoa} de ${dados.valor} (${parcelas}x)`);
  return { sucesso: true };
}

export function marcarPessoaDividaResolvida(id) {
  const db = getDatabase();
  const registro = db.prepare('SELECT id, tipo, status FROM pessoas_dividas WHERE id = ?').get(id);
  
  if (!registro) throw new Error('Registro não encontrado');
  if (registro.status !== 'pendente') throw new Error(`Registro já está ${registro.status}`);

  const novoStatus = registro.tipo === 'eu_devo' ? 'pago' : 'recebido';

  db.prepare(`
    UPDATE pessoas_dividas 
    SET status = ?, pago_recebido_em = datetime('now', 'localtime'), atualizado_em = datetime('now', 'localtime')
    WHERE id = ?
  `).run(novoStatus, id);

  registrarAuditoria('PESSOAS_DIVIDAS_RESOLVIDA', `Registro ${id} marcado como ${novoStatus}`);
  return { sucesso: true };
}

export function cancelarPessoaDivida(id, todasParcelas = false) {
  const db = getDatabase();
  const registro = db.prepare('SELECT id, status, grupo_parcelas_id FROM pessoas_dividas WHERE id = ?').get(id);
  
  if (!registro) throw new Error('Registro não encontrado');
  if (registro.status === 'cancelado') throw new Error('Registro já está cancelado');

  if (todasParcelas && registro.grupo_parcelas_id) {
    db.prepare(`
      UPDATE pessoas_dividas 
      SET status = 'cancelado', atualizado_em = datetime('now', 'localtime') 
      WHERE grupo_parcelas_id = ?
    `).run(registro.grupo_parcelas_id);
    registrarAuditoria('PESSOAS_DIVIDAS_CANCELAR', `Grupo de parcelas ${registro.grupo_parcelas_id} cancelado`);
  } else {
    db.prepare(`
      UPDATE pessoas_dividas 
      SET status = 'cancelado', atualizado_em = datetime('now', 'localtime') 
      WHERE id = ?
    `).run(id);
    registrarAuditoria('PESSOAS_DIVIDAS_CANCELAR', `Registro ${id} cancelado`);
  }
  return { sucesso: true };
}

export function removerPessoaDivida(id, todasParcelas = false) {
  const db = getDatabase();
  const registro = db.prepare('SELECT grupo_parcelas_id FROM pessoas_dividas WHERE id = ?').get(id);
  
  if (todasParcelas && registro && registro.grupo_parcelas_id) {
    db.prepare('DELETE FROM pessoas_dividas WHERE grupo_parcelas_id = ?').run(registro.grupo_parcelas_id);
    registrarAuditoria('PESSOAS_DIVIDAS_EXCLUIR', `Grupo de parcelas excluído fisicamente`);
  } else {
    db.prepare('DELETE FROM pessoas_dividas WHERE id = ?').run(id);
    registrarAuditoria('PESSOAS_DIVIDAS_EXCLUIR', `Registro ${id} excluído fisicamente`);
  }
  return { sucesso: true };
}

export function calcularResumoPessoasDividas(mes) {
  const db = getDatabase();
  const hoje = dataIsoHoje();
  const mesParams = mes ? [mes + '-%'] : ['%'];

  const resumo = {
    euDevoPendente: 0,
    meDevemPendente: 0,
    jaPagueiMes: 0,
    jaRecebiMes: 0,
    pendenciasAtrasadasQtd: 0,
    pendenciasAtrasadasValor: 0,
    saldoLiquido: 0,
    euDevoPendenteTotalGeral: 0,
    meDevemPendenteTotalGeral: 0
  };

  // Eu Devo / Me Devem pendentes simples (Geral)
  const pendentes = db.prepare("SELECT tipo, SUM(valor) as total FROM pessoas_dividas WHERE status = 'pendente' GROUP BY tipo").all();
  pendentes.forEach(p => {
    if (p.tipo === 'eu_devo') resumo.euDevoPendenteTotalGeral = p.total || 0;
    if (p.tipo === 'me_deve') resumo.meDevemPendenteTotalGeral = p.total || 0;
  });

  // Somar apenas a parcela correspondente do mês das dívidas parceladas ativas se pendentes
  if (mes) {
    const dp_ativas = db.prepare("SELECT * FROM dividas_parceladas_grupos WHERE status = 'ativa'").all();
    dp_ativas.forEach(grupo => {
      const [anoI, mesI] = grupo.competencia_inicio.split('-');
      const [anoF, mesF] = mes.split('-');
      const diffMeses = (Number(anoF) - Number(anoI)) * 12 + (Number(mesF) - Number(mesI));
      const numParcela = diffMeses + 1;
      
      if (numParcela >= 1 && numParcela <= grupo.total_parcelas) {
        if (numParcela > grupo.parcelas_pagas) {
          // Parcela está pendente!
          let valorParcela = grupo.valor_parcela;
          if (grupo.id === 4 && numParcela === 1 && mes === '2026-06') {
            valorParcela = 194.57; // Exceção para Meu Peixe no mês 6
          }
          
          if (grupo.tipo === 'eu_devo') {
            resumo.euDevoPendenteTotalGeral += valorParcela;
          } else if (grupo.tipo === 'me_deve') {
            resumo.meDevemPendenteTotalGeral += valorParcela;
          }
        }
      }
    });
  }

  resumo.euDevoPendente = resumo.euDevoPendenteTotalGeral;
  resumo.meDevemPendente = resumo.meDevemPendenteTotalGeral;
  resumo.saldoLiquido = resumo.meDevemPendente - resumo.euDevoPendente;

  // Pagos / Recebidos no Mês (simples)
  const pagos = db.prepare("SELECT tipo, SUM(valor) as total FROM pessoas_dividas WHERE (status = 'pago' OR status = 'recebido') AND (pago_recebido_em LIKE ? OR data_combinada LIKE ?) GROUP BY tipo").all(mesParams[0], mesParams[0]);
  pagos.forEach(p => {
    if (p.tipo === 'eu_devo') resumo.jaPagueiMes = p.total || 0;
    if (p.tipo === 'me_deve') resumo.jaRecebiMes = p.total || 0;
  });

  // Somar também parcelas de dívidas parceladas pagas no mês filtrado
  if (mes) {
    const gruposParaResumo = db.prepare("SELECT * FROM dividas_parceladas_grupos WHERE status != 'cancelada'").all();
    gruposParaResumo.forEach(grupo => {
      const [anoI, mesI] = grupo.competencia_inicio.split('-');
      const [anoF, mesF] = mes.split('-');
      const diffMeses = (Number(anoF) - Number(anoI)) * 12 + (Number(mesF) - Number(mesI));
      const numParcela = diffMeses + 1;
      
      if (numParcela >= 1 && numParcela <= grupo.total_parcelas) {
        if (numParcela <= grupo.parcelas_pagas) {
          // Parcela está paga!
          let valorParcela = grupo.valor_parcela;
          if (grupo.id === 4 && numParcela === 1 && mes === '2026-06') {
            valorParcela = 194.57; // Exceção para Meu Peixe no mês 6
          }

          if (grupo.tipo === 'eu_devo') {
            resumo.jaPagueiMes += valorParcela;
          } else if (grupo.tipo === 'me_deve') {
            resumo.jaRecebiMes += valorParcela;
          }
        }
      }
    });
  }

  // Atrasadas
  const atrasadas = db.prepare("SELECT COUNT(*) as qtd, SUM(valor) as total FROM pessoas_dividas WHERE status = 'pendente' AND data_combinada < ?").get(hoje);
  resumo.pendenciasAtrasadasQtd = atrasadas.qtd || 0;
  resumo.pendenciasAtrasadasValor = atrasadas.total || 0;

  return resumo;
}

export function obterHistoricoPessoa(nome) {
  const db = getDatabase();
  const registros = db.prepare('SELECT * FROM pessoas_dividas WHERE nome_pessoa = ? ORDER BY data_combinada DESC').all(nome);

  const resumo = {
    euDevo: 0,
    meDeve: 0,
    saldo: 0,
    abertas: 0
  };

  registros.forEach(r => {
    if (r.status === 'pendente') {
      resumo.abertas++;
      if (r.tipo === 'eu_devo') resumo.euDevo += r.valor;
      if (r.tipo === 'me_deve') resumo.meDeve += r.valor;
    }
  });

  resumo.saldo = resumo.meDeve - resumo.euDevo;

  return { resumo, registros };
}

export function listarPessoasUnicas() {
  const db = getDatabase();
  const rows = db.prepare('SELECT DISTINCT nome_pessoa FROM pessoas_dividas UNION SELECT DISTINCT nome_pessoa FROM dividas_parceladas_grupos ORDER BY nome_pessoa ASC').all();
  return rows.map(r => r.nome_pessoa);
}

// ═══════════════════════════════════════
// DÍVIDAS PARCELADAS (GRUPOS)
// ═══════════════════════════════════════

export function listarDividasParceladas(filtros) {
  const db = getDatabase();
  let sql = "SELECT * FROM dividas_parceladas_grupos WHERE status = 'ativa'";
  const params = [];
  
  if (filtros && filtros.pessoa) {
    sql += ' AND nome_pessoa LIKE ?';
    params.push('%' + filtros.pessoa + '%');
  }
  if (filtros && filtros.tipo && filtros.tipo !== 'todos') {
    sql += ' AND tipo = ?';
    params.push(filtros.tipo);
  }
  
  sql += ' ORDER BY nome_pessoa ASC';
  const stmt = db.prepare(sql);
  const grupos = stmt.all(...params);
  
  // Enriquecer com próxima parcela
  return grupos.map(g => {
    const proxNumero = g.parcelas_pagas + 1;
    const [ano, mes] = g.competencia_inicio.split('-');
    const mesesOffset = g.parcelas_pagas;
    const proxDate = new Date(Number(ano), Number(mes) - 1 + mesesOffset, 1);
    const proxComp = proxDate.getFullYear() + '-' + String(proxDate.getMonth() + 1).padStart(2, '0');
    const saldoRestante = g.parcelas_restantes * g.valor_parcela;
    
    return {
      ...g,
      prox_numero: proxNumero > g.total_parcelas ? g.total_parcelas : proxNumero,
      prox_competencia: proxComp,
      saldo_restante: saldoRestante
    };
  });
}

export function criarDividaParcelada(dados) {
  const db = getDatabase();
  
  if (!dados.nome_pessoa || !dados.tipo || !dados.motivo || !dados.valor_parcela || !dados.total_parcelas) {
    throw new Error('Campos obrigatórios faltando');
  }
  
  const parcelas_pagas = parseInt(dados.parcelas_pagas) || 0;
  const total_parcelas = parseInt(dados.total_parcelas);
  const parcelas_restantes = total_parcelas - parcelas_pagas;
  const valor_parcela = parseFloat(dados.valor_parcela);
  const valor_total_original = dados.valor_total_original ? parseFloat(dados.valor_total_original) : (valor_parcela * total_parcelas);
  const dia_vencimento = parseInt(dados.dia_vencimento) || 5;
  const competencia_inicio = dados.competencia_inicio || (new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0'));
  
  if (parcelas_pagas >= total_parcelas) {
    throw new Error('Parcelas pagas não pode ser maior ou igual ao total.');
  }
  if (parcelas_restantes < 1) {
    throw new Error('Deve haver ao menos 1 parcela restante.');
  }
  
  const info = db.prepare(`
    INSERT INTO dividas_parceladas_grupos 
    (nome_pessoa, tipo, motivo, valor_parcela, valor_total_original, total_parcelas, parcelas_pagas, parcelas_restantes, dia_vencimento, competencia_inicio, observacao)
    VALUES (@nome_pessoa, @tipo, @motivo, @valor_parcela, @valor_total_original, @total_parcelas, @parcelas_pagas, @parcelas_restantes, @dia_vencimento, @competencia_inicio, @observacao)
  `).run({
    nome_pessoa: dados.nome_pessoa,
    tipo: dados.tipo,
    motivo: dados.motivo,
    valor_parcela,
    valor_total_original,
    total_parcelas,
    parcelas_pagas,
    parcelas_restantes,
    dia_vencimento,
    competencia_inicio,
    observacao: dados.observacao || ''
  });
  
  registrarAuditoria('DIVIDA_PARCELADA_CRIAR', `Divida parcelada ${dados.nome_pessoa} - ${dados.motivo} (${total_parcelas}x R$${valor_parcela})`);
  return { sucesso: true, id: info.lastInsertRowid };
}

export function pagarProximaParcelaDivida(grupoId) {
  const db = getDatabase();
  
  const transaction = db.transaction(() => {
    const grupo = db.prepare('SELECT * FROM dividas_parceladas_grupos WHERE id = ?').get(grupoId);
    if (!grupo) throw new Error('Dívida parcelada não encontrada');
    if (grupo.status !== 'ativa') throw new Error('Esta dívida não está ativa.');
    if (grupo.parcelas_restantes <= 0) throw new Error('Todas as parcelas já foram pagas.');
    
    const novasPagas = grupo.parcelas_pagas + 1;
    const novasRestantes = grupo.parcelas_restantes - 1;
    const novoStatus = novasRestantes <= 0 ? 'encerrada' : 'ativa';
    
    db.prepare(`
      UPDATE dividas_parceladas_grupos 
      SET parcelas_pagas = ?, parcelas_restantes = ?, status = ?, atualizado_em = datetime('now', 'localtime')
      WHERE id = ?
    `).run(novasPagas, novasRestantes, novoStatus, grupoId);
    
    // Calcular competência da parcela paga
    const [ano, mes] = grupo.competencia_inicio.split('-');
    const mesesOffset = grupo.parcelas_pagas; // antes de incrementar, é a parcela atual
    const parcelaDate = new Date(Number(ano), Number(mes) - 1 + mesesOffset, 1);
    const parcelaComp = parcelaDate.getFullYear() + '-' + String(parcelaDate.getMonth() + 1).padStart(2, '0');
    
    // Registrar pagamento em pessoas_dividas para refletir no saldo do dashboard
    const statusPagamento = grupo.tipo === 'eu_devo' ? 'pago' : 'recebido';
    
    let valorParcela = grupo.valor_parcela;
    const numParcela = novasPagas;
    if (grupo.id === 4 && numParcela === 1 && parcelaComp === '2026-06') {
      valorParcela = 194.57; // Exceção para Meu Peixe no mês 6
    }

    db.prepare(`
      INSERT INTO pessoas_dividas (nome_pessoa, tipo, motivo, valor, status, data_combinada, pago_recebido_em, parcela_atual, total_parcelas, grupo_parcelas_id)
      VALUES (?, ?, ?, ?, ?, ?, date('now', 'localtime'), ?, ?, ?)
    `).run(
      grupo.nome_pessoa,
      grupo.tipo,
      `${grupo.motivo} (Parcela ${novasPagas}/${grupo.total_parcelas})`,
      valorParcela,
      statusPagamento,
      `${parcelaComp}-01`,
      numParcela,
      grupo.total_parcelas,
      `dp_grupo_${grupo.id}`
    );
    
    registrarAuditoria('DIVIDA_PARCELADA_PAGAR', `Parcela ${novasPagas}/${grupo.total_parcelas} de ${grupo.nome_pessoa} - ${grupo.motivo} paga (${parcelaComp})`);
    
    return {
      sucesso: true,
      parcela_paga: novasPagas,
      total_parcelas: grupo.total_parcelas,
      parcelas_restantes: novasRestantes,
      competencia: parcelaComp,
      status: novoStatus
    };
  });
  
  return transaction();
}

export function excluirDividaParcelada(grupoId) {
  const db = getDatabase();
  const grupo = db.prepare('SELECT * FROM dividas_parceladas_grupos WHERE id = ?').get(grupoId);
  if (!grupo) throw new Error('Dívida parcelada não encontrada');
  
  db.prepare('DELETE FROM dividas_parceladas_grupos WHERE id = ?').run(grupoId);
  registrarAuditoria('DIVIDA_PARCELADA_EXCLUIR', `Divida parcelada ${grupo.nome_pessoa} - ${grupo.motivo} excluída`);
  return { sucesso: true };
}

export function obterDividaParcelada(grupoId) {
  const db = getDatabase();
  const grupo = db.prepare('SELECT * FROM dividas_parceladas_grupos WHERE id = ?').get(grupoId);
  if (!grupo) throw new Error('Dívida parcelada não encontrada');
  
  // Gerar lista de parcelas virtual
  const parcelas = [];
  const [ano, mes] = grupo.competencia_inicio.split('-');
  for (let i = 0; i < grupo.total_parcelas; i++) {
    const d = new Date(Number(ano), Number(mes) - 1 + i, 1);
    const comp = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    const numParcela = i + 1;
    
    // Calcular dia de vencimento real
    const ultimoDia = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const diaReal = grupo.dia_vencimento > ultimoDia ? ultimoDia : grupo.dia_vencimento;
    const vencimento = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(diaReal).padStart(2, '0');
    
    // Status baseado no parcelas_pagas
    // parcelas_pagas conta a partir da competencia_inicio, parcelas 1..parcelas_pagas estão pagas
    // Mas as primeiras parcelas_pagas originais (antes do cadastro) devem considerar o offset
    const offsetOriginal = parseInt(grupo.competencia_inicio.split('-')[1]) - parseInt(mes);
    const status = (numParcela <= grupo.parcelas_pagas) ? 'paga' : 'pendente';
    
    parcelas.push({
      numero: numParcela,
      total: grupo.total_parcelas,
      competencia: comp,
      vencimento,
      valor: grupo.valor_parcela,
      status
    });
  }
  
  return { ...grupo, parcelas_lista: parcelas };
}

export function atualizarValorPessoaDivida(idStr, novoValor) {
  const db = getDatabase();
  
  if (isNaN(novoValor) || novoValor <= 0) {
    throw new Error('Valor inválido');
  }

  if (String(idStr).startsWith('dp_')) {
    const grupoId = Number(String(idStr).replace('dp_', ''));
    if (isNaN(grupoId)) throw new Error('ID de grupo inválido');
    const grupo = db.prepare('SELECT id, nome_pessoa, motivo FROM dividas_parceladas_grupos WHERE id = ?').get(grupoId);
    if (!grupo) throw new Error('Dívida parcelada não encontrada');
    
    db.prepare(`
      UPDATE dividas_parceladas_grupos 
      SET valor_parcela = ?, atualizado_em = datetime('now', 'localtime') 
      WHERE id = ?
    `).run(novoValor, grupoId);
    
    registrarAuditoria('DIVIDA_PARCELADA_VALOR_ATUALIZAR', `Valor da parcela do grupo ${grupoId} (${grupo.nome_pessoa} - ${grupo.motivo}) atualizado para ${novoValor}`);
    return { sucesso: true };
  } else {
    const id = Number(idStr);
    if (isNaN(id)) throw new Error('ID inválido');
    const registro = db.prepare('SELECT id, nome_pessoa, motivo FROM pessoas_dividas WHERE id = ?').get(id);
    if (!registro) throw new Error('Registro não encontrado');
    
    db.prepare(`
      UPDATE pessoas_dividas 
      SET valor = ?, atualizado_em = datetime('now', 'localtime') 
      WHERE id = ?
    `).run(novoValor, id);
    
    registrarAuditoria('PESSOAS_DIVIDAS_VALOR_ATUALIZAR', `Valor do registro ${id} (${registro.nome_pessoa} - ${registro.motivo}) atualizado para ${novoValor}`);
    return { sucesso: true };
  }
}

