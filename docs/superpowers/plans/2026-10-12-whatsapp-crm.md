# CRM de WhatsApp (painel de contato, etapa manual, notas) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o Funil WhatsApp num CRM de verdade (inspirado no Kommo/amoCRM): um painel de contato único com conversa, histórico unificado e anotações, etapa movível na mão (que volta a ser automática assim que um evento real novo acontece), disponível tanto no painel admin quanto no `/caixa`.

**Architecture:** Três colunas aditivas em `whatsapp_contacts` (notes, manual_stage, manual_stage_set_at). `manual_stage`, quando preenchido, vence sobre o cálculo de `computeStage`; é limpo automaticamente nos 4 pontos onde um evento real grava algo pra um contato. Um componente de frontend novo e reaproveitável (`ContactDetailPanel`) concentra conversa + histórico + anotações + ações (mover etapa, lançar venda, marcar agendamento), usado inline no `/caixa` e como modal nos dois Funis (admin e `/caixa`) e nas duas Agendas.

**Tech Stack:** Node.js (ESM), Express, `pg`, React — mesmas libs já usadas, nenhuma dependência nova.

**Spec:** `docs/superpowers/specs/2026-10-12-whatsapp-crm-design.md`

## Global Constraints

- Nenhuma tabela, rota ou componente existente muda de comportamento fora do que este plano descreve — só adições (colunas novas, rotas novas, um componente novo reaproveitado em lugares que hoje fazem outra coisa).
- `manual_stage` nunca é tocado pela lógica pura `computeStage` (em `whatsappStage.js`) — o override acontece só na camada do controller, mantendo essa função pura e já testada intacta.
- O projeto não tem framework de teste de frontend; lógica pura ganha teste automatizado com `node --test`, rotas Express e UI React são verificadas manualmente (curl com token real / Playwright), mesma convenção já usada em todo o módulo de WhatsApp.
- `DATABASE_URL` do `.env` aponta pro Postgres de produção — os `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` são seguros de rodar contra produção, mesmo padrão já usado.

## Review Focus

- **PATCH `/stage` com um valor que não é uma das 6 chaves nem `null`** (ex: texto aleatório, número) — precisa devolver 400 e nunca gravar lixo em `manual_stage`. Testado na Tarefa 2.
- **Contato com `manual_stage` setado recebe uma mensagem nova** (pelo webhook oficial, pela Baileys, ou uma resposta enviada pelo painel) — a etapa precisa voltar a ser calculada automaticamente, não pode ficar presa no valor manual antigo. Testado na Tarefa 5.
- **PATCH `/notes` com string vazia** — precisa apagar a anotação (gravar `NULL`), não ser tratado como "não mudou nada". Testado na Tarefa 3.
- **GET `/timeline` de um contato sem nenhuma mensagem, venda ou agendamento** — precisa devolver uma lista vazia, não erro. Testado na Tarefa 4.
- **`createConversion` com `contactId` nulo** (fluxo "não achei — lançar mesmo assim") — a limpeza de `manual_stage` precisa ser pulada nesse caso, sem tentar atualizar um contato que não existe. Testado na Tarefa 5.

---

## Task 1: Colunas novas no banco de dados

**Files:**
- Modify: `backend/src/config/db.js`

**Interfaces:**
- Produces: `whatsapp_contacts.notes` (TEXT, nullable), `whatsapp_contacts.manual_stage` (TEXT, nullable), `whatsapp_contacts.manual_stage_set_at` (TIMESTAMPTZ, nullable). Todas as tarefas seguintes dependem dessas colunas.

- [ ] **Step 1: Adicionar as três colunas no bloco aditivo de `initDb()`**

Em `backend/src/config/db.js`, o bloco aditivo atual termina com:

```js
  await query(`ALTER TABLE whatsapp_settings ADD COLUMN IF NOT EXISTS connection_type TEXT NOT NULL DEFAULT 'cloud_api'`);
```

Adicione logo depois:

```js
  await query(`ALTER TABLE whatsapp_settings ADD COLUMN IF NOT EXISTS connection_type TEXT NOT NULL DEFAULT 'cloud_api'`);
  await query(`ALTER TABLE whatsapp_contacts ADD COLUMN IF NOT EXISTS notes TEXT`);
  await query(`ALTER TABLE whatsapp_contacts ADD COLUMN IF NOT EXISTS manual_stage TEXT`);
  await query(`ALTER TABLE whatsapp_contacts ADD COLUMN IF NOT EXISTS manual_stage_set_at TIMESTAMPTZ`);
```

- [ ] **Step 2: Verificar manualmente**

```bash
cd backend && node src/server.js
```

Expected: log `🚀 Backend Ad Campaign Tracker rodando na porta 5000` sem erro. Confirme as colunas:

```bash
node -e "import('./src/config/db.js').then(async ({default: db}) => { const {rows} = await db.query(\"SELECT column_name FROM information_schema.columns WHERE table_name = 'whatsapp_contacts' AND column_name IN ('notes','manual_stage','manual_stage_set_at')\"); console.log(rows); process.exit(0); })"
```

Expected: três linhas (`notes`, `manual_stage`, `manual_stage_set_at`).

- [ ] **Step 3: Commit**

```bash
git add backend/src/config/db.js
git commit -m "feat(whatsapp): adiciona colunas de anotacao e etapa manual"
```

---

## Task 2: Validação de etapa + rota de mover etapa manualmente + `getKanban` aplica o override

**Files:**
- Modify: `backend/src/services/whatsappStage.js`
- Test: `backend/src/services/whatsappStage.test.js`
- Create: `backend/src/controllers/whatsappContactController.js`
- Modify: `backend/src/controllers/whatsappKanbanController.js`
- Modify: `backend/src/server.js`

**Interfaces:**
- Produces: `STAGE_KEYS` (array com as 6 chaves), `isValidManualStage(value)` (de `whatsappStage.js`, usado pela Tarefa 2 e reaproveitável por quem mais precisar validar etapa). Rota `PATCH /api/whatsapp/contacts/:contactId/stage`. `getKanban` passa a devolver `manual_stage` em cada contato e aplicar o override na `stage`.

- [ ] **Step 1: Escrever o teste que falha (validação pura)**

```js
// backend/src/services/whatsappStage.test.js
// Adicione ao final do arquivo existente (depois do último teste de computeStage):
import { isValidManualStage, STAGE_KEYS } from './whatsappStage.js';

test('STAGE_KEYS tem as 6 etapas do funil', () => {
  assert.deepEqual(STAGE_KEYS, ['novo_lead', 'em_atendimento', 'agendado', 'nao_compareceu', 'compareceu', 'remarketing']);
});

test('isValidManualStage aceita null e undefined (significa "automatico")', () => {
  assert.equal(isValidManualStage(null), true);
  assert.equal(isValidManualStage(undefined), true);
});

test('isValidManualStage aceita qualquer uma das 6 chaves', () => {
  for (const key of STAGE_KEYS) {
    assert.equal(isValidManualStage(key), true);
  }
});

test('isValidManualStage rejeita valor que nao e uma das 6 chaves', () => {
  assert.equal(isValidManualStage('etapa_inventada'), false);
  assert.equal(isValidManualStage(''), false);
  assert.equal(isValidManualStage(123), false);
});
```

A linha `import { isValidManualStage, STAGE_KEYS } from './whatsappStage.js';` deve ficar junto com o import já existente de `computeStage` no topo do arquivo (una os dois imports numa linha só: `import { computeStage, isValidManualStage, STAGE_KEYS } from './whatsappStage.js';`), não duplicado.

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd backend && node --test src/services/whatsappStage.test.js`
Expected: FAIL — `isValidManualStage` e `STAGE_KEYS` não existem ainda.

- [ ] **Step 3: Implementar a validação pura**

Em `backend/src/services/whatsappStage.js`, adicione no final do arquivo:

```js
export const STAGE_KEYS = ['novo_lead', 'em_atendimento', 'agendado', 'nao_compareceu', 'compareceu', 'remarketing'];

