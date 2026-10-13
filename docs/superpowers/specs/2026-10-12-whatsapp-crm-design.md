# CRM de WhatsApp — Painel de Contato Unificado, Etapa Manual e Notas — Design

**Data:** 2026-10-12
**Status:** Aprovado, pronto para plano de implementação

## Contexto

O Funil WhatsApp (ver `2026-10-12-whatsapp-kanban-agenda-design.md`) hoje é só leitura:
a etapa de cada contato é 100% calculada a partir de mensagens, agendamento e venda —
decisão deliberada na época ("só automático, sem arrastar card"). Depois de usar o
sistema no dia a dia, o dono da agência pediu mais: ele quer que isso funcione como um
CRM de verdade — citou o Kommo/amoCRM como referência (ferramenta comum no Brasil pra
vendas via WhatsApp, com pipeline e conversa integrados na mesma tela).

Esse documento cobre o que falta pra isso: poder mover um lead manualmente quando o
cálculo automático não reflete a realidade, anotar observações sobre o contato que não
são mensagem, e ver o histórico da pessoa (conversa + venda + agendamento) num lugar só
em vez de espalhado em telas diferentes.

## Objetivo

1. Deixar quem usa o painel admin ou o `/caixa` mover manualmente um contato pra outra
   coluna do Funil, quando o cálculo automático não bate com a realidade.
2. Garantir que um evento real novo (mensagem, agendamento, venda) sempre volta a valer
   sobre um ajuste manual antigo — a etapa nunca fica "presa" errada pra sempre.
3. Deixar registrar anotações de texto livre sobre o contato (preferências, combinados),
   separadas das mensagens de WhatsApp.
4. Mostrar, num painel só, o histórico completo de um contato: mensagens, venda(s) e
   agendamento, ordenados por data.
5. Ter o mesmo painel disponível tanto no painel admin quanto no `/caixa` — quem atende
   o cliente tem a mesma visão completa que o admin.

## Decisões já validadas com o cliente

- **Evento real sempre vence sobre ajuste manual.** Mover um card na mão é um ajuste
  pontual, não uma trava permanente — assim que chega mensagem nova, agendamento novo
  ou venda nova pra aquele contato, a etapa calculada automaticamente volta a valer.
- **Admin e `/caixa` podem os dois** mover etapa e escrever anotação — não é uma
  capacidade só do admin.
- **Botão "Mover para...", não arrastar e soltar.** Mais simples de construir, funciona
  melhor em touch (tablet/celular no caixa) e não exige biblioteca nova.
- **Painel de contato único e reaproveitável** — conversa, histórico e anotações juntos
  numa peça só, usada tanto ao abrir uma conversa quanto ao clicar num card do Funil
  (como janela por cima, nos dois lugares — admin e `/caixa`).

## Arquitetura

### Dados (3 colunas novas, aditivas, em `whatsapp_contacts`)

```
whatsapp_contacts
  + notes TEXT NULL                      -- anotação livre, substituída inteira a cada salvamento
  + manual_stage TEXT NULL               -- uma das 6 chaves de etapa, ou null (= automático)
  + manual_stage_set_at TIMESTAMPTZ NULL -- só pra auditoria/debug, não usado em lógica
```

Aplicadas via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, no mesmo bloco aditivo já
usado em `backend/src/config/db.js`.

### Regra: quando `manual_stage` vale, e quando é limpo

Na leitura do Funil (`GET /api/whatsapp/kanban`): se `manual_stage` estiver preenchido,
a etapa exibida é ele; senão, é o resultado de `computeStage(...)` (sem mudança na
lógica pura existente em `whatsappStage.js` — o override acontece na camada do
controller, não dentro da função pura).

`manual_stage` (e `manual_stage_set_at`) são **limpos automaticamente** (voltam a
`NULL`) sempre que um dos três eventos reais acontece pra aquele contato:
- Mensagem nova, recebida ou enviada — em `whatsappIngest.js` (webhook oficial e
  Baileys) e em `replyToConversation` (resposta pelo painel).
- Agendamento novo — em `setAppointment`.
- Venda nova vinculada a um contato — em `createConversion`, só quando `contactId`
  não é nulo (venda sem contato encontrado não tem o que limpar).

