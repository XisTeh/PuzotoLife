# Puzoto Life — Guia de Acesso e Uso Diário

O Puzoto Life funciona pela internet com Supabase, PostgreSQL e Vercel. O computador não precisa iniciar servidores locais para o uso diário.

---

## 🚀 Como abrir

Abra [https://puzoto-life.vercel.app/](https://puzoto-life.vercel.app/) ou clique no ícone do PWA instalado no computador ou celular. Entre com a conta do proprietário.

Não é necessário executar arquivo `.bat`, `.vbs`, terminal, backend local ou tarefa agendada ao ligar o Windows.

---

## 🧰 Desenvolvimento local

Somente para desenvolver e testar código, use Node.js 24, execute `npm ci` e depois `npm run dev:all`. Esse ambiente usa o loopback e não deve iniciar automaticamente com o Windows. Testes usam bancos temporários e nunca a base pessoal.

---

## 💾 Backups e dados

- **Fonte de verdade em produção:** PostgreSQL no Supabase.
- **Arquivos privados:** bucket privado do Supabase.
- **Como exportar:** acesse **Sistema > Backup** e faça a exportação JSON consistente.
- **Restauração:** siga o procedimento documentado e valide o rollback antes de substituir qualquer estado. A importação pela interface permanece restrita enquanto não houver validação específica para a nuvem.
- **Dados locais:** `Info/` e `data/` são privados e servem ao histórico, desenvolvimento ou recuperação controlada. Não os use como substitutos silenciosos da base de produção.

---

## ⚠️ Segurança

Não compartilhe senha, cookies, `.env`, conexão do banco ou exportações. Não altere a base Supabase diretamente e não execute testes contra ela. Preserve os diretórios privados `Info/` e `data/` para recuperação controlada.

Se o aplicativo não abrir, confirme a conexão com a internet e acesse diretamente [https://puzoto-life.vercel.app/](https://puzoto-life.vercel.app/). O problema não deve ser resolvido iniciando servidores locais no Windows.

---

## 📅 ROTINA RECOMENDADA

Para manter as finanças e o trabalho perfeitamente em dia:

1. **Abrir o Puzoto Life** pelo endereço publicado ou pelo ícone do PWA.
2. **Lançar exames do dia** (Trabalho > Lançamentos Diários).
3. **Fechar o Dia** ao fim do expediente para consolidar os ganhos.
4. **Conferir Histórico e Recebimentos** (marcar como recebido o que já caiu na conta).
5. **Registrar gastos/receitas** diretamente nas abas de Finanças (Cartões, Contas a Pagar).
6. **Criar backup semanal** (Sistema > Backup).
7. **Rodar Diagnóstico** (Sistema > Diagnóstico) se algo parecer errado ou lento.