export function isValidManualStage(value) {
  if (value === null || value === undefined) return true;
  return STAGE_KEYS.includes(value);
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd backend && node --test src/services/whatsappStage.test.js`
Expected: PASS (12 testes: os 8 de `computeStage` já existentes + os 4 novos).

- [ ] **Step 5: Implementar o controller da rota de mover etapa**

```js
// backend/src/controllers/whatsappContactController.js
import db from '../config/db.js';
import { isValidManualStage } from '../services/whatsappStage.js';

function resolveClientId(req) {
  return req.user.role === 'admin'
    ? (req.query.clientId || req.body.clientId || req.user.clientId)
    : req.user.clientId;
}

export async function setContactStage(req, res) {
  try {
    const clientId = resolveClientId(req);
    const { contactId } = req.params;
    const { stage } = req.body;

    if (!clientId) {
      return res.status(400).json({ error: 'ID do cliente é obrigatório.' });
    }
    if (!isValidManualStage(stage)) {
      return res.status(400).json({ error: 'stage deve ser uma etapa válida do funil, ou null para voltar ao automático.' });
    }

    const manualStage = stage || null;
    const { rows } = await db.query(
      `UPDATE whatsapp_contacts
       SET manual_stage = ?, manual_stage_set_at = ?
       WHERE id = ? AND client_id = ?
       RETURNING id`,
      [manualStage, manualStage ? new Date().toISOString() : null, contactId, clientId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Contato não encontrado.' });
    }

    return res.json({ message: 'Etapa atualizada com sucesso!' });
  } catch (error) {
    console.error('Set contact stage error:', error);
    return res.status(500).json({ error: 'Erro ao atualizar etapa.' });
  }
}
```

- [ ] **Step 6: `getKanban` passa a trazer e aplicar `manual_stage`**

Em `backend/src/controllers/whatsappKanbanController.js`, a query de `getKanban` hoje seleciona (entre outras colunas) `wc.appointment_at, wc.first_seen_at,`. Adicione `wc.manual_stage` nessa lista:

```js
    const { rows } = await db.query(
      `SELECT
         wc.id, wc.wa_id, wc.profile_name, wc.source, wc.ad_headline,
         wc.appointment_at, wc.first_seen_at, wc.manual_stage,
         EXISTS(SELECT 1 FROM real_conversions rc WHERE rc.contact_id = wc.id) AS has_conversion,
         EXISTS(SELECT 1 FROM whatsapp_messages wm WHERE wm.contact_id = wc.id AND wm.direction = 'outbound') AS has_outbound,
         (SELECT MAX(sent_at) FROM whatsapp_messages wm2 WHERE wm2.contact_id = wc.id) AS last_message_at
       FROM whatsapp_contacts wc
       WHERE wc.client_id = ?
       ORDER BY wc.id DESC`,
      [clientId]
    );
```

E o `map` logo abaixo, que hoje é:

```js
    const now = new Date();
    const contacts = rows.map((r) => ({
      id: r.id,
      wa_id: r.wa_id,
      profile_name: r.profile_name,
      source: r.source,
      ad_headline: r.ad_headline,
      appointment_at: r.appointment_at,
      stage: computeStage({
        hasConversion: r.has_conversion,
        appointmentAt: r.appointment_at,
        hasOutbound: r.has_outbound,
        lastActivityAt: r.last_message_at || r.first_seen_at,
        remarketingDays,
        now
      })
    }));
```

Troque por (adiciona `manual_stage` na resposta e aplica o override):

```js
    const now = new Date();
    const contacts = rows.map((r) => ({
      id: r.id,
      wa_id: r.wa_id,
      profile_name: r.profile_name,
      source: r.source,
      ad_headline: r.ad_headline,
      appointment_at: r.appointment_at,
      manual_stage: r.manual_stage,
      stage: r.manual_stage || computeStage({
        hasConversion: r.has_conversion,
        appointmentAt: r.appointment_at,
        hasOutbound: r.has_outbound,
        lastActivityAt: r.last_message_at || r.first_seen_at,
        remarketingDays,
        now
      })
    }));
```

- [ ] **Step 7: Registrar a rota protegida**

Em `backend/src/server.js`, adicione o import junto aos outros controllers (depois da linha `import { getBaileysStatus } from './controllers/whatsappBaileysController.js';`):

```js
import { setContactStage } from './controllers/whatsappContactController.js';
```

E registre, depois do bloco `// WhatsApp Baileys (nao-oficial, WhatsApp Web)`:

```js
// WhatsApp Contact (CRM: etapa manual, anotacoes, historico)
app.patch('/api/whatsapp/contacts/:contactId/stage', setContactStage);
```

- [ ] **Step 8: Verificar manualmente**

Com o backend rodando e um token de admin (`$TOKEN`, mesmo processo de login usado no resto do módulo) e um `contactId` real do cliente 5 (Recreio):

```bash
curl -s -X PATCH "http://localhost:5000/api/whatsapp/contacts/$CONTACT_ID/stage" \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"clientId":5,"stage":"compareceu"}'
```

Expected: `{"message":"Etapa atualizada com sucesso!"}`. Confirme no Kanban:

```bash
curl -s "http://localhost:5000/api/whatsapp/kanban?clientId=5" -H "Authorization: Bearer $TOKEN" | node -pe "JSON.parse(require('fs').readFileSync(0)).contacts.find(c => c.id === $CONTACT_ID)"
```

Expected: `stage: "compareceu"` e `manual_stage: "compareceu"`, mesmo que o cálculo automático desse outra coisa.

Teste o erro de validação:

```bash
curl -s -X PATCH "http://localhost:5000/api/whatsapp/contacts/$CONTACT_ID/stage" \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"clientId":5,"stage":"etapa_inventada"}'
```

Expected: status 400.

Teste voltar ao automático:

```bash
curl -s -X PATCH "http://localhost:5000/api/whatsapp/contacts/$CONTACT_ID/stage" \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"clientId":5,"stage":null}'
```

Expected: sucesso, e o Kanban volta a mostrar a `stage` calculada automaticamente pra esse contato.

- [ ] **Step 9: Commit**

```bash
git add backend/src/services/whatsappStage.js backend/src/services/whatsappStage.test.js backend/src/controllers/whatsappContactController.js backend/src/controllers/whatsappKanbanController.js backend/src/server.js
git commit -m "feat(whatsapp): adiciona etapa manual do funil (move pra, com override)"
```

---

## Task 3: Anotações no contato

**Files:**
- Modify: `backend/src/controllers/whatsappContactController.js`
- Modify: `backend/src/server.js`

**Interfaces:**
- Produces: rota `PATCH /api/whatsapp/contacts/:contactId/notes`.

- [ ] **Step 1: Implementar o controller**

Em `backend/src/controllers/whatsappContactController.js`, adicione:

```js
export async function setContactNotes(req, res) {
  try {
    const clientId = resolveClientId(req);
    const { contactId } = req.params;
    const { notes } = req.body;

    if (!clientId) {
      return res.status(400).json({ error: 'ID do cliente é obrigatório.' });
    }

    const { rows } = await db.query(
      `UPDATE whatsapp_contacts SET notes = ? WHERE id = ? AND client_id = ? RETURNING id`,
      [notes || null, contactId, clientId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Contato não encontrado.' });
    }

    return res.json({ message: 'Anotação salva com sucesso!' });
  } catch (error) {
    console.error('Set contact notes error:', error);
    return res.status(500).json({ error: 'Erro ao salvar anotação.' });
  }
}
```

- [ ] **Step 2: Registrar a rota**

Em `backend/src/server.js`, adicione `setContactNotes` ao import já feito na Tarefa 2:

```js
import { setContactStage, setContactNotes } from './controllers/whatsappContactController.js';
```

E adicione a rota logo abaixo da de `stage`:

```js
app.patch('/api/whatsapp/contacts/:contactId/stage', setContactStage);
app.patch('/api/whatsapp/contacts/:contactId/notes', setContactNotes);
```

- [ ] **Step 3: Verificar manualmente**

```bash
curl -s -X PATCH "http://localhost:5000/api/whatsapp/contacts/$CONTACT_ID/notes" \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"clientId":5,"notes":"Prefere mesa perto da janela."}'
```

Expected: `{"message":"Anotação salva com sucesso!"}`. Confirme direto no banco:

```bash
cd backend && node -e "
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
(async () => {
  const r = await pool.query('SELECT notes FROM whatsapp_contacts WHERE id = \$1', [$CONTACT_ID]);
  console.log(JSON.stringify(r.rows));
  await pool.end();
})();
"
```

Expected: `notes: "Prefere mesa perto da janela."`. Teste apagar com string vazia:

```bash
curl -s -X PATCH "http://localhost:5000/api/whatsapp/contacts/$CONTACT_ID/notes" \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"clientId":5,"notes":""}'
```

Expected: sucesso, e a consulta ao banco acima agora mostra `notes: null`.

- [ ] **Step 4: Commit**

```bash
git add backend/src/controllers/whatsappContactController.js backend/src/server.js
git commit -m "feat(whatsapp): adiciona anotacoes no contato"
```

---

## Task 4: Histórico unificado por contato

**Files:**
- Modify: `backend/src/controllers/whatsappContactController.js`
- Modify: `backend/src/server.js`

**Interfaces:**
- Produces: rota `GET /api/whatsapp/contacts/:contactId/timeline` → `{ events: Array<{type: 'message'|'sale'|'appointment', occurredAt, ...}> }`, ordenado por `occurredAt` decrescente.

- [ ] **Step 1: Implementar o controller**

Em `backend/src/controllers/whatsappContactController.js`, adicione:

```js
export async function getContactTimeline(req, res) {
  try {
    const clientId = resolveClientId(req);
    const { contactId } = req.params;

    if (!clientId) {
      return res.status(400).json({ error: 'ID do cliente é obrigatório.' });
    }

    const { rows: contactRows } = await db.query(
      `SELECT id, appointment_at FROM whatsapp_contacts WHERE id = ? AND client_id = ?`,
      [contactId, clientId]
    );
    if (contactRows.length === 0) {
      return res.status(404).json({ error: 'Contato não encontrado.' });
    }
    const contact = contactRows[0];

    const { rows: messageRows } = await db.query(
      `SELECT direction, body, sent_at FROM whatsapp_messages WHERE contact_id = ? ORDER BY sent_at DESC`,
      [contactId]
    );
    const { rows: saleRows } = await db.query(
      `SELECT amount_spent, created_at FROM real_conversions WHERE contact_id = ? ORDER BY created_at DESC`,
      [contactId]
    );

    const events = [
      ...messageRows.map((m) => ({ type: 'message', occurredAt: m.sent_at, direction: m.direction, body: m.body })),
      ...saleRows.map((s) => ({ type: 'sale', occurredAt: s.created_at, amountSpent: s.amount_spent }))
    ];
    if (contact.appointment_at) {
      events.push({ type: 'appointment', occurredAt: contact.appointment_at });
    }

    events.sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt));

    return res.json({ events });
  } catch (error) {
    console.error('Get contact timeline error:', error);
    return res.status(500).json({ error: 'Erro ao buscar histórico.' });
  }
}
```

- [ ] **Step 2: Registrar a rota**

Em `backend/src/server.js`, atualize o import pra incluir `getContactTimeline`:

```js
import { setContactStage, setContactNotes, getContactTimeline } from './controllers/whatsappContactController.js';
```

E adicione a rota:

```js
app.patch('/api/whatsapp/contacts/:contactId/stage', setContactStage);
app.patch('/api/whatsapp/contacts/:contactId/notes', setContactNotes);
app.get('/api/whatsapp/contacts/:contactId/timeline', getContactTimeline);
```

- [ ] **Step 3: Verificar manualmente**

```bash
curl -s "http://localhost:5000/api/whatsapp/contacts/$CONTACT_ID/timeline?clientId=5" -H "Authorization: Bearer $TOKEN"
```

Expected: `{"events":[...]}` com os eventos desse contato (mensagens, a anotação de venda se tiver, o agendamento se tiver), ordenados do mais recente pro mais antigo.

Teste com um contato sem nenhum evento (crie um novo contato de teste via webhook, sem venda nem agendamento, só pra confirmar lista vazia funciona — ou use um `contactId` inexistente real que não tenha nada):

```bash
curl -s "http://localhost:5000/api/whatsapp/contacts/999999/timeline?clientId=5" -H "Authorization: Bearer $TOKEN"
```

Expected: status 404 (`Contato não encontrado`), já que esse id não existe — confirma que a checagem de posse funciona antes de montar a timeline.

- [ ] **Step 4: Commit**

```bash
git add backend/src/controllers/whatsappContactController.js backend/src/server.js
git commit -m "feat(whatsapp): adiciona historico unificado por contato"
```

---

## Task 5: Evento real sempre limpa a etapa manual

**Files:**
- Modify: `backend/src/services/whatsappIngest.js`
- Modify: `backend/src/services/whatsappIngest.test.js`
- Modify: `backend/src/controllers/whatsappConversationsController.js`
- Modify: `backend/src/controllers/whatsappKanbanController.js`
- Modify: `backend/src/controllers/realConversionsController.js`

**Interfaces:**
- Consumes: nada novo.
- Produces: nenhuma interface nova — ajusta gravações já existentes pra também limpar `manual_stage`/`manual_stage_set_at`.

- [ ] **Step 1: Escrever o teste que falha**

Em `backend/src/services/whatsappIngest.test.js`, adicione um teste novo (usando o mesmo `makeFakeDb` já definido no arquivo):

```js
test('ingestWhatsAppEvent limpa manual_stage e manual_stage_set_at no upsert', async () => {
  const { db, calls } = makeFakeDb();

  await ingestWhatsAppEvent(5, baseEvent(), { db });

  const contactCall = calls.find((c) => /INSERT INTO whatsapp_contacts/.test(c.sql));
  assert.match(contactCall.sql, /manual_stage = NULL/);
  assert.match(contactCall.sql, /manual_stage_set_at = NULL/);
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd backend && node --test src/services/whatsappIngest.test.js`
Expected: FAIL — a query de `INSERT INTO whatsapp_contacts` ainda não tem `manual_stage = NULL` no `ON CONFLICT DO UPDATE SET`.

- [ ] **Step 3: Implementar em `whatsappIngest.js`**

A query de upsert em `backend/src/services/whatsappIngest.js` hoje termina o `SET` com:

```js
       source = CASE WHEN whatsapp_contacts.source = 'ad' THEN 'ad' ELSE excluded.source END,
       last_message_at = excluded.last_message_at
     RETURNING id`,
```

Troque por (adiciona as duas linhas de limpeza antes do `last_message_at`):

```js
       source = CASE WHEN whatsapp_contacts.source = 'ad' THEN 'ad' ELSE excluded.source END,
       manual_stage = NULL,
       manual_stage_set_at = NULL,
       last_message_at = excluded.last_message_at
     RETURNING id`,
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd backend && node --test src/services/whatsappIngest.test.js`
Expected: PASS (4 testes: os 3 já existentes + o novo).

- [ ] **Step 5: Limpar em `replyToConversation`**

Em `backend/src/controllers/whatsappConversationsController.js`, a função `replyToConversation` hoje termina (antes do `return res.json(...)`) com:

```js
    await db.query(
      `INSERT INTO whatsapp_messages (client_id, contact_id, direction, body, wa_message_id, sent_at)
       VALUES (?, ?, 'outbound', ?, ?, CURRENT_TIMESTAMP)`,
      [clientId, contactId, body, waMessageId]
    );

    return res.json({ message: 'Mensagem enviada.' });
```

Adicione a limpeza logo depois do insert da mensagem:

```js
    await db.query(
      `INSERT INTO whatsapp_messages (client_id, contact_id, direction, body, wa_message_id, sent_at)
       VALUES (?, ?, 'outbound', ?, ?, CURRENT_TIMESTAMP)`,
      [clientId, contactId, body, waMessageId]
    );

    await db.query(
      `UPDATE whatsapp_contacts SET manual_stage = NULL, manual_stage_set_at = NULL WHERE id = ?`,
      [contactId]
    );

    return res.json({ message: 'Mensagem enviada.' });
```

- [ ] **Step 6: Limpar em `setAppointment`**

Em `backend/src/controllers/whatsappKanbanController.js`, a query de `setAppointment` hoje é:

```js
    const { rows } = await db.query(
      `UPDATE whatsapp_contacts SET appointment_at = ? WHERE id = ? AND client_id = ? RETURNING id`,
      [parsedAppointment, contactId, clientId]
    );
```

Troque por:

```js
    const { rows } = await db.query(
      `UPDATE whatsapp_contacts
       SET appointment_at = ?, manual_stage = NULL, manual_stage_set_at = NULL
       WHERE id = ? AND client_id = ? RETURNING id`,
      [parsedAppointment, contactId, clientId]
    );
```

- [ ] **Step 7: Limpar em `createConversion` (só quando `contactId` existe)**

Em `backend/src/controllers/realConversionsController.js`, a função `createConversion` hoje termina (antes do `return res.status(201)...`) com:

```js
    const { rows } = await db.query(
      `INSERT INTO real_conversions (client_id, contact_id, customer_name, phone, amount_spent, matched_by)
       VALUES (?, ?, ?, ?, ?, ?)
       RETURNING id`,
      [clientId, contactId || null, customerName, phone || null, Number(amountSpent), matchedBy]
    );

    return res.status(201).json({ message: 'Conversão registrada com sucesso!', id: rows[0].id });
```

Adicione a limpeza condicional antes do `return`:

```js
    const { rows } = await db.query(
      `INSERT INTO real_conversions (client_id, contact_id, customer_name, phone, amount_spent, matched_by)
       VALUES (?, ?, ?, ?, ?, ?)
       RETURNING id`,
      [clientId, contactId || null, customerName, phone || null, Number(amountSpent), matchedBy]
    );

    if (contactId) {
      await db.query(
        `UPDATE whatsapp_contacts SET manual_stage = NULL, manual_stage_set_at = NULL WHERE id = ?`,
        [contactId]
      );
    }

    return res.status(201).json({ message: 'Conversão registrada com sucesso!', id: rows[0].id });
```

- [ ] **Step 8: Rodar a suíte completa do backend**

Run: `cd backend && find src -name "*.test.js" -exec node --test {} +`
Expected: todos os testes passam (os já existentes + os novos desta tarefa).

- [ ] **Step 9: Verificar manualmente de ponta a ponta**

Usando o `$CONTACT_ID` que você moveu manualmente pra `compareceu` na Tarefa 2 (ainda com `manual_stage` setado):

```bash
# Simula uma mensagem nova chegando pro mesmo contato via webhook
curl -s -X POST http://localhost:5000/api/v1/whatsapp/webhook \
  -H "Content-Type: application/json" \
  -d "{\"object\":\"whatsapp_business_account\",\"entry\":[{\"id\":\"WABA_TEST\",\"changes\":[{\"field\":\"messages\",\"value\":{\"messaging_product\":\"whatsapp\",\"metadata\":{\"display_phone_number\":\"15551234567\",\"phone_number_id\":\"PHONE_123\"},\"contacts\":[{\"profile\":{\"name\":\"Teste Limpeza\"},\"wa_id\":\"SEU_WA_ID_AQUI\"}],\"messages\":[{\"from\":\"SEU_WA_ID_AQUI\",\"id\":\"wamid.LIMPEZATESTE001\",\"timestamp\":\"$(node -e "console.log(Math.floor(Date.now()/1000))")\",\"type\":\"text\",\"text\":{\"body\":\"oi de novo\"}}]}}]}]}"

sleep 1
curl -s "http://localhost:5000/api/whatsapp/kanban?clientId=5" -H "Authorization: Bearer $TOKEN" | node -pe "JSON.parse(require('fs').readFileSync(0)).contacts.find(c => c.id === $CONTACT_ID)"
```

(Troque `SEU_WA_ID_AQUI` pelo `wa_id` real do `$CONTACT_ID` usado na Tarefa 2 — consulte com `SELECT wa_id FROM whatsapp_contacts WHERE id = $CONTACT_ID` se precisar.)

Expected: `manual_stage: null` e `stage` voltou a ser o valor calculado automaticamente — confirma que o evento real limpou o override.

- [ ] **Step 10: Commit**

```bash
git add backend/src/services/whatsappIngest.js backend/src/services/whatsappIngest.test.js backend/src/controllers/whatsappConversationsController.js backend/src/controllers/whatsappKanbanController.js backend/src/controllers/realConversionsController.js
git commit -m "feat(whatsapp): evento real sempre limpa a etapa manual do contato"
```

---

## Task 6: `ContactDetailPanel` + integração no `/caixa` (conversa + venda + agendamento + etapa + historico + anotacoes, tudo junto)

**Files:**
- Create: `frontend/src/components/ContactDetailPanel.jsx`
- Modify: `frontend/src/components/CaixaChatView.jsx`

**Interfaces:**
- Consumes: `GET /api/whatsapp/conversations/:contactId/messages`, `POST /api/whatsapp/conversations/:contactId/reply`, `PATCH /api/whatsapp/contacts/:contactId/stage`, `PATCH /api/whatsapp/contacts/:contactId/notes`, `GET /api/whatsapp/contacts/:contactId/timeline`, `POST /api/whatsapp/conversions`, `POST /api/whatsapp/contacts/:contactId/appointment` (Tarefas 2-5 e já existentes).
- Produces: `ContactDetailPanel({ apiClient, clientId, contact, onClose, onUpdated })` — `apiClient` é qualquer cliente com `.get/.post/.patch` (funciona com `axios` global ou com uma instância `axios.create()`); `clientId` é **opcional** — só é necessário quando `apiClient` é o `axios` global do painel admin (cujo token não carrega um `clientId` fixo, por isso toda rota backend usada aqui aceita `clientId` via query/body quando `req.user.role === 'admin'`, mesmo padrão de `resolveClientId` já usado em `whatsappConversationsController.js`/`realConversionsController.js`); quando `apiClient` é o `caixaApi` do `/caixa` (token de staff, já tem um `clientId` fixo no backend), `clientId` deve ser omitido. `contact` precisa ter `{ id, wa_id, profile_name, stage }` (o `stage` é opcional — se ausente, o seletor de etapa começa em "Automático"); `onClose` opcional (mostra um X no canto, usado quando o painel é renderizado dentro de um modal); `onUpdated` opcional, chamado depois de qualquer ação que muda o contato (resposta enviada, etapa movida, venda lançada, agendamento marcado). Usado pela Tarefa 7.

- [ ] **Step 1: Criar o componente**

```jsx
// frontend/src/components/ContactDetailPanel.jsx
import React, { useState, useEffect } from 'react';
import { Send, DollarSign, CalendarPlus, ArrowLeft, CheckCircle2, X } from 'lucide-react';

const STAGES = [
  { key: 'novo_lead', label: 'Novo Lead' },
  { key: 'em_atendimento', label: 'Em Atendimento' },
  { key: 'agendado', label: 'Agendado' },
  { key: 'nao_compareceu', label: 'Não Compareceu' },
  { key: 'compareceu', label: 'Compareceu' },
  { key: 'remarketing', label: 'Remarketing' }
];

const fieldStyle = {
  width: '100%',
  padding: '12px',
  borderRadius: '8px',
  border: '1px solid rgba(255,255,255,0.1)',
  backgroundColor: '#131b2e',
  color: '#fff',
  marginBottom: '10px',
  fontSize: '0.95rem'
};

const primaryBtn = {
  padding: '12px',
  borderRadius: '8px',
  border: 'none',
  color: '#fff',
  fontWeight: 700,
  cursor: 'pointer',
  width: '100%'
};

function formatEventDate(iso) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function ContactDetailPanel({ apiClient, clientId, contact, onClose, onUpdated }) {
  const [section, setSection] = useState('conversa');
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);

  const [timeline, setTimeline] = useState([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  const [notes, setNotes] = useState(contact.notes || '');
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);

  const [currentStage, setCurrentStage] = useState(contact.stage || '');
  const [savingStage, setSavingStage] = useState(false);

  const [actionMode, setActionMode] = useState(null); // null | 'sale' | 'appointment' | 'success'
  const [customerName, setCustomerName] = useState(contact.profile_name || '');
  const [phone, setPhone] = useState(contact.wa_id || '');
  const [amountSpent, setAmountSpent] = useState('');
  const [appointmentDate, setAppointmentDate] = useState('');
  const [appointmentTime, setAppointmentTime] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setSection('conversa');
    setActionMode(null);
    setCurrentStage(contact.stage || '');
    setCustomerName(contact.profile_name || '');
    setPhone(contact.wa_id || '');
    setNotes(contact.notes || '');
    setNotesSaved(false);
    fetchMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact.id]);

  useEffect(() => {
    if (section === 'historico') fetchTimeline();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, contact.id]);

  const fetchMessages = async () => {
    setLoadingMessages(true);
    try {
      const res = await apiClient.get(`/api/whatsapp/conversations/${contact.id}/messages`, { params: clientId ? { clientId } : {} });
      setMessages(res.data.messages || []);
    } catch (err) {
      console.error('Error fetching messages:', err);
    } finally {
      setLoadingMessages(false);
    }
  };

  const fetchTimeline = async () => {
    setLoadingTimeline(true);
    try {
      const res = await apiClient.get(`/api/whatsapp/contacts/${contact.id}/timeline`, { params: clientId ? { clientId } : {} });
      setTimeline(res.data.events || []);
    } catch (err) {
      console.error('Error fetching timeline:', err);
    } finally {
      setLoadingTimeline(false);
    }
  };

  const handleSendReply = async (e) => {
    e.preventDefault();
    if (!replyText.trim()) return;
    setSending(true);
    try {
      await apiClient.post(`/api/whatsapp/conversations/${contact.id}/reply`, { body: replyText, clientId });
      setReplyText('');
      fetchMessages();
      if (onUpdated) onUpdated();
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao enviar mensagem.');
    } finally {
      setSending(false);
    }
  };

  const handleStageChange = async (e) => {
    const newStage = e.target.value;
    setSavingStage(true);
    try {
      await apiClient.patch(`/api/whatsapp/contacts/${contact.id}/stage`, { stage: newStage || null, clientId });
      setCurrentStage(newStage);
      if (onUpdated) onUpdated();
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao mover etapa.');
    } finally {
      setSavingStage(false);
    }
  };

  const handleSaveNotes = async () => {
    setNotesSaving(true);
    setNotesSaved(false);
    try {
      await apiClient.patch(`/api/whatsapp/contacts/${contact.id}/notes`, { notes, clientId });
      setNotesSaved(true);
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao salvar anotação.');
    } finally {
      setNotesSaving(false);
    }
  };

  const handleConfirmSale = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await apiClient.post('/api/whatsapp/conversions', {
        contactId: contact.id,
        customerName,
        phone,
        amountSpent: Number(amountSpent),
        matchedBy: 'phone',
        clientId
      });
      setActionMode('success');
      if (onUpdated) onUpdated();
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao lançar conversão.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmAppointment = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const appointmentAt = new Date(`${appointmentDate}T${appointmentTime}`).toISOString();
      await apiClient.post(`/api/whatsapp/contacts/${contact.id}/appointment`, { appointmentAt, clientId });
      setActionMode('success');
      if (onUpdated) onUpdated();
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao marcar agendamento.');
    } finally {
      setSubmitting(false);
    }
  };

  const backFromAction = () => {
    setActionMode(null);
    setAmountSpent('');
    setAppointmentDate('');
    setAppointmentTime('');
    setError('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div>
          <div style={{ fontWeight: 700, color: '#fff', fontSize: '1rem' }}>{contact.profile_name || contact.wa_id}</div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '8px' }}>{contact.wa_id}</div>
          <select
            value={currentStage || ''}
            onChange={handleStageChange}
            disabled={savingStage}
            style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', backgroundColor: '#131b2e', color: '#fff', fontSize: '0.75rem' }}
          >
            <option value="">Automático (calculado)</option>
            {STAGES.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
          <button type="button" onClick={() => setActionMode('sale')} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '8px 10px', borderRadius: '8px', border: 'none', background: '#10b981', color: '#fff', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
            <DollarSign size={14} /> Venda
          </button>
          <button type="button" onClick={() => setActionMode('appointment')} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '8px 10px', borderRadius: '8px', border: 'none', background: '#6366f1', color: '#fff', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
            <CalendarPlus size={14} /> Agendar
          </button>
          {onClose && (
            <button type="button" onClick={onClose} style={{ padding: '8px', borderRadius: '8px', border: 'none', background: 'rgba(255,255,255,0.08)', color: '#fff', cursor: 'pointer' }}>
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {actionMode === 'success' ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '14px' }}>
          <CheckCircle2 size={48} color="#10b981" />
          <p style={{ fontWeight: 700, fontSize: '1.1rem' }}>Feito!</p>
          <button onClick={backFromAction} style={{ ...primaryBtn, maxWidth: '200px', background: '#6366f1' }}>Voltar</button>
        </div>
      ) : actionMode === 'sale' ? (
        <form onSubmit={handleConfirmSale} style={{ maxWidth: '360px' }}>
          <button type="button" onClick={backFromAction} style={{ background: 'none', border: 'none', color: '#94a3b8', marginBottom: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <ArrowLeft size={16} /> Voltar
          </button>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: '14px' }}>Lançar venda</h3>
          <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Nome do cliente" required style={fieldStyle} />
          <input type="number" step="0.01" value={amountSpent} onChange={(e) => setAmountSpent(e.target.value)} placeholder="Valor gasto (R$)" required autoFocus style={fieldStyle} />
          {error && <p style={{ color: '#f87171', marginBottom: '10px', fontSize: '0.85rem' }}>{error}</p>}
          <button type="submit" disabled={submitting} style={{ ...primaryBtn, background: 'linear-gradient(135deg, #10b981, #059669)' }}>
            {submitting ? 'Salvando...' : 'Lançar venda'}
          </button>
        </form>
      ) : actionMode === 'appointment' ? (
        <form onSubmit={handleConfirmAppointment} style={{ maxWidth: '360px' }}>
          <button type="button" onClick={backFromAction} style={{ background: 'none', border: 'none', color: '#94a3b8', marginBottom: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <ArrowLeft size={16} /> Voltar
          </button>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: '6px' }}>Marcar agendamento</h3>
          <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '14px' }}>{customerName}</p>
          <input type="date" value={appointmentDate} onChange={(e) => setAppointmentDate(e.target.value)} required autoFocus style={fieldStyle} />
          <input type="time" value={appointmentTime} onChange={(e) => setAppointmentTime(e.target.value)} required style={fieldStyle} />
          {error && <p style={{ color: '#f87171', marginBottom: '10px', fontSize: '0.85rem' }}>{error}</p>}
          <button type="submit" disabled={submitting} style={{ ...primaryBtn, background: 'linear-gradient(135deg, #6366f1, #4f46e5)' }}>
            {submitting ? 'Salvando...' : 'Confirmar agendamento'}
          </button>
        </form>
      ) : (
        <>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
            {[['conversa', 'Conversa'], ['historico', 'Histórico'], ['anotacoes', 'Anotações']].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setSection(key)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  backgroundColor: section === key ? '#6366f1' : 'rgba(255,255,255,0.05)',
                  color: section === key ? '#fff' : '#94a3b8'
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {section === 'conversa' && (
            <>
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px' }}>
                {loadingMessages ? (
                  <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Carregando...</p>
                ) : messages.length === 0 ? (
                  <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Nenhuma mensagem ainda.</p>
                ) : (
                  messages.map((m) => (
                    <div
                      key={m.id}
                      style={{
                        alignSelf: m.direction === 'outbound' ? 'flex-end' : 'flex-start',
                        backgroundColor: m.direction === 'outbound' ? '#6366f1' : '#1e293b',
                        color: '#fff',
                        padding: '8px 12px',
                        borderRadius: '10px',
                        maxWidth: '75%',
                        fontSize: '0.85rem'
                      }}
                    >
                      {m.body}
                    </div>
                  ))
                )}
              </div>
              <form onSubmit={handleSendReply} style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Digite uma resposta..."
                  style={{ ...fieldStyle, marginBottom: 0, flex: 1 }}
                />
                <button type="submit" disabled={sending} style={{ padding: '0 16px', borderRadius: '8px', border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer' }}>
                  <Send size={16} />
                </button>
              </form>
            </>
          )}

          {section === 'historico' && (
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {loadingTimeline ? (
                <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Carregando...</p>
              ) : timeline.length === 0 ? (
                <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Nada registrado ainda.</p>
              ) : (
                timeline.map((ev, idx) => (
                  <div key={idx} style={{ padding: '10px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.03)', fontSize: '0.82rem' }}>
                    <div style={{ color: '#94a3b8', fontSize: '0.72rem', marginBottom: '4px' }}>{formatEventDate(ev.occurredAt)}</div>
                    {ev.type === 'message' && (
                      <div style={{ color: '#fff' }}>{ev.direction === 'outbound' ? 'Você: ' : ''}{ev.body}</div>
                    )}
                    {ev.type === 'sale' && (
                      <div style={{ color: '#34d399' }}>Venda: R$ {Number(ev.amountSpent).toFixed(2)}</div>
                    )}
                    {ev.type === 'appointment' && (
                      <div style={{ color: '#a855f7' }}>Agendamento marcado</div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {section === 'anotacoes' && (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
              <textarea
                value={notes}
                onChange={(e) => { setNotes(e.target.value); setNotesSaved(false); }}
                placeholder="Observações sobre esse contato (preferências, combinados)..."
                style={{ ...fieldStyle, flex: 1, resize: 'none', minHeight: '200px' }}
              />
              <button
                type="button"
                onClick={handleSaveNotes}
                disabled={notesSaving}
                style={{ ...primaryBtn, maxWidth: '160px', background: '#6366f1' }}
              >
                {notesSaving ? 'Salvando...' : notesSaved ? 'Salvo ✓' : 'Salvar anotação'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Reescrever `CaixaChatView.jsx` pra usar o painel novo**

O arquivo atual de `frontend/src/components/CaixaChatView.jsx` tem um painel de conversa/venda/agendamento próprio, construído antes dessa funcionalidade virar CRM. Substitua o conteúdo inteiro do arquivo por:

```jsx
// frontend/src/components/CaixaChatView.jsx
import React, { useState, useEffect } from 'react';
import { CheckCircle2 } from 'lucide-react';
import ContactDetailPanel from './ContactDetailPanel';

const fieldStyle = {
  width: '100%',
  padding: '12px',
  borderRadius: '8px',
  border: '1px solid rgba(255,255,255,0.1)',
  backgroundColor: '#131b2e',
  color: '#fff',
  marginBottom: '10px',
  fontSize: '0.95rem'
};

const primaryBtn = {
  padding: '12px',
  borderRadius: '8px',
  border: 'none',
  color: '#fff',
  fontWeight: 700,
  cursor: 'pointer',
  width: '100%'
};

function ManualSaleForm({ apiClient, initialName, onDone }) {
  const [customerName, setCustomerName] = useState(initialName);
  const [amountSpent, setAmountSpent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await apiClient.post('/api/whatsapp/conversions', {
        contactId: null,
        customerName,
        phone: '',
        amountSpent: Number(amountSpent),
        matchedBy: 'manual'
      });
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao lançar conversão.');
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '14px' }}>
        <CheckCircle2 size={48} color="#10b981" />
        <p style={{ fontWeight: 700, fontSize: '1.1rem' }}>Feito!</p>
        <button onClick={onDone} style={{ ...primaryBtn, maxWidth: '200px', background: '#6366f1' }}>Voltar</button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: '360px' }}>
      <h3 style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: '14px' }}>Lançar venda (sem conversa)</h3>
      <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Nome do cliente" required style={fieldStyle} />
      <input type="number" step="0.01" value={amountSpent} onChange={(e) => setAmountSpent(e.target.value)} placeholder="Valor gasto (R$)" required autoFocus style={fieldStyle} />
      {error && <p style={{ color: '#f87171', marginBottom: '10px', fontSize: '0.85rem' }}>{error}</p>}
      <button type="submit" disabled={submitting} style={{ ...primaryBtn, background: 'linear-gradient(135deg, #10b981, #059669)' }}>
        {submitting ? 'Salvando...' : 'Lançar venda'}
      </button>
    </form>
  );
}

