# Puzoto Life — Guia de Inicialização e Uso Diário

Este documento contém todas as instruções necessárias para iniciar, gerenciar e usar o sistema localmente no Windows.

---

## 🚀 Como abrir o sistema

**Opção 1 (Uso Diário Automático):**
Se você instalou a inicialização automática, basta ligar o computador e clicar no **ícone fixado na barra de tarefas** (o PWA do navegador abrirá o `localhost:5174`). Os servidores iniciam invisíveis em segundo plano.

**Opção 2 (Manual):**
Clique duas vezes no arquivo `start_puzoto_life.bat` na raiz do projeto, ou `local-tools\iniciar_puzoto_life.bat`.

---

## ⚙️ Gerenciamento e Ferramentas (Pasta `local-tools`)

- **Instalar inicialização automática:** Execute `local-tools\instalar_inicializacao_windows.bat` (configura o Agendador de Tarefas do Windows para ligar os servidores ao fazer login, de forma invisível).
- **Verificar status:** Execute `local-tools\status_puzoto_life.bat` (mostra se as portas 3210 e 5174 estão ativas).
- **Parar o sistema:** Execute `local-tools\parar_puzoto_life.bat`.
- **Remover inicialização automática:** Execute `local-tools\remover_inicializacao_windows.bat`.

---

## 💾 Backups e Dados

- **Onde fica o banco de dados:** `data/puzoto_life.db`
- **Onde ficam os backups criados:** `data/backups/database`
- **Como criar backup:** Acesse o menu **Sistema > Backup** e clique em "Criar Backup Agora".
- **Como restaurar backup:** Acesse o menu **Sistema > Backup**, escolha o backup na lista e clique no ícone circular de restauração. Digite RESTAURAR para confirmar.
- **Como limpar dados de teste:** Acesse **Sistema > Configurações**, desça até a "Zona de Segurança", clique em "Limpar Dados de Teste" e digite CONFIRMAR. Isso apagará lançamentos, laudos, auditorias e notas fiscais, preservando configurações e empresas.

---

## ⚠️ NÃO APAGAR

As seguintes pastas e arquivos são o "coração" do sistema e **nunca** devem ser deletados:

- `data/` (Contém seu banco de dados, backups e arquivos exportados)
- `data/puzoto_life.db` (Seu banco principal!)
- `data/backups/`
- `local-tools/` (Scripts de inicialização)
- `package.json`
- `server/` (Backend)
- `src/` (Frontend)

---

## 📅 ROTINA RECOMENDADA

Para manter as finanças e o trabalho perfeitamente em dia:

1. **Abrir o Puzoto Life** pelo ícone fixado na barra de tarefas.
2. **Lançar exames do dia** (Trabalho > Lançamentos Diários).
3. **Fechar o Dia** ao fim do expediente para consolidar os ganhos.
4. **Conferir Histórico e Recebimentos** (marcar como recebido o que já caiu na conta).
5. **Registrar gastos/receitas** diretamente nas abas de Finanças (Cartões, Contas a Pagar).
6. **Criar backup semanal** (Sistema > Backup).
7. **Rodar Diagnóstico** (Sistema > Diagnóstico) se algo parecer errado ou lento.
