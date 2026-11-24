# Chat: bloqueio por responsável e logs na conversa

Aprovado pelo Gabriel em 2026-11-24. Referência: código do `liderhub-web-app` (`chat-status-gate`, `attendance-gate`).

**Por quê:** com vários membros, cada atendimento precisa de um dono claro e cada mudança precisa ficar visível na conversa.

**Bloqueio do campo de mensagem** (na tela e no servidor; nota interna sempre livre):

| Situação | Saídas |
|---|---|
| Aberto, sou o responsável | livre |
| Aberto, de outra pessoa | Alterar responsável (para mim); quem não é membro só tem a intervenção pontual |
| Pendente ou fechado | Abrir atendimento, Intervenção pontual |

- Clicar num pendente não o abre. Quem abre vira o responsável (substitui "na primeira abertura vale o do lead").
- Intervenção pontual: uma mensagem, sem mudar estado nem responsável. Enviar pelo painel não reabre; pelo celular, reabre.

**Logs:** linha em `messages` com `direction = 'log'`, `meta.log = { field, from, to }` e `sent_by` = quem mudou (nulo = Sistema). Campos: estado, responsável e status. Não mexem em prévia nem em não lidas, e ficam fora do MCP e da sugestão de resposta.

**Painel:** sai a 1ª resposta; a conexão aparece só pelo nome, sem provedor nem número.

**Abordagens:** gatilho no banco (escolhida: pega webhook e celular, na mesma transação); gravar nas ações do painel (perde as automáticas); montar de `responsible_events` (não usa a mensagem).

**Publicação:** 0031 (antes do código) → código → 0032 (liga o gatilho). O código antigo mostraria o log como mensagem do cliente. Como `db:migrate` aplica tudo o que falta, tire a 0032 da pasta na primeira rodada.

**Fora do escopo:** IA, times, grupos e motivos de fechamento do LíderHub.