export default function CaixaChatView({ caixaApi }) {
  const [conversations, setConversations] = useState([]);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null); // null = mostra conversas; array = resultado da busca
  const [selectedContact, setSelectedContact] = useState(null);
  const [manualEntryName, setManualEntryName] = useState(null);

  useEffect(() => {
    fetchConversations();
  }, []);

  const fetchConversations = async () => {
    try {
      const res = await caixaApi.get('/api/whatsapp/conversations');
      setConversations(res.data.conversations || []);
    } catch (err) {
      console.error('Error fetching conversations:', err);
    }
  };

  const handleSearchChange = async (e) => {
    const value = e.target.value;
    setQuery(value);
    if (!value.trim()) {
      setSearchResults(null);
      return;
    }
    try {
      const res = await caixaApi.get('/api/whatsapp/contacts/search', { params: { q: value } });
      setSearchResults(res.data.contacts || []);
    } catch (err) {
      console.error('Error searching contacts:', err);
    }
  };

  const selectConversation = (contact) => {
    setSelectedContact(contact);
    setManualEntryName(null);
  };

  const skipMatch = () => {
    setSelectedContact(null);
    setManualEntryName(query);
  };

  const finishManualEntry = () => {
    setManualEntryName(null);
    setQuery('');
    setSearchResults(null);
    fetchConversations();
  };

  const listToShow = searchResults !== null ? searchResults : conversations;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', height: '560px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', overflow: 'hidden' }}>
      <div style={{ borderRight: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', backgroundColor: '#0f1420' }}>
        <div style={{ padding: '10px' }}>
          <input
            type="text"
            value={query}
            onChange={handleSearchChange}
            placeholder="Buscar nome ou telefone"
            style={{ ...fieldStyle, marginBottom: 0 }}
          />
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {listToShow.length === 0 && (
            <p style={{ padding: '14px', color: '#64748b', fontSize: '0.8rem' }}>
              {searchResults !== null ? 'Nenhum contato encontrado.' : 'Nenhuma conversa ainda.'}
            </p>
          )}
          {listToShow.map((c) => (
            <div
              key={c.id}
              onClick={() => selectConversation(c)}
              style={{
                padding: '12px',
                cursor: 'pointer',
                backgroundColor: selectedContact?.id === c.id ? 'rgba(255,255,255,0.06)' : 'transparent',
                borderBottom: '1px solid rgba(255,255,255,0.04)'
              }}
            >
              <div style={{ fontWeight: 600, color: '#fff', fontSize: '0.88rem' }}>{c.profile_name || c.wa_id}</div>
              <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{c.wa_id}{c.source === 'ad' ? ' · anúncio' : ''}</div>
            </div>
          ))}
          {searchResults !== null && query && (
            <div
              onClick={skipMatch}
              style={{
                margin: '10px',
                padding: '12px',
                cursor: 'pointer',
                textAlign: 'center',
                color: '#94a3b8',
                fontSize: '0.78rem',
                border: '1px dashed rgba(255,255,255,0.15)',
                borderRadius: '8px'
              }}
            >
              Não achei — lançar venda mesmo assim
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: '16px', minWidth: 0 }}>
        {selectedContact ? (
          <ContactDetailPanel apiClient={caixaApi} contact={selectedContact} onUpdated={fetchConversations} />
        ) : manualEntryName !== null ? (
          <ManualSaleForm apiClient={caixaApi} initialName={manualEntryName} onDone={finishManualEntry} />
        ) : (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: '0.9rem' }}>
            Selecione uma conversa
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verificar manualmente**

```bash
cd frontend && npx vite build
```

Expected: build limpo, sem erro.

Suba os dois servidores, abra `/caixa`, logue com o PIN, e confirme:
- Selecionar uma conversa na lista abre o `ContactDetailPanel` com as 3 abas (Conversa/Histórico/Anotações).
- O seletor de etapa no topo mostra a etapa atual e, ao trocar, chama a rota de mover etapa (confira no Kanban depois que mudou).
- "Venda" e "Agendar" no topo continuam funcionando como antes (formulário, sucesso).
- Aba "Histórico" mostra os eventos do contato; aba "Anotações" salva e mantém o texto ao trocar de aba e voltar.
- "Não achei — lançar venda mesmo assim" continua funcionando (sem conversa, só o formulário de venda).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ContactDetailPanel.jsx frontend/src/components/CaixaChatView.jsx
git commit -m "feat(whatsapp): adiciona painel de contato unificado (CRM) e integra no caixa"
```

---

## Task 7: Modal reaproveitável + integração nos dois Funis e nas duas Agendas

**Files:**
- Create: `frontend/src/components/Modal.jsx`
- Modify: `frontend/src/components/CaixaFunilView.jsx`
- Modify: `frontend/src/CaixaApp.jsx`
- Modify: `frontend/src/pages/WhatsAppKanbanPage.jsx`
- Modify: `frontend/src/pages/WhatsAppAgendaPage.jsx`

**Interfaces:**
- Consumes: `ContactDetailPanel` (Tarefa 6).
- Produces: `Modal({ onClose, children, maxWidth })` — reaproveitável por qualquer tela que precise de uma janela por cima.

- [ ] **Step 1: Criar o `Modal`**

```jsx
// frontend/src/components/Modal.jsx
import React from 'react';

export default function Modal({ onClose, children, maxWidth = '720px' }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: '20px'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: '#0b0f19', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)',
          padding: '20px', width: '100%', maxWidth, maxHeight: '85vh', overflowY: 'auto'
        }}
      >
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `CaixaFunilView.jsx` — remove as abas internas, fica controlado por `view`, e os cards abrem o modal**

