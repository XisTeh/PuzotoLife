/**
 * Página de Ajuda e Manual de Uso
 * Tela informativa — não altera dados, módulos ou regras.
 */

export function renderAjudaPage() {
  setTimeout(() => {
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }, 100);

  const sections = [
    {
      icon: 'clipboard-list',
      color: '#14b8a6',
      title: '1. Rotina diária de trabalho',
      items: [
        'Acesse <strong>Trabalho &gt; Lançamentos</strong>.',
        'Lance os exames digitados do dia, escolhendo empresa, quantidade e valor.',
        'Confira o Lote Temporário Pendente.',
        'Clique em <strong>Fechar o Dia</strong>.',
        'Os lançamentos vão para <strong>Histórico e Recebimentos</strong>.',
        'Só marque como recebido quando o dinheiro realmente cair.'
      ],
      alert: '<strong>Observação destacada:</strong> Produzido não é a mesma coisa que recebido.',
      alertColor: '#f59e0b'
    },
    {
      icon: 'users',
      color: '#3b82f6',
      title: '2. Empresas e pagadores',
      description: 'As <strong>empresas</strong> indicam onde o exame foi produzido.<br>Os <strong>pagadores</strong> indicam quem realmente paga você.',
      items: [
        'Diagnóstico, Perfecta e E-Mail são agrupados no Dr. Alexandre.',
        'Dr. Alexandre paga como PF sem nota por enquanto.',
        'Dr. Ranon / RX exige controle de nota fiscal.',
        'Padrão é um pagador separado.',
        'Os dados dos pagadores ficam em <strong>Sistema &gt; Configurações &gt; Pagadores</strong>.'
      ],
      alert: '<strong>Importante:</strong> Os campos de e-mail, telefone e CPF/CNPJ em Pagadores são dados de quem paga você, não seus dados.<br><br>Seus dados/Puzoto ficam em: <strong>Sistema &gt; Configurações &gt; Nota Fiscal / Impostos</strong>.',
      alertColor: '#3b82f6'
    },
    {
      icon: 'stethoscope',
      color: '#06b6d4',
      title: '3. Dr. Ranon / RX',
      items: [
        'Acesse <strong>Trabalho &gt; Dr. Ranon / RX</strong>.',
        'Lance os registros dos pacientes.',
        'Exporte o Excel quando precisar conferir ou enviar.',
        'Use <strong>Salvar Planilha Definitiva</strong> quando fechar o mês/referência.',
        'O módulo Dr. Ranon / RX também alimenta a área de Notas Fiscais.',
        'As notas fiscais são controle interno até a emissão oficial.'
      ]
    },
    {
      icon: 'check-square',
      color: '#10b981',
      title: '4. Histórico e recebimentos',
      items: [
        'Acesse <strong>Trabalho &gt; Histórico e Recebimentos</strong>.',
        'Veja o que foi produzido e o que ainda falta receber.',
        'Use a visão por pagador para entender quem deve pagar.',
        'Quando receber, marque como recebido.',
        'O sistema cria receita automaticamente em <strong>Finanças &gt; Receitas</strong>.',
        'O sistema evita receita duplicada quando possível.'
      ]
    },
    {
      icon: 'wallet',
      color: '#8b5cf6',
      title: '5. Finanças',
      listType: 'ul',
      items: [
        '<strong>Gastos:</strong> despesas do dia a dia.',
        '<strong>Cartões:</strong> compras parceladas, faturas e limites.',
        '<strong>Contas a Pagar:</strong> boletos, aluguel, internet, contas fixas.',
        '<strong>Pessoas / Dívidas:</strong> valores entre você e outras pessoas.',
        '<strong>Receitas:</strong> entradas manuais ou automáticas.'
      ],
      alert: '<strong>Observação:</strong> Use as receitas automáticas do trabalho quando marcar recebimentos. Não lance duas vezes o mesmo valor.',
      alertColor: '#8b5cf6'
    },
    {
      icon: 'file-text',
      color: '#a855f7',
      title: '6. Notas fiscais e impostos',
      description: 'A tela <strong>Finanças &gt; Notas Fiscais</strong> serve para controle interno de notas, impostos estimados e prévias. Ela permite:',
      listType: 'ul',
      items: [
        'gerar previsão de nota;',
        'simular impostos;',
        'marcar nota como emitida no controle interno;',
        'cancelar nota no controle interno;',
        'abrir prévia;',
        'baixar PDF interno.'
      ],
      alert: '<strong>Aviso obrigatório:</strong> A prévia/PDF não é uma NFS-e oficial. Ela é apenas um documento interno de conferência.<br><br>A emissão oficial deve ser feita no sistema autorizado da prefeitura ou NFS-e Nacional.',
      alertColor: '#ef4444'
    },
    {
      icon: 'settings',
      color: '#64748b',
      title: '7. Configurações fiscais',
      description: 'Em <strong>Sistema &gt; Configurações &gt; Nota Fiscal / Impostos</strong> ficam seus dados e dados da Puzoto. Ali você configura:',
      listType: 'ul',
      items: [
        'Nome/Razão Social do prestador;',
        'CPF/CNPJ;',
        'Município de emissão e Inscrição Municipal;',
        'CNAE e Código de serviço;',
        'Regime tributário e alíquotas estimadas;',
        'Conta de recebimento da nota.'
      ],
      alert: '<strong>Observação:</strong> Os impostos exibidos no Puzoto Life são estimativas. Confirme alíquotas, CNAE e regras fiscais com seu contador.',
      alertColor: '#f59e0b'
    },
    {
      icon: 'database',
      color: '#f59e0b',
      title: '8. Backup',
      description: 'Antes de grandes alterações, sempre crie um backup manual. Rotina recomendada:',
      items: [
        'Criar backup semanalmente.',
        'Criar backup antes de importar dados.',
        'Criar backup antes de restaurar.',
        'Nunca apagar a pasta <code>data</code>.',
        'Nunca apagar <code>data/puzoto_life.db</code>.',
        'Nunca apagar <code>data/backups</code>.'
      ]
    },
    {
      icon: 'download-cloud',
      color: '#06b6d4',
      title: '9. Importar dados',
      description: 'Use <strong>Sistema &gt; Importar Dados</strong> para importar arquivos JSON exportados pelo próprio Puzoto Life. O sistema:',
      listType: 'ul',
      items: [
        'valida o arquivo;',
        'mostra prévia;',
        'cria backup antes de importar;',
        'evita duplicados quando configurado.'
      ],
      alert: '<strong>Atenção:</strong> Importe apenas arquivos confiáveis do próprio Puzoto Life.',
      alertColor: '#06b6d4'
    },
    {
      icon: 'shield',
      color: '#ef4444',
      title: '10. Limpeza de dados de teste',
      description: 'A limpeza de dados de teste fica em: <strong>Sistema &gt; Configurações &gt; Zona de Segurança</strong>.<br>Ela remove dados operacionais de teste, mas preserva configurações, empresas, categorias, pagadores, backups e estrutura do sistema.',
      items: [
        'A limpeza exige digitar: <strong>LIMPAR TESTES</strong>',
        'Cria backup automático antes.'
      ]
    },
    {
      icon: 'activity',
      color: '#ec4899',
      title: '11. Diagnóstico',
      description: 'Use <strong>Sistema &gt; Diagnóstico</strong> quando algo parecer errado. O ideal é manter 0 erros e 0 alertas. O diagnóstico verifica:',
      listType: 'ul',
      items: [
        'backend e banco;',
        'tabelas e configurações;',
        'pastas e integridade dos dados.'
      ]
    },
    {
      icon: 'power',
      color: '#22c55e',
      title: '12. Inicialização automática',
      description: 'O Puzoto Life foi configurado para iniciar com o Windows. Fluxo normal:',
      items: [
        'Ligue o computador.',
        'Aguarde alguns segundos.',
        'Clique no ícone fixado do Puzoto Life na barra de tarefas.',
        'O sistema deve abrir funcionando.'
      ],
      alert: '<strong>Se não abrir:</strong><br>1. Execute <code>local-tools/status_puzoto_life.bat</code><br>2. Verifique se backend e frontend estão online.<br>3. Se necessário, execute <code>local-tools/iniciar_puzoto_life.bat</code>.',
      alertColor: '#22c55e'
    }
  ];

  const cardsHtml = sections.map((s, i) => `
    <div class="form-card animate-in" style="padding: 24px; animation-delay: ${i * 0.04}s;">
      <div style="display: flex; gap: 16px; align-items: flex-start;">
        <div style="
          width: 44px; height: 44px; border-radius: 10px; flex-shrink: 0;
          background: ${s.color}15; display: flex; align-items: center; justify-content: center;
        ">
          <i data-lucide="${s.icon}" style="width: 22px; height: 22px; color: ${s.color};"></i>
        </div>
        <div style="flex: 1; min-width: 0;">
          <h3 style="font-weight: 600; color: var(--text-primary); margin-bottom: ${s.description ? '8px' : '14px'}; font-size: 1.05rem;">${s.title}</h3>
          ${s.description ? `<p style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 12px; line-height: 1.5;">${s.description}</p>` : ''}
          <${s.listType === 'ul' ? 'ul' : 'ol'} style="
            list-style: ${s.listType === 'ul' ? 'disc' : 'none'}; padding: ${s.listType === 'ul' ? '0 0 0 16px' : '0'}; margin: 0;
            display: flex; flex-direction: column; gap: 8px;
          ">
            ${s.items.map((item, j) => `
              <li style="
                ${s.listType === 'ul' ? '' : 'display: flex; gap: 10px; align-items: flex-start;'}
                font-size: 0.9rem; color: var(--text-secondary); line-height: 1.5;
              ">
                ${s.listType === 'ul' ? '' : `<span style="
                  width: 22px; height: 22px; border-radius: 6px; flex-shrink: 0;
                  background: var(--bg-surface); border: 1px solid var(--border-subtle);
                  display: flex; align-items: center; justify-content: center;
                  font-size: 0.7rem; font-weight: 700; color: var(--text-muted); margin-top: 1px;
                ">${j + 1}</span>`}
                <span>${item}</span>
              </li>
            `).join('')}
          </${s.listType === 'ul' ? 'ul' : 'ol'}>
          
          ${s.alert ? `
            <div style="
              margin-top: 16px; padding: 12px; border-radius: 6px; font-size: 0.85rem; line-height: 1.5;
              background: ${s.alertColor}15; color: ${s.alertColor}; border: 1px solid ${s.alertColor}40;
            ">
              ${s.alert}
            </div>
          ` : ''}
        </div>
      </div>
    </div>
  `).join('');

  return `
    <div class="page-header animate-in">
      <h1 class="page-header__title">Ajuda e Manual de Uso</h1>
      <p class="page-header__subtitle">Guia rápido para usar o Puzoto Life no dia a dia.</p>
    </div>

    <div style="
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(420px, 1fr));
      gap: 16px;
    ">
      ${cardsHtml}

      <!-- 13. O que nunca apagar -->
      <div class="form-card animate-in" style="padding: 24px; animation-delay: 0.5s; border-color: var(--color-danger);">
        <div style="display: flex; gap: 16px; align-items: flex-start;">
          <div style="width: 44px; height: 44px; border-radius: 10px; flex-shrink: 0; background: #ef444415; display: flex; align-items: center; justify-content: center;">
            <i data-lucide="alert-triangle" style="width: 22px; height: 22px; color: var(--color-danger);"></i>
          </div>
          <div style="flex: 1; min-width: 0;">
            <h3 style="font-weight: 600; color: var(--color-danger); margin-bottom: 8px; font-size: 1.05rem;">13. O que NUNCA apagar</h3>
            <p style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 12px; line-height: 1.5;">A pasta data contém o banco e backups. Se apagar sem backup, você pode perder seus dados.</p>
            <ul style="list-style: disc; padding-left: 16px; margin: 0; display: flex; flex-direction: column; gap: 6px; font-size: 0.9rem; color: var(--text-secondary);">
              <li><code>data/</code></li>
              <li><code>data/puzoto_life.db</code></li>
              <li><code>data/backups/</code></li>
              <li><code>server/</code></li>
              <li><code>src/</code></li>
              <li><code>local-tools/</code></li>
              <li><code>package.json</code> e <code>package-lock.json</code></li>
            </ul>
          </div>
        </div>
      </div>

      <!-- 14. Rotina recomendada -->
      <div class="form-card animate-in" style="padding: 24px; animation-delay: 0.54s; border-color: var(--color-teal); grid-column: 1 / -1;">
        <div style="display: flex; gap: 16px; align-items: flex-start;">
          <div style="width: 44px; height: 44px; border-radius: 10px; flex-shrink: 0; background: #14b8a615; display: flex; align-items: center; justify-content: center;">
            <i data-lucide="check-circle" style="width: 22px; height: 22px; color: var(--color-teal);"></i>
          </div>
          <div style="flex: 1; min-width: 0;">
            <h3 style="font-weight: 600; color: var(--color-teal); margin-bottom: 14px; font-size: 1.05rem;">14. Rotina Recomendada</h3>
            <ol style="list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px;">
              <li style="display: flex; gap: 10px; align-items: flex-start; font-size: 0.9rem; color: var(--text-secondary); line-height: 1.5;">
                <span style="width: 22px; height: 22px; border-radius: 6px; flex-shrink: 0; background: var(--bg-surface); border: 1px solid var(--border-subtle); display: flex; align-items: center; justify-content: center; font-size: 0.7rem; font-weight: 700; color: var(--text-muted);">1</span>
                <span>Abrir Puzoto Life pelo ícone fixado.</span>
              </li>
              <li style="display: flex; gap: 10px; align-items: flex-start; font-size: 0.9rem; color: var(--text-secondary); line-height: 1.5;">
                <span style="width: 22px; height: 22px; border-radius: 6px; flex-shrink: 0; background: var(--bg-surface); border: 1px solid var(--border-subtle); display: flex; align-items: center; justify-content: center; font-size: 0.7rem; font-weight: 700; color: var(--text-muted);">2</span>
                <span>Lançar exames do dia.</span>
              </li>
              <li style="display: flex; gap: 10px; align-items: flex-start; font-size: 0.9rem; color: var(--text-secondary); line-height: 1.5;">
                <span style="width: 22px; height: 22px; border-radius: 6px; flex-shrink: 0; background: var(--bg-surface); border: 1px solid var(--border-subtle); display: flex; align-items: center; justify-content: center; font-size: 0.7rem; font-weight: 700; color: var(--text-muted);">3</span>
                <span>Fechar o Dia.</span>
              </li>
              <li style="display: flex; gap: 10px; align-items: flex-start; font-size: 0.9rem; color: var(--text-secondary); line-height: 1.5;">
                <span style="width: 22px; height: 22px; border-radius: 6px; flex-shrink: 0; background: var(--bg-surface); border: 1px solid var(--border-subtle); display: flex; align-items: center; justify-content: center; font-size: 0.7rem; font-weight: 700; color: var(--text-muted);">4</span>
                <span>Conferir Histórico e Recebimentos.</span>
              </li>
              <li style="display: flex; gap: 10px; align-items: flex-start; font-size: 0.9rem; color: var(--text-secondary); line-height: 1.5;">
                <span style="width: 22px; height: 22px; border-radius: 6px; flex-shrink: 0; background: var(--bg-surface); border: 1px solid var(--border-subtle); display: flex; align-items: center; justify-content: center; font-size: 0.7rem; font-weight: 700; color: var(--text-muted);">5</span>
                <span>Registrar gastos importantes.</span>
              </li>
              <li style="display: flex; gap: 10px; align-items: flex-start; font-size: 0.9rem; color: var(--text-secondary); line-height: 1.5;">
                <span style="width: 22px; height: 22px; border-radius: 6px; flex-shrink: 0; background: var(--bg-surface); border: 1px solid var(--border-subtle); display: flex; align-items: center; justify-content: center; font-size: 0.7rem; font-weight: 700; color: var(--text-muted);">6</span>
                <span>Marcar recebimentos somente quando o dinheiro cair.</span>
              </li>
              <li style="display: flex; gap: 10px; align-items: flex-start; font-size: 0.9rem; color: var(--text-secondary); line-height: 1.5;">
                <span style="width: 22px; height: 22px; border-radius: 6px; flex-shrink: 0; background: var(--bg-surface); border: 1px solid var(--border-subtle); display: flex; align-items: center; justify-content: center; font-size: 0.7rem; font-weight: 700; color: var(--text-muted);">7</span>
                <span>Gerar previsão de nota quando necessário.</span>
              </li>
              <li style="display: flex; gap: 10px; align-items: flex-start; font-size: 0.9rem; color: var(--text-secondary); line-height: 1.5;">
                <span style="width: 22px; height: 22px; border-radius: 6px; flex-shrink: 0; background: var(--bg-surface); border: 1px solid var(--border-subtle); display: flex; align-items: center; justify-content: center; font-size: 0.7rem; font-weight: 700; color: var(--text-muted);">8</span>
                <span>Criar backup semanal.</span>
              </li>
              <li style="display: flex; gap: 10px; align-items: flex-start; font-size: 0.9rem; color: var(--text-secondary); line-height: 1.5;">
                <span style="width: 22px; height: 22px; border-radius: 6px; flex-shrink: 0; background: var(--bg-surface); border: 1px solid var(--border-subtle); display: flex; align-items: center; justify-content: center; font-size: 0.7rem; font-weight: 700; color: var(--text-muted);">9</span>
                <span>Rodar Diagnóstico se algo parecer errado.</span>
              </li>
            </ol>
          </div>
        </div>
      </div>

    </div>

    <div class="form-card animate-in" style="padding: 20px; margin-top: 16px; animation-delay: 0.6s; text-align: center;">
      <p style="color: var(--text-muted); font-size: 0.85rem; margin: 0;">
        Puzoto Life v1.0.0 — Desenvolvido para uso pessoal e profissional.
      </p>
    </div>
  `;
}
