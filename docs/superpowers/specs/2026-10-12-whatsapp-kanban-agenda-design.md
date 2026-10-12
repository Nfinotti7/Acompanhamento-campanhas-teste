# Funil WhatsApp (Kanban) + Agenda de Agendamentos — Design

**Data:** 2026-10-12
**Status:** Aprovado, pronto para plano de implementação

## Contexto

O módulo de WhatsApp (caixa de entrada + lançamento de conversão real, ver
`2026-09-28-whatsapp-conversion-tracking-design.md`) já está em produção: contatos
chegam via Click-to-WhatsApp Ads ou orgânico, trocam mensagens, e o caixa do
restaurante lança nome + valor gasto em `/caixa` quando a pessoa aparece.

O que falta é **visualizar o funil** desses contatos (quem está em qual etapa: acabou
de chegar, está sendo atendido, agendou, não apareceu, apareceu, ou esfriou) e
**saber o que foi agendado e para quando**, sem precisar abrir conversa por conversa.
Esta fatia nasceu de uma lista de ideias do dono da agência (ver gravação de áudio de
2026-10-08) e cobre duas coisas: um quadro Kanban com etapas calculadas automaticamente,
e um campo de agendamento usado pelo caixa que alimenta uma agenda por dia.

Duas ideias adicionais levantadas na mesma conversa ficam de fora deste design:
- **Upload de CSV + IA para preencher gasto em lote** — alternativa ao lançamento
  manual no `/caixa`, que já funciona hoje. Não há necessidade dela agora.
- **API de Coexistência da Meta** (usar o número já ativo no WhatsApp Business App do
  cliente em vez de um chip dedicado) — investigada e descartada por ora: exige
  cadastro da agência como Tech Provider da Meta ou uso de um BSP terceirizado (custo
  por mensagem), contra a integração direta e gratuita que já está funcionando com o
  número dedicado.

## Objetivo

1. Mostrar, por cliente (restaurante), em qual etapa do funil cada contato de WhatsApp
   está — sem exigir que alguém mova nada manualmente.
2. Permitir que o caixa marque um agendamento (dia/hora) para um contato, direto do
   `/caixa`, e que isso mova o contato automaticamente para a etapa "Agendado".
3. Detectar automaticamente quem não apareceu (agendou e a data passou sem lançamento
   de venda) e quem esfriou (sem resposta/agendamento depois de um prazo configurável).
4. Dar ao admin/dono uma visão de agenda por dia: todos os agendamentos daquela data,
   de qualquer contato de qualquer cliente que ele tenha acesso.

## Restrição inegociável

Mesma restrição do módulo de WhatsApp original: **nada em produção pode quebrar**.
Isso é tratado como extensão aditiva — duas colunas novas em tabelas já existentes
(nenhuma com `NOT NULL` sem default, nenhuma muda de significado), três rotas novas,
duas telas novas no painel admin, um ajuste aditivo no `/caixa`. Nenhuma tabela, rota
ou tela existente é alterada em comportamento.

## Decisões já validadas com o cliente

- **Etapa do Kanban é calculada, não armazenada.** Não existe coluna `stage` nem job
  agendado (cron) rodando no servidor — hoje não há nenhum mecanismo de agendamento de
  tarefas no backend, e criar um só para isso seria complexidade desnecessária. Toda
  vez que a tela do Kanban carrega, o backend deriva a etapa de cada contato a partir
  dos dados que já existem (mensagens, agendamento, conversão real). Isso também
  significa que o quadro nunca fica desatualizado.
- **V1 é só leitura automática — sem arrastar card.** Se no futuro a equipe precisar
  forçar manualmente uma etapa (ex: "esse contato desistiu, ignora"), isso entra depois
  como override explícito. Não faz parte deste design.
- **Campo de agendamento mora no `/caixa`**, não na caixa de entrada do admin. É a
  pessoa do caixa quem responde o WhatsApp (pelo celular dela, fora do sistema) e quem
  já usa o `/caixa` para lançar venda — o agendamento é a mesma pessoa, mesmo fluxo,
  só uma ação nova ao lado de "Lançar venda".
- **Agenda é só leitura, seletor de dia + lista** — não uma grade visual de mês/semana
  tipo Google Calendar de verdade. Mais simples de construir agora; dá pra evoluir pra
  uma grade visual depois sem redesenho dos dados.
- **Prazo de remarketing: 3 dias por padrão**, configurável por cliente no banco
  (sem tela de configuração em v1 — ajuste é direto na coluna, igual outras
  credenciais hoje).

## Arquitetura

### Dados (duas colunas novas, aditivas, nenhuma tabela nova)

```
whatsapp_contacts
  + appointment_at TIMESTAMP NULL   -- data/hora do agendamento mais recente;
                                    -- reagendar sobrescreve o valor (sem histórico em v1)

whatsapp_settings
  + remarketing_days INTEGER NOT NULL DEFAULT 3   -- dias sem atividade até cair em remarketing
```