Substitua o conteúdo inteiro de `frontend/src/components/CaixaFunilView.jsx` por:

```jsx
// frontend/src/components/CaixaFunilView.jsx
import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import ContactDetailPanel from './ContactDetailPanel';

const STAGES = [
  { key: 'novo_lead', label: 'Novo Lead' },
  { key: 'em_atendimento', label: 'Em Atendimento' },
  { key: 'agendado', label: 'Agendado' },
  { key: 'nao_compareceu', label: 'Não Compareceu' },
  { key: 'compareceu', label: 'Compareceu' },
  { key: 'remarketing', label: 'Remarketing' }
];

function todayISODate() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatAppointment(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function CaixaFunilView({ caixaApi, inputStyle, view }) {
  const [contacts, setContacts] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [date, setDate] = useState(todayISODate());
  const [loading, setLoading] = useState(true);
  const [openContact, setOpenContact] = useState(null);

  useEffect(() => {
    if (view === 'funil') {
      fetchKanban();
    } else {
      fetchAgenda();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, date]);

  const fetchKanban = async () => {
    setLoading(true);
    try {
      const res = await caixaApi.get('/api/whatsapp/kanban');
      setContacts(res.data.contacts || []);
    } catch (err) {
      console.error('Error fetching kanban:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAgenda = async () => {
    setLoading(true);
    try {
      const res = await caixaApi.get('/api/whatsapp/agenda', { params: { date } });
      setAppointments(res.data.appointments || []);
    } catch (err) {
      console.error('Error fetching agenda:', err);
    } finally {
      setLoading(false);
    }
  };

  const refetch = () => (view === 'funil' ? fetchKanban() : fetchAgenda());

  return (
    <div>
      {view === 'agenda' && (
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={inputStyle}
        />
      )}

      {loading ? (
        <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Carregando...</p>
      ) : view === 'funil' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {STAGES.map((stage) => {
            const stageContacts = contacts.filter((c) => c.stage === stage.key);
            return (
              <div key={stage.key}>
                <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.85rem', marginBottom: '6px' }}>
                  {stage.label} ({stageContacts.length})
                </div>
                {stageContacts.length === 0 ? (
                  <p style={{ color: '#64748b', fontSize: '0.78rem' }}>Vazio</p>
                ) : (
                  stageContacts.map((c) => (
                    <div
                      key={c.id}
                      onClick={() => setOpenContact(c)}
                      style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '10px', marginBottom: '6px', fontSize: '0.8rem', cursor: 'pointer' }}
                    >
                      <div style={{ fontWeight: 600, color: '#fff' }}>{c.profile_name || c.wa_id}</div>
                      <div style={{ color: '#94a3b8' }}>{c.wa_id}</div>
                      {c.appointment_at && (
                        <div style={{ color: '#a855f7', marginTop: '2px' }}>📅 {formatAppointment(c.appointment_at)}</div>
                      )}
                    </div>
                  ))
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {appointments.length === 0 ? (
            <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Nenhum agendamento nesse dia.</p>
          ) : (
            appointments.map((a) => (
              <div
                key={a.id}
                onClick={() => setOpenContact(a)}
                style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '10px', fontSize: '0.85rem', cursor: 'pointer' }}
              >
                <div style={{ fontWeight: 600, color: '#fff' }}>{a.profile_name || a.wa_id}</div>
                <div style={{ color: '#94a3b8' }}>
                  {new Date(a.appointment_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {openContact && (
        <Modal onClose={() => setOpenContact(null)} maxWidth="520px">
          <div style={{ height: '70vh' }}>
            <ContactDetailPanel
              apiClient={caixaApi}
              contact={openContact}
              onClose={() => setOpenContact(null)}
              onUpdated={refetch}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
```