### Histórico unificado

Rota nova `GET /api/whatsapp/contacts/:contactId/timeline` junta três fontes num só
array, ordenado por data decrescente (mais recente primeiro — é um feed de atividade,
diferente da conversa em si, que continua em ordem cronológica crescente):

- Mensagens (`whatsapp_messages`): `{ type: 'message', occurredAt, direction, body }`
- Venda(s) (`real_conversions` do contato): `{ type: 'sale', occurredAt, amountSpent }`
- Agendamento atual (`whatsapp_contacts.appointment_at`, se preenchido — só o valor
  atual, sem histórico de reagendamentos, mesma limitação já aceita no design do
  Funil original): `{ type: 'appointment', occurredAt }`

### Backend — 3 rotas novas, 1 rota e 2 pontos de gravação ajustados

- `PATCH /api/whatsapp/contacts/:contactId/stage` — corpo `{ stage }`, onde `stage` é
  uma das 6 chaves (`novo_lead`, `em_atendimento`, `agendado`, `nao_compareceu`,
  `compareceu`, `remarketing`) ou `null` (volta a automático). Grava
  `manual_stage`/`manual_stage_set_at`. Mesmo padrão de `resolveClientId` e checagem de
  posse (`WHERE id = ? AND client_id = ?`) que `setAppointment` já usa.
- `PATCH /api/whatsapp/contacts/:contactId/notes` — corpo `{ notes }` (string, pode ser
  vazia pra apagar). Substitui o valor inteiro, sem histórico de versões.
- `GET /api/whatsapp/contacts/:contactId/timeline` — monta e devolve o histórico
  descrito acima.
- `getKanban` (rota já existente) passa a trazer e aplicar `manual_stage`.
- `ingestWhatsAppEvent`, `replyToConversation`, `setAppointment` e `createConversion`
  passam a limpar `manual_stage` como descrito acima.

Todas as rotas novas aceitam token de admin, client ou staff (`/caixa`), igual
kanban/agenda/appointment já aceitam hoje.

### Frontend — painel de contato único + integração nos dois Funis

- **`ContactDetailPanel` (componente novo e reaproveitável)** — recebe o cliente HTTP
  (`axios` global no admin, `caixaApi` no `/caixa`) e o contato selecionado. Três
  seções: **Conversa** (reaproveita a lógica de mensagens/resposta que já existe),
  **Histórico** (consome a rota de timeline), **Anotações** (textarea, salva com botão).
  No topo, nome/telefone/etapa atual + um seletor **"Mover para..."** (as 6 etapas +
  "Automático") e os botões já existentes "Lançar venda"/"Marcar agendamento".
- **`CaixaChatView.jsx`** (já em construção nesta sessão): o painel direito, ao
  selecionar um contato, passa a ser este `ContactDetailPanel` (substituindo a versão
  só-conversa que tinha sido feita antes dessa conversa escalar pra CRM de verdade).
- **`CaixaFunilView.jsx`** e **`WhatsAppKanbanPage.jsx`** (admin): cards do Funil
  passam a ser clicáveis, abrindo o `ContactDetailPanel` como uma janela por cima
  (modal), em vez do botão "Ver conversa" que só linkava pra uma tela separada.
- **`WhatsAppAgendaPage.jsx`** e a aba de Agenda do `/caixa`: o botão "Ver conversa"
  também passa a abrir esse mesmo painel em modal, em vez de navegar pra outra aba.
- A tela de inbox do admin (`WhatsAppInboxPage.jsx`) **não muda** — continua existindo
  como está, como uma visão separada de "todas as conversas"; o painel novo é adicional,
  não substitui essa tela.

## Fora de escopo (v1)

- Histórico de reagendamentos (mesma limitação já aceita no Funil original) —
  `appointment_at` continua guardando só o valor atual.
- Histórico de versões das anotações — cada salvamento substitui o texto inteiro.
- Arrastar e soltar — fica como ideia pra uma v2, se o botão "Mover para..." não for
  suficiente no dia a dia.
- Múltiplos pipelines ou etapas customizáveis por cliente — as 6 etapas continuam
  fixas e iguais pra todos os clientes.
- Notificação/alerta quando um contato é movido manualmente ou recebe anotação.