Aplicadas via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, no mesmo bloco aditivo de
`initDb()` que já existe em `backend/src/config/db.js` para colunas adicionadas depois
da criação original das tabelas (mesmo padrão de `reach`, `campaign_prefix`, etc.).

### Regra de cálculo da etapa

Para cada contato, nessa ordem de prioridade (primeira que bater, vale):

1. Existe `real_conversions` com esse `contact_id`? → **Compareceu**
2. `appointment_at` está no futuro? → **Agendado**
3. `appointment_at` está no passado (e não apareceu)? → **Não Compareceu**
4. Senão, calcula `ultima_atividade` = horário da mensagem mais recente em
   `whatsapp_messages` (qualquer direção; `first_seen_at` se nunca houve mensagem) e
   compara com `remarketing_days`:
   - Dentro do prazo **e** já existe mensagem `outbound` (equipe respondeu alguma vez)
     → **Em Atendimento**
   - Dentro do prazo e nunca houve `outbound` → **Novo Lead**
   - Fora do prazo (não importa se já teve `outbound` antes) → **Remarketing**

Importante: "dentro do prazo" é sempre calculado a partir da mensagem mais recente, não
da primeira resposta da equipe — por isso um contato que teve resposta mas depois ficou
sem novo contato por mais de `remarketing_days` cai em Remarketing mesmo tendo passado
por "Em Atendimento" antes. `last_message_at` em `whatsapp_contacts` hoje só é atualizado
pelo webhook (mensagens recebidas) — a etapa usa `MAX(sent_at)` de `whatsapp_messages`
direto, cobrindo as duas direções, sem precisar tocar nesse campo existente.

Calculado em SQL/JS no momento da consulta — sem gravar `stage` em lugar nenhum.

### Backend — três rotas novas, nenhuma rota existente muda

- `GET /api/whatsapp/kanban?clientId=` — mesmo padrão de resolução de cliente das
  rotas existentes (`resolveClientId`). Retorna todos os contatos do cliente já com a
  etapa calculada (campo `stage`) e os dados necessários pro card (nome, telefone,
  origem, `last_message_at`, `appointment_at`, link para a conversa).
- `GET /api/whatsapp/agenda?clientId=&date=YYYY-MM-DD` — lista os contatos com
  `appointment_at` dentro daquele dia, ordenados por horário.
- `POST /api/whatsapp/contacts/:contactId/appointment` — corpo `{ appointmentAt }`
  (ISO 8601) ou `{ appointmentAt: null }` para desmarcar; grava em
  `whatsapp_contacts.appointment_at`. Usada pelo `/caixa` (mesma autenticação de staff
  por PIN que `POST /api/whatsapp/conversions` já usa).

Toda a lógica de cálculo de etapa fica num helper novo, `whatsappStage.js`, reaproveitado
pelas rotas de kanban e agenda — mesmo espírito de `whatsappRoi.js` já existente.

### Frontend

- **Nova aba "Funil WhatsApp"** no menu principal, mesmo padrão de acesso e de seletor
  de cliente que "WhatsApp & Conversões" já usa hoje. Quadro com 6 colunas fixas
  (Novo Lead, Em Atendimento, Agendado, Não Compareceu, Compareceu, Remarketing); cada
  card mostra nome, telefone, origem (badge "veio de anúncio" quando aplicável), tempo
  desde a última mensagem, horário do agendamento quando houver, e um botão "Ver
  conversa" que leva para `WhatsAppInboxPage` com aquele contato já selecionado. Sem
  drag-and-drop — nenhuma biblioteca nova é necessária para isso.
- **Nova aba "Agenda"**, mesmo menu: um seletor de data e, abaixo, a lista dos
  agendamentos daquele dia (nome, telefone, horário, link "Ver conversa").
- **`/caixa`**: depois de buscar e confirmar o contato, a tela de confirmação passa a
  oferecer duas ações lado a lado — "Lançar venda" (fluxo já existente, sem mudança) e
  "Marcar agendamento" (novo: campo de data e hora, botão salvar, tela de sucesso igual
  à de venda lançada).

## Fora de escopo (v1)

- Upload de CSV + leitura por IA para preencher gasto em lote — o lançamento manual no
  `/caixa` já resolve; revisitar se o volume justificar.
- API de Coexistência da Meta (reaproveitar número existente do cliente) — exige Tech
  Provider/BSP; não vale a troca hoje. Revisitar se a resistência de clientes a usar um
  número novo virar um problema real.
- Mover card manualmente entre colunas (override da etapa calculada).
- Grade visual de calendário (mês/semana) — a agenda v1 é seletor de dia + lista.
- Histórico de reagendamentos — `appointment_at` guarda só o valor atual.
- Notificação/alerta automático (ex: avisar a equipe quando um contato cai em
  remarketing) — por enquanto é só visualização no quadro.