- [ ] **Step 3: `CaixaApp.jsx` — três botões no topo (Conversas/Funil/Agenda), em vez de Atender/Funil**

Em `frontend/src/CaixaApp.jsx`, o bloco da barra de navegação hoje é (dois botões, "Atender" e "Funil"):

```jsx
        {step !== 'select-restaurant' && step !== 'pin' && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
            <button
              type="button"
              onClick={() => setView('atender')}
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.85rem',
                backgroundColor: view === 'atender' ? '#6366f1' : 'rgba(255,255,255,0.05)',
                color: view === 'atender' ? '#fff' : '#94a3b8'
              }}
            >
              Atender
            </button>
            <button
              type="button"
              onClick={() => setView('funil')}
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.85rem',
                backgroundColor: view === 'funil' ? '#6366f1' : 'rgba(255,255,255,0.05)',
                color: view === 'funil' ? '#fff' : '#94a3b8'
              }}
            >
              Funil
            </button>
          </div>
        )}

        {view === 'funil' && step !== 'select-restaurant' && step !== 'pin' && (
          <CaixaFunilView caixaApi={caixaApi} inputStyle={inputStyle} />
        )}
```

Troque por três botões (`conversas` passa a ser o valor default de `view`, trocando o antigo `atender`) e passando `view="funil"`/`view="agenda"` pro componente já reescrito na Step 2:

```jsx
        {step !== 'select-restaurant' && step !== 'pin' && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
            {[['conversas', 'Conversas'], ['funil', 'Funil'], ['agenda', 'Agenda']].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setView(key)}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  backgroundColor: view === key ? '#6366f1' : 'rgba(255,255,255,0.05)',
                  color: view === key ? '#fff' : '#94a3b8'
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {view === 'conversas' && step !== 'select-restaurant' && step !== 'pin' && (
          <CaixaChatView caixaApi={caixaApi} />
        )}

        {(view === 'funil' || view === 'agenda') && step !== 'select-restaurant' && step !== 'pin' && (
          <CaixaFunilView caixaApi={caixaApi} inputStyle={inputStyle} view={view} />
        )}
```

Isso substitui também o bloco que hoje renderiza `CaixaChatView` dentro de `view === 'atender'` — se esse bloco ainda existir separado no arquivo (verifique se há um `{view === 'atender' && step === ... }` controlando o `CaixaChatView`, dependendo de como ficou depois da Tarefa 6), remova-o, já que o trecho acima cobre a exibição da conversa agora sob a chave `'conversas'`.

Também troque o valor inicial do estado `view`, de:

```js
const [view, setView] = useState('atender');
```

para:

```js
const [view, setView] = useState('conversas');
```

- [ ] **Step 4: `WhatsAppKanbanPage.jsx` (admin) — cards abrem o modal em vez de "Ver conversa"**

Em `frontend/src/pages/WhatsAppKanbanPage.jsx`, adicione os imports de `Modal` e `ContactDetailPanel`:

```js
import Modal from '../components/Modal';
import ContactDetailPanel from '../components/ContactDetailPanel';
```

Adicione o estado `openContact` logo depois de `const [loading, setLoading] = useState(true);`:

```js
  const [openContact, setOpenContact] = useState(null);
```

Troque o botão "Ver conversa" dentro do `.map` dos cards (que hoje chama `onViewConversation && onViewConversation(c.id)`) por um clique no card inteiro abrindo o modal — troque o `<div key={c.id} style={{...}}>` do card (o que envolve nome/origem/agendamento/botão) para também ter `onClick={() => setOpenContact(c)}` e `cursor: 'pointer'` no style, e **remova** o `<button onClick={() => onViewConversation && onViewConversation(c.id)}>...</button>` (as 14 linhas do botão "Ver conversa" com o ícone `ExternalLink`). O parâmetro `onViewConversation` na assinatura da função pode continuar recebido (ainda é passado pelo `App.jsx`), só não é mais chamado aqui.

No final do componente, logo antes do `</div>` que fecha a `div className="animate-fade-in"` (ou seja, como último filho, depois do bloco `{loading ? (...) : (...)}`), adicione:

```jsx
      {openContact && (
        <Modal onClose={() => setOpenContact(null)} maxWidth="640px">
          <div style={{ height: '70vh' }}>
            <ContactDetailPanel
              apiClient={axios}
              clientId={selectedClient}
              contact={openContact}
              onClose={() => setOpenContact(null)}
              onUpdated={fetchKanban}
            />
          </div>
        </Modal>
      )}
```

`selectedClient` já é a prop que `WhatsAppKanbanPage` recebe e usa em `fetchKanban` (`params: { clientId: selectedClient }`) — é o mesmo valor, só repassado agora também pro painel, já que o `axios` global do admin não carrega um `clientId` fixo como o token de staff do `/caixa` carrega.

- [ ] **Step 5: `WhatsAppAgendaPage.jsx` (admin) — mesma troca**

Em `frontend/src/pages/WhatsAppAgendaPage.jsx`, adicione os mesmos dois imports:

```js
import Modal from '../components/Modal';
import ContactDetailPanel from '../components/ContactDetailPanel';
```

Adicione o estado logo depois de `const [loading, setLoading] = useState(true);`:

```js
  const [openContact, setOpenContact] = useState(null);
```

No `.map` dos agendamentos, troque `onClick={() => onViewConversation && onViewConversation(a.id)}` do botão "Ver conversa" por `onClick={() => setOpenContact(a)}` (mantendo o resto do botão igual — ícone, texto "Ver conversa" pode virar "Abrir"). O parâmetro `onViewConversation` continua na assinatura sem problema, só não é mais chamado.

Antes do fechamento final do componente (depois do `</div>` do `className="glass-card"`), adicione:

```jsx
      {openContact && (
        <Modal onClose={() => setOpenContact(null)} maxWidth="640px">
          <div style={{ height: '70vh' }}>
            <ContactDetailPanel
              apiClient={axios}
              clientId={selectedClient}
              contact={openContact}
              onClose={() => setOpenContact(null)}
              onUpdated={fetchAgenda}
            />
          </div>
        </Modal>
      )}
```

Mesma lógica do Step 4 acima: `selectedClient` já é a prop que `WhatsAppAgendaPage` recebe e usa em `fetchAgenda`.

- [ ] **Step 6: Verificar manualmente**

```bash
cd frontend && npx vite build
```

Expected: build limpo, sem erro.

Suba os dois servidores. No painel admin: clique num card do "Funil WhatsApp" → abre o modal com conversa/histórico/anotações/mover etapa. Clique num item da "Agenda" → mesmo modal. Feche com o X ou clicando fora.

No `/caixa`: confirme os três botões no topo (Conversas/Funil/Agenda), que "Conversas" é a tela que abre por padrão depois do login, que clicar num card do Funil ou da Agenda abre o mesmo modal, e que mover a etapa ali dentro reflete de volta no Funil ao fechar o modal.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/Modal.jsx frontend/src/components/CaixaFunilView.jsx frontend/src/CaixaApp.jsx frontend/src/pages/WhatsAppKanbanPage.jsx frontend/src/pages/WhatsAppAgendaPage.jsx
git commit -m "feat(whatsapp): abre o painel de contato em modal nos dois funis e agendas"
```
