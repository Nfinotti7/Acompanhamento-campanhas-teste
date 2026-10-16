# Na Mesa (fila de espera) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fila de espera de restaurante pelo WhatsApp (Baileys), com robô que responde a posição e avisa nos marcos, e uma tela `/namesa` para a recepcionista.

**Architecture:** Três serviços novos no backend: `waitlistText` (texto puro), `waitlistQueue` (regras da fila e banco) e `waitlistBot` (conversa). Eles se ligam ao `ingestWhatsAppEvent`, que já recebe toda mensagem do Baileys e do webhook. O envio sai por um `whatsappSender` extraído do `replyToConversation`, então as mensagens do robô entram no histórico normal. A tela usa o mesmo login de staff (PIN) do `/caixa` e o mesmo SSE, num evento nomeado `waitlist`.

**Tech Stack:** Node/Express (ESM), Postgres via `config/db.js` (placeholders `?`), `node --test`, React + Vite com estilos inline (padrão do `CaixaApp.jsx`), axios, lucide-react, `qrcode` (já é dependência do backend).

**Spec:** `docs/superpowers/specs/2026-10-15-namesa-fila-design.md`

## Global Constraints

- Schema só por `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS` dentro do `initDb()` em `backend/src/config/db.js`. Nunca migração separada.
- Qualquer `client_id` usado como chave de `Map` em memória é normalizado com `String(...)` (bug que já apareceu duas vezes neste projeto).
- O robô **nunca** responde quem não está numa fila ativa e não mandou `FILA` sozinho ou `(cód. FILA)`.
- Mensagens automáticas só nos marcos: entrou, quase lá (uma vez por entrada), chamado e não veio (desligável). "Sentou" e "Remover" não mandam mensagem.
- Fila ativa = status `awaiting_size | waiting | called` com `joined_at` nas últimas 12 h.
- Ação da recepcionista sempre é gravada, mesmo que o envio da mensagem falhe (falha só vai pro log).
- Transições de status usam `UPDATE ... WHERE status IN (...) RETURNING *`, e "nenhuma linha" significa que a ação não fez nada (sem mensagem e sem erro 500).
- Commits em português, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Sem push sem o usuário pedir.
- Testes do backend rodam com `cd backend && node --test src/services/<arquivo>.test.js`.

## Review Focus

1. **Mensagem repetida do WhatsApp** (o Baileys ou o webhook reenviam a mesma mensagem): o robô não pode responder duas vezes. Só aciona quando o INSERT da mensagem gravou linha nova (Task 5 tem o teste).
2. **Duas recepcionistas apertando "Chamar" na mesma pessoa:** uma única mensagem "mesa pronta" (Task 3 tem o teste com UPDATE sem linha).
3. **Pessoa entra já na posição 1 a 3:** não pode receber "entrou" e logo em seguida "faltam N grupos" (Task 3 tem o teste de `enterQueue` marcando `notified_near`).
4. **Quem nunca mandou FILA escreve "tem fila hoje?":** o robô fica calado (Task 1 testa `isJoinCommand`, Task 4 testa `ignored`).
5. **Contato sem nome no perfil:** os textos não podem sair como "Oi, !" (Task 1 tem o teste de `renderMessage` com nome vazio).

---

### Task 1: Texto do robô (`waitlistText.js`)

**Files:**
- Create: `backend/src/services/waitlistText.js`
- Test: `backend/src/services/waitlistText.test.js`

**Interfaces:**
- Produces: `DEFAULT_MESSAGES` (objeto com as chaves `askSize, askSizeAgain, joined, status, near, called, calledReminder, noShow, left`), `MESSAGE_KEYS` (array dessas chaves), `isJoinCommand(text): boolean`, `isLeaveCommand(text): boolean`, `parsePartySize(text): number|null` (1..30), `normalizePhone(raw): string|null`, `firstName(name): string`, `formatGroupsAhead(n): string`, `renderMessage(template, vars): string`.

- [ ] **Step 1: Write the failing test**

```js
// backend/src/services/waitlistText.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_MESSAGES, MESSAGE_KEYS, isJoinCommand, isLeaveCommand, parsePartySize,
  normalizePhone, firstName, formatGroupsAhead, renderMessage
} from './waitlistText.js';

test('isJoinCommand aceita FILA sozinho e o código do QR', () => {
  assert.ok(isJoinCommand('FILA'));
  assert.ok(isJoinCommand('  fila! '));
  assert.ok(isJoinCommand('Quero entrar na fila (cód. FILA)'));
  assert.ok(isJoinCommand('quero entrar na fila (cod FILA)'));
});

test('isJoinCommand ignora frase comum com a palavra fila', () => {
  assert.ok(!isJoinCommand('tem fila hoje?'));
  assert.ok(!isJoinCommand('quero entrar na fila'));
  assert.ok(!isJoinCommand(''));
  assert.ok(!isJoinCommand(null));
});

test('isLeaveCommand aceita sair, cancelar e desistir', () => {
  for (const t of ['SAIR', 'sair da fila', 'Cancelar', 'cancela', 'desisto', 'Desistir!']) {
    assert.ok(isLeaveCommand(t), t);
  }
  assert.ok(!isLeaveCommand('vou sair daqui a pouco'));
});

test('parsePartySize entende número, palavra e "eu e mais"', () => {
  assert.equal(parsePartySize('4'), 4);
  assert.equal(parsePartySize('somos 4'), 4);
  assert.equal(parsePartySize('4 pessoas'), 4);
  assert.equal(parsePartySize('quatro'), 4);
  assert.equal(parsePartySize('Duas pessoas'), 2);
  assert.equal(parsePartySize('eu e mais 3'), 4);
  assert.equal(parsePartySize('eu e mais dois'), 3);
  assert.equal(parsePartySize('um casal'), 2);
  assert.equal(parsePartySize('só eu'), 1);
});

test('parsePartySize recusa texto sem número e números fora da faixa', () => {
  assert.equal(parsePartySize('oi'), null);
  assert.equal(parsePartySize('0'), null);
  assert.equal(parsePartySize('45'), null);
  assert.equal(parsePartySize(''), null);
});

test('normalizePhone completa o 55 e recusa lixo', () => {
  assert.equal(normalizePhone('(11) 99999-8888'), '5511999998888');
  assert.equal(normalizePhone('5511999998888'), '5511999998888');
  assert.equal(normalizePhone('1133334444'), '551133334444');
  assert.equal(normalizePhone('123'), null);
  assert.equal(normalizePhone(''), null);
});

test('firstName e formatGroupsAhead', () => {
  assert.equal(firstName('Maria Clara Souza'), 'Maria');
  assert.equal(firstName(null), '');
  assert.equal(formatGroupsAhead(1), '1 grupo');
  assert.equal(formatGroupsAhead(2), '2 grupos');
});

test('renderMessage substitui variáveis', () => {
  assert.equal(
    renderMessage('Pronto, {nome}! Posição: {posicao}.', { nome: 'Ana', posicao: 3 }),
    'Pronto, Ana! Posição: 3.'
  );
});

test('renderMessage não deixa "Oi, !" quando o nome está vazio', () => {
  assert.equal(renderMessage(DEFAULT_MESSAGES.askSize, { nome: '' }), 'Oi! Pra quantas pessoas?');
  assert.equal(renderMessage('{nome}, sua mesa está pronta!', { nome: '' }), 'Sua mesa está pronta!');
});

test('todas as chaves de mensagem têm texto padrão', () => {
  for (const key of MESSAGE_KEYS) assert.equal(typeof DEFAULT_MESSAGES[key], 'string');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node --test src/services/waitlistText.test.js`
Expected: FAIL with `Cannot find module` / `ERR_MODULE_NOT_FOUND` for `./waitlistText.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// backend/src/services/waitlistText.js
// Textos e leitura das mensagens do robô da fila (Na Mesa). Tudo puro, sem banco.

export const DEFAULT_MESSAGES = {
  askSize: 'Oi, {nome}! Pra quantas pessoas?',
  askSizeAgain: 'Não entendi 😅 Me manda só o número de pessoas, por exemplo: 4',
  joined: 'Pronto, {nome}! Você está na fila. Posição: {posicao}. Espera estimada: ~{espera} min. Mande qualquer mensagem pra ver sua posição, ou SAIR pra sair da fila.',
  status: '{nome}, sua posição na fila é {posicao}. Espera estimada: ~{espera} min. Mande SAIR pra sair da fila.',
  near: 'Só {faltam} na sua frente. Fique por perto!',
  called: '{nome}, sua mesa está pronta! Dirija-se à recepção. Seguramos por {tolerancia} minutos.',
  calledReminder: '{nome}, sua mesa já está pronta! É só ir até a recepção.',
  noShow: 'Como não te encontramos, liberamos a vaga. Se ainda quiser, mande FILA.',
  left: 'Tudo bem, você saiu da fila. Se quiser voltar, é só mandar FILA.'
};

export const MESSAGE_KEYS = Object.keys(DEFAULT_MESSAGES);

function normalize(text) {
  return String(text || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim();
}

// Só "FILA" sozinho ou o código que o QR põe na mensagem pronta. Frase comum
// ("tem fila hoje?") não pode acordar o robô num número que também atende gente.
export function isJoinCommand(text) {
  const t = normalize(text).replace(/[.!?]+$/, '').trim();
  return t === 'fila' || /\bcod\.?\s*fila\b/.test(t);
}

export function isLeaveCommand(text) {
  const t = normalize(text).replace(/[.!?]+$/, '').trim();
  return /^(sair|cancelar|cancela|desistir|desisto)( da fila)?$/.test(t);
}

const NUMBER_WORDS = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6,
  sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12
};

function readNumber(token) {
  if (/^\d+$/.test(token)) return parseInt(token, 10);
  return NUMBER_WORDS[token] ?? null;
}

function inRange(n) {
  return Number.isInteger(n) && n >= 1 && n <= 30 ? n : null;
}

export function parsePartySize(text) {
  const t = normalize(text);
  if (!t) return null;

  const plus = t.match(/eu e mais (\d+|[a-z]+)/);
  if (plus) {
    const n = readNumber(plus[1]);
    if (n !== null) return inRange(n + 1);
  }
  const digits = t.match(/\d+/);
  if (digits) return inRange(parseInt(digits[0], 10));
  if (/\bcasal\b/.test(t)) return 2;
  if (/\bso eu\b|\bsozinh[oa]\b/.test(t)) return 1;
  for (const word of t.split(/[^a-z]+/)) {
    if (word in NUMBER_WORDS) return inRange(NUMBER_WORDS[word]);
  }
  return null;
}

// wa_id do WhatsApp: só dígitos, com DDI. Número brasileiro digitado sem 55 ganha o 55.
export function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) return digits;
  return null;
}

export function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || '';
}

export function formatGroupsAhead(n) {
  return n === 1 ? '1 grupo' : `${n} grupos`;
}

export function renderMessage(template, vars = {}) {
  const text = String(template || '')
    .replace(/\{(\w+)\}/g, (_, key) => (vars[key] ?? '').toString())
    // Nome vazio: "Oi, !" vira "Oi!" e ", sua mesa" vira "Sua mesa".
    .replace(/\s*,\s*([!?.])/g, '$1')
    .replace(/^\s*,\s*/, '');
  return text.charAt(0).toUpperCase() + text.slice(1);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && node --test src/services/waitlistText.test.js`
Expected: PASS (10 testes).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/waitlistText.js backend/src/services/waitlistText.test.js
git commit -m "feat(namesa): textos e leitura das mensagens do robo da fila

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Envio reaproveitável (`whatsappSender.js`) + schema

Extrai o "manda pelo Baileys ou Cloud API e grava a mensagem" de `replyToConversation` e cria as tabelas da fila.

**Files:**
- Create: `backend/src/services/whatsappSender.js`
- Test: `backend/src/services/whatsappSender.test.js`
- Modify: `backend/src/controllers/whatsappConversationsController.js` (função `replyToConversation`, ~linhas 91-160; imports nas linhas 1-4)
- Modify: `backend/src/config/db.js` (bloco aditivo, logo depois da linha `ALTER TABLE clients ADD COLUMN IF NOT EXISTS crm_seeded_at TIMESTAMPTZ`)

**Interfaces:**
- Produces: `sendToContact({ clientId, contactId, body }, deps?) → Promise<string|null>` (wa_message_id). Erros de negócio são `SendError` com `.httpStatus` (404 contato não encontrado, 400 WhatsApp não configurado). `deps` aceita `{ db, sendViaBaileys, sendWhatsAppMessage, broadcast }`.
- Produces (banco): colunas `clients.dashboard_enabled`, `clients.waitlist_enabled` e tabelas `waitlist_settings` e `waitlist_entries` (SQL da spec).

- [ ] **Step 1: Write the failing test**

```js
// backend/src/services/whatsappSender.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendToContact, SendError } from './whatsappSender.js';

function fakeDb({ contact = { wa_id: '5511999998888' }, settings = { connection_type: 'baileys' } } = {}) {
  const calls = [];
  return {
    calls,
    query: async (sql, params = []) => {
      calls.push({ sql, params });
      if (/FROM whatsapp_contacts/.test(sql)) return { rows: contact ? [contact] : [] };
      if (/FROM whatsapp_settings/.test(sql)) return { rows: settings ? [settings] : [] };
      return { rows: [] };
    }
  };
}

test('sendToContact manda pelo Baileys, grava a mensagem e avisa a tela', async () => {
  const db = fakeDb();
  const sent = [];
  const events = [];
  const id = await sendToContact({ clientId: 7, contactId: 3, body: 'Oi' }, {
    db,
    sendViaBaileys: async (clientId, waId, body) => { sent.push({ clientId, waId, body }); return 'wamid.X'; },
    broadcast: (clientId, name, data) => events.push({ clientId, name, data })
  });
  assert.equal(id, 'wamid.X');
  assert.deepEqual(sent, [{ clientId: 7, waId: '5511999998888', body: 'Oi' }]);
  const insert = db.calls.find((c) => /INSERT INTO whatsapp_messages/.test(c.sql));
  assert.deepEqual(insert.params, [7, 3, 'Oi', 'wamid.X']);
  assert.equal(events[0].name, 'message');
  assert.equal(events[0].data.direction, 'outbound');
});

test('sendToContact usa a Cloud API quando o cliente não é Baileys', async () => {
  const db = fakeDb({ settings: { connection_type: 'cloud_api', phone_number_id: 'P', access_token: 'T' } });
  let cloudArgs;
  await sendToContact({ clientId: 7, contactId: 3, body: 'Oi' }, {
    db,
    sendWhatsAppMessage: async (args) => { cloudArgs = args; return { messages: [{ id: 'wamid.C' }] }; },
    broadcast: () => {}
  });
  assert.deepEqual(cloudArgs, { phoneNumberId: 'P', accessToken: 'T', to: '5511999998888', body: 'Oi' });
});

test('sendToContact recusa contato inexistente com 404', async () => {
  const db = fakeDb({ contact: null });
  await assert.rejects(
    sendToContact({ clientId: 7, contactId: 99, body: 'Oi' }, { db, broadcast: () => {} }),
    (err) => err instanceof SendError && err.httpStatus === 404
  );
});

test('sendToContact recusa cliente sem WhatsApp configurado com 400', async () => {
  const db = fakeDb({ settings: null });
  await assert.rejects(
    sendToContact({ clientId: 7, contactId: 3, body: 'Oi' }, { db, broadcast: () => {} }),
    (err) => err instanceof SendError && err.httpStatus === 400
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node --test src/services/whatsappSender.test.js`
Expected: FAIL, módulo não encontrado.

- [ ] **Step 3: Write the implementation**

```js
// backend/src/services/whatsappSender.js
// Manda uma mensagem de texto pra um contato, pelo canal que o cliente usa (Baileys
// ou Cloud API), e grava no histórico da conversa. Usado pela resposta manual do
// painel e pelo robô da fila (Na Mesa).
import db from '../config/db.js';
import { sendWhatsAppMessage } from './metaWhatsAppApi.js';
import { sendViaBaileys } from './baileysClient.js';
import { broadcast } from './sseHub.js';

export class SendError extends Error {
  constructor(message, httpStatus) {
    super(message);
    this.httpStatus = httpStatus;
  }
}

export async function sendToContact({ clientId, contactId, body }, deps = {}) {
  const dbImpl = deps.db || db;
  const viaBaileys = deps.sendViaBaileys || sendViaBaileys;
  const viaCloud = deps.sendWhatsAppMessage || sendWhatsAppMessage;
  const broadcastFn = deps.broadcast || broadcast;

  const { rows: contactRows } = await dbImpl.query(
    'SELECT wa_id FROM whatsapp_contacts WHERE id = ? AND client_id = ?',
    [contactId, clientId]
  );
  const contact = contactRows[0];
  if (!contact) throw new SendError('Contato não encontrado.', 404);

  const { rows: settingsRows } = await dbImpl.query(
    'SELECT phone_number_id, access_token, connection_type FROM whatsapp_settings WHERE client_id = ?',
    [clientId]
  );
  const settings = settingsRows[0];
  if (!settings) throw new SendError('WhatsApp não configurado para este cliente.', 400);

  let waMessageId = null;
  if (settings.connection_type === 'baileys') {
    waMessageId = await viaBaileys(clientId, contact.wa_id, body);
  } else {
    const sendResult = await viaCloud({
      phoneNumberId: settings.phone_number_id,
      accessToken: settings.access_token,
      to: contact.wa_id,
      body
    });
    waMessageId = sendResult?.messages?.[0]?.id || null;
  }

  // O Baileys às vezes registra a própria mensagem enviada (messages.upsert) antes desta
  // linha -- com o mesmo wa_message_id. Nesse caso só completa o status.
  await dbImpl.query(
    `INSERT INTO whatsapp_messages (client_id, contact_id, direction, body, wa_message_id, sent_at, status)
     VALUES (?, ?, 'outbound', ?, ?, CURRENT_TIMESTAMP, 'sent')
     ON CONFLICT (wa_message_id) DO UPDATE SET status = COALESCE(whatsapp_messages.status, excluded.status)`,
    [clientId, contactId, body, waMessageId]
  );

  // Responder sobe a conversa pro topo da lista e conta como "lida" pela equipe.
  await dbImpl.query(
    `UPDATE whatsapp_contacts
     SET last_message_at = CURRENT_TIMESTAMP, last_read_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [contactId]
  );

  broadcastFn(clientId, 'message', {
    contactId: Number(contactId),
    direction: 'outbound',
    body,
    sentAt: new Date().toISOString()
  });

  return waMessageId;
}
```

Antes de trocar o controller, **confira** que o trecho entre o `SELECT wa_id` e o `broadcast` de `replyToConversation` é igual ao código acima. Se houver alguma linha extra que não está aqui, leve-a para `sendToContact` também. Depois substitua o corpo de `replyToConversation` por:

```js
export async function replyToConversation(req, res) {
  try {
    const clientId = resolveClientId(req);
    const { contactId } = req.params;
    const { body } = req.body;

    if (!body) {
      return res.status(400).json({ error: 'Mensagem não pode ser vazia.' });
    }

    await sendToContact({ clientId, contactId, body });
    return res.json({ message: 'Mensagem enviada.' });
  } catch (error) {
    if (error instanceof SendError) {
      return res.status(error.httpStatus).json({ error: error.message });
    }
    console.error('Reply to conversation error:', error);
    return res.status(500).json({ error: 'Erro ao enviar mensagem.' });
  }
}
```

Imports do controller: troque `import { sendWhatsAppMessage } ...` e `import { sendViaBaileys } ...` por `import { sendToContact, SendError } from '../services/whatsappSender.js';`. Remova `broadcast` do import só se ele não for mais usado em nenhuma outra função do arquivo (confira com `grep -n broadcast backend/src/controllers/whatsappConversationsController.js`).

Schema em `backend/src/config/db.js`, logo depois da linha do `crm_seeded_at`:

```js
  // Na Mesa (fila de espera) -- ver docs/superpowers/specs/2026-10-15-namesa-fila-design.md
  await query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS dashboard_enabled BOOLEAN DEFAULT true`);
  await query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS waitlist_enabled BOOLEAN DEFAULT false`);
  await query(`
    CREATE TABLE IF NOT EXISTS waitlist_settings (
      client_id INTEGER PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
      whatsapp_number TEXT,
      default_minutes_per_party INTEGER DEFAULT 8,
      hold_minutes INTEGER DEFAULT 10,
      near_threshold INTEGER DEFAULT 2,
      notify_no_show BOOLEAN DEFAULT true,
      messages JSONB DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS waitlist_entries (
      id SERIAL PRIMARY KEY,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      contact_id INTEGER REFERENCES whatsapp_contacts(id) ON DELETE SET NULL,
      name TEXT,
      phone TEXT,
      party_size INTEGER,
      status TEXT NOT NULL CHECK (status IN ('awaiting_size','waiting','called','seated','no_show','left','removed')),
      source TEXT NOT NULL CHECK (source IN ('whatsapp','manual')),
      size_attempts INTEGER DEFAULT 0,
      needs_check BOOLEAN DEFAULT false,
      notified_near BOOLEAN DEFAULT false,
      joined_at TIMESTAMPTZ DEFAULT now(),
      called_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_waitlist_active ON waitlist_entries (client_id, status, joined_at)`);
```

- [ ] **Step 4: Run tests**

Run: `cd backend && node --test src/services/whatsappSender.test.js && node --test`
Expected: os 4 testes novos passam e a suíte inteira continua passando.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/whatsappSender.js backend/src/services/whatsappSender.test.js backend/src/controllers/whatsappConversationsController.js backend/src/config/db.js
git commit -m "refactor(whatsapp): envio reaproveitavel (sendToContact) + tabelas do Na Mesa

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Regras da fila (`waitlistQueue.js`)

**Files:**
- Create: `backend/src/services/waitlistQueue.js`
- Test: `backend/src/services/waitlistQueue.test.js`

**Interfaces:**
- Consumes: `DEFAULT_MESSAGES`, `renderMessage`, `firstName`, `formatGroupsAhead`, `normalizePhone` (Task 1); `sendToContact` (Task 2); `broadcast` de `sseHub.js`.
- Produces:
  - Puras: `ACTIVE_WINDOW_MS`, `buildQueue(entries, now) → { waiting: Entry&{position}[], called: Entry[], awaitingSize: Entry[] }`, `seatingInterval(seatedTimes, { now, defaultMinutes }) → number`, `estimateWait(position, interval) → number`, `daySummary(entries, now) → { total, seated, gaveUp, avgWaitMinutes }`.
  - Banco (todas recebem `dbImpl` primeiro e `deps = { send, broadcast, now }` por último):
    - `loadSettings(dbImpl, clientId) → Settings`, sendo `Settings = { whatsapp_number, default_minutes_per_party, hold_minutes, near_threshold, notify_no_show, messages }`, com `messages` já mesclado com `DEFAULT_MESSAGES`.
    - `loadQueueState(dbImpl, clientId, now) → { waiting (com estimated_wait), called, awaitingSize, settings, interval, summary }`.
    - `afterQueueChange(dbImpl, clientId, deps, reason='update')`.
    - `enterQueue(dbImpl, { clientId, entryId, partySize, needsCheck }, deps) → Entry|null`.
    - `transitionEntry(dbImpl, { clientId, entryId, action }, deps) → Entry|null`, com `action ∈ 'call'|'seat'|'noShow'|'remove'|'leave'`.
    - `addManualEntry(dbImpl, { clientId, name, phone, partySize }, deps) → Entry`.
    - `updateEntry(dbImpl, { clientId, entryId, name, partySize }, deps) → Entry|null`.
    - `findActiveEntryForContact(dbImpl, { clientId, contactId, waId, now }) → Entry|null`.
- SSE: `broadcast(clientId, 'waitlist', { reason, changedAt })`, com `reason ∈ 'joined'|'update'`.

- [ ] **Step 1: Write the failing test**

```js
// backend/src/services/waitlistQueue.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildQueue, seatingInterval, estimateWait, daySummary,
  transitionEntry, enterQueue, afterQueueChange, addManualEntry
} from './waitlistQueue.js';

const NOW = new Date('2026-10-15T23:00:00Z');
const minAgo = (m) => new Date(NOW.getTime() - m * 60000).toISOString();

test('buildQueue numera quem espera por ordem de chegada e ignora chamados e antigos', () => {
  const q = buildQueue([
    { id: 1, status: 'waiting', joined_at: minAgo(30) },
    { id: 2, status: 'called', joined_at: minAgo(40), called_at: minAgo(2) },
    { id: 3, status: 'waiting', joined_at: minAgo(10) },
    { id: 4, status: 'waiting', joined_at: minAgo(60 * 13) }, // mais de 12h: fora
    { id: 5, status: 'seated', joined_at: minAgo(50) },
    { id: 6, status: 'awaiting_size', joined_at: minAgo(1) }
  ], NOW);
  assert.deepEqual(q.waiting.map((e) => [e.id, e.position]), [[1, 1], [3, 2]]);
  assert.deepEqual(q.called.map((e) => e.id), [2]);
  assert.deepEqual(q.awaitingSize.map((e) => e.id), [6]);
});

test('seatingInterval usa o padrão com menos de 3 baixas e a média das últimas 2h depois', () => {
  assert.equal(seatingInterval([minAgo(5), minAgo(15)], { now: NOW, defaultMinutes: 8 }), 8);
  assert.equal(seatingInterval([minAgo(30), minAgo(20), minAgo(10)], { now: NOW, defaultMinutes: 8 }), 10);
  // baixa de 3h atrás não entra; intervalo gigante é limitado a 30
  assert.equal(seatingInterval([minAgo(180), minAgo(100), minAgo(10), minAgo(5)], { now: NOW, defaultMinutes: 8 }), 17.5);
});

test('estimateWait arredonda pra múltiplo de 5, mínimo 5', () => {
  assert.equal(estimateWait(1, 3), 5);
  assert.equal(estimateWait(3, 8), 25);
  assert.equal(estimateWait(2, 10), 20);
});

test('daySummary conta entradas, sentados, desistências e espera média', () => {
  const s = daySummary([
    { status: 'seated', joined_at: minAgo(40), finished_at: minAgo(20) },
    { status: 'seated', joined_at: minAgo(30), finished_at: minAgo(20) },
    { status: 'no_show', joined_at: minAgo(30) },
    { status: 'left', joined_at: minAgo(30) },
    { status: 'waiting', joined_at: minAgo(5) }
  ], NOW);
  assert.deepEqual(s, { total: 5, seated: 2, gaveUp: 2, avgWaitMinutes: 15 });
});

// fake-db por padrão de SQL; cada handler pode ser função (params) => result
function fakeDb(handlers) {
  const calls = [];
  return {
    calls,
    query: async (sql, params = []) => {
      calls.push({ sql, params });
      for (const [pattern, result] of handlers) {
        if (pattern.test(sql)) return typeof result === 'function' ? result(params, sql) : result;
      }
      return { rows: [] };
    }
  };
}

const deps = (extra = {}) => {
  const sent = [];
  const events = [];
  return {
    sent, events,
    deps: {
      send: async (msg) => { sent.push(msg); return 'wamid'; },
      broadcast: (clientId, name, data) => events.push({ clientId, name, data }),
      now: () => NOW,
      ...extra
    }
  };
};

test('transitionEntry chamar manda "mesa pronta" uma vez e atualiza a tela', async () => {
  const entry = { id: 9, client_id: 1, contact_id: 3, name: 'Ana Souza', status: 'called' };
  const db = fakeDb([[/UPDATE waitlist_entries SET status/, { rows: [entry] }]]);
  const { sent, events, deps: d } = deps();
  const result = await transitionEntry(db, { clientId: 1, entryId: 9, action: 'call' }, d);
  assert.equal(result.id, 9);
  assert.equal(sent.length, 1);
  assert.match(sent[0].body, /^Ana, sua mesa está pronta!.*10 minutos/);
  assert.equal(events.at(-1).name, 'waitlist');
});

test('transitionEntry sem linha atualizada (outra recepcionista já fez) não manda nada', async () => {
  const db = fakeDb([[/UPDATE waitlist_entries SET status/, { rows: [] }]]);
  const { sent, deps: d } = deps();
  const result = await transitionEntry(db, { clientId: 1, entryId: 9, action: 'call' }, d);
  assert.equal(result, null);
  assert.equal(sent.length, 0);
});

test('transitionEntry "sentou" não manda mensagem', async () => {
  const db = fakeDb([[/UPDATE waitlist_entries SET status/, { rows: [{ id: 9, client_id: 1, contact_id: 3, status: 'seated' }] }]]);
  const { sent, deps: d } = deps();
  await transitionEntry(db, { clientId: 1, entryId: 9, action: 'seat' }, d);
  assert.equal(sent.length, 0);
});

test('transitionEntry "não veio" respeita notify_no_show desligado', async () => {
  const db = fakeDb([
    [/UPDATE waitlist_entries SET status/, { rows: [{ id: 9, client_id: 1, contact_id: 3, status: 'no_show' }] }],
    [/FROM waitlist_settings/, { rows: [{ notify_no_show: false }] }]
  ]);
  const { sent, deps: d } = deps();
  await transitionEntry(db, { clientId: 1, entryId: 9, action: 'noShow' }, d);
  assert.equal(sent.length, 0);
});

test('a falha no envio não impede a ação de ser gravada', async () => {
  const db = fakeDb([[/UPDATE waitlist_entries SET status/, { rows: [{ id: 9, client_id: 1, contact_id: 3, status: 'called' }] }]]);
  const { deps: d } = deps({ send: async () => { throw new Error('Baileys caiu'); } });
  const result = await transitionEntry(db, { clientId: 1, entryId: 9, action: 'call' }, d);
  assert.equal(result.id, 9);
});

test('afterQueueChange avisa "quase lá" uma vez só por entrada', async () => {
  let claimed = false;
  const entries = [
    { id: 1, client_id: 1, contact_id: 11, status: 'waiting', joined_at: minAgo(30), notified_near: true },
    { id: 2, client_id: 1, contact_id: 12, status: 'waiting', joined_at: minAgo(20), notified_near: true },
    { id: 3, client_id: 1, contact_id: 13, name: 'Bia', status: 'waiting', joined_at: minAgo(10), notified_near: false },
    { id: 4, client_id: 1, contact_id: 14, status: 'waiting', joined_at: minAgo(5), notified_near: false }
  ];
  const db = fakeDb([
    [/SELECT \* FROM waitlist_entries/, { rows: entries }],
    [/SET notified_near = true/, (params) => {
      if (params[0] !== 3 || claimed) return { rows: [] };
      claimed = true;
      return { rows: [{ id: 3 }] };
    }]
  ]);
  const { sent, deps: d } = deps();
  await afterQueueChange(db, 1, d);
  await afterQueueChange(db, 1, d);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].contactId, 13);
  assert.match(sent[0].body, /2 grupos/);
});

test('enterQueue já perto da vez marca notified_near e não manda "quase lá" em seguida', async () => {
  let entries = [{ id: 5, client_id: 1, contact_id: 13, name: 'Caio', status: 'awaiting_size', joined_at: minAgo(1), notified_near: false }];
  const db = fakeDb([
    [/SET status = 'waiting'/, () => {
      entries = [{ ...entries[0], status: 'waiting', party_size: 4, joined_at: NOW.toISOString() }];
      return { rows: entries };
    }],
    [/SELECT \* FROM waitlist_entries/, () => ({ rows: entries })],
    [/SET notified_near = true/, () => {
      if (entries[0].notified_near) return { rows: [] };
      entries = [{ ...entries[0], notified_near: true }];
      return { rows: [{ id: 5 }] };
    }]
  ]);
  const { sent, events, deps: d } = deps();
  await enterQueue(db, { clientId: 1, entryId: 5, partySize: 4, needsCheck: false }, d);
  assert.equal(sent.length, 1);
  assert.match(sent[0].body, /^Pronto, Caio! Você está na fila\. Posição: 1\. Espera estimada: ~10 min/);
  assert.equal(events.at(-1).data.reason, 'joined');
});

test('addManualEntry sem telefone não cria contato nem manda mensagem', async () => {
  const db = fakeDb([
    [/INSERT INTO waitlist_entries/, { rows: [{ id: 8 }] }],
    [/SET status = 'waiting'/, { rows: [{ id: 8, client_id: 1, contact_id: null, status: 'waiting' }] }]
  ]);
  const { sent, deps: d } = deps();
  await addManualEntry(db, { clientId: 1, name: 'Mesa do Zé', phone: '', partySize: 3 }, d);
  assert.equal(sent.length, 0);
  assert.ok(!db.calls.some((c) => /INSERT INTO whatsapp_contacts/.test(c.sql)));
});

test('addManualEntry recusa telefone inválido', async () => {
  const db = fakeDb([]);
  const { deps: d } = deps();
  await assert.rejects(addManualEntry(db, { clientId: 1, name: 'X', phone: '123', partySize: 2 }, d), /Telefone inválido/);
});
```

Observação sobre o teste de `enterQueue`: a fila tem 1 pessoa e não há baixas, então o intervalo é o padrão de 8 min, e a espera é 1 × 8, arredondada para 10.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node --test src/services/waitlistQueue.test.js`
Expected: FAIL, módulo não encontrado.

- [ ] **Step 3: Write the implementation**

```js
// backend/src/services/waitlistQueue.js
// Regras da fila do Na Mesa: posição, espera estimada, mudanças de status e os
// avisos automáticos (só nos marcos -- ver spec 2026-10-15-namesa-fila-design.md).
import db from '../config/db.js';
import { broadcast } from './sseHub.js';
import { sendToContact } from './whatsappSender.js';
import { DEFAULT_MESSAGES, renderMessage, firstName, formatGroupsAhead, normalizePhone } from './waitlistText.js';

export const ACTIVE_WINDOW_MS = 12 * 60 * 60 * 1000;
const ACTIVE_STATUSES = ['awaiting_size', 'waiting', 'called'];
const INTERVAL_WINDOW_MS = 2 * 60 * 60 * 1000;
const MAX_GAP_MINUTES = 30;

const time = (v) => new Date(v).getTime();

export function buildQueue(entries, now = new Date()) {
  const cutoff = now.getTime() - ACTIVE_WINDOW_MS;
  const active = entries.filter((e) => ACTIVE_STATUSES.includes(e.status) && time(e.joined_at) >= cutoff);
  const byJoin = (a, b) => time(a.joined_at) - time(b.joined_at) || a.id - b.id;
  return {
    waiting: active.filter((e) => e.status === 'waiting').sort(byJoin).map((e, i) => ({ ...e, position: i + 1 })),
    called: active.filter((e) => e.status === 'called').sort((a, b) => time(a.called_at) - time(b.called_at)),
    awaitingSize: active.filter((e) => e.status === 'awaiting_size').sort(byJoin)
  };
}

// Minutos entre uma mesa liberada e a próxima, pela média das baixas "sentou" das
// últimas 2h (estilo Yelp: dado real, não chute). Cada intervalo é limitado a 30 min
// pra uma calmaria sem fila não inflar a estimativa.
export function seatingInterval(seatedTimes, { now = new Date(), defaultMinutes }) {
  const recent = seatedTimes
    .map(time)
    .filter((t) => t >= now.getTime() - INTERVAL_WINDOW_MS)
    .sort((a, b) => a - b);
  if (recent.length < 3) return defaultMinutes;
  let total = 0;
  for (let i = 1; i < recent.length; i++) {
    total += Math.min((recent[i] - recent[i - 1]) / 60000, MAX_GAP_MINUTES);
  }
  return total / (recent.length - 1);
}

export function estimateWait(position, interval) {
  return Math.max(5, Math.ceil((position * interval) / 5) * 5);
}

export function daySummary(entries, now = new Date()) {
  const cutoff = now.getTime() - ACTIVE_WINDOW_MS;
  const today = entries.filter((e) => time(e.joined_at) >= cutoff);
  const seated = today.filter((e) => e.status === 'seated');
  const waits = seated.filter((e) => e.finished_at).map((e) => (time(e.finished_at) - time(e.joined_at)) / 60000);
  return {
    total: today.length,
    seated: seated.length,
    gaveUp: today.filter((e) => e.status === 'no_show' || e.status === 'left').length,
    avgWaitMinutes: waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : null
  };
}

export async function loadSettings(dbImpl, clientId) {
  const { rows } = await dbImpl.query('SELECT * FROM waitlist_settings WHERE client_id = ?', [clientId]);
  const row = rows[0] || {};
  return {
    whatsapp_number: row.whatsapp_number || null,
    default_minutes_per_party: row.default_minutes_per_party ?? 8,
    hold_minutes: row.hold_minutes ?? 10,
    near_threshold: row.near_threshold ?? 2,
    notify_no_show: row.notify_no_show ?? true,
    messages: { ...DEFAULT_MESSAGES, ...(row.messages || {}) }
  };
}

export async function loadQueueState(dbImpl, clientId, now = new Date()) {
  const since = new Date(now.getTime() - ACTIVE_WINDOW_MS);
  const { rows: entries } = await dbImpl.query(
    `SELECT * FROM waitlist_entries WHERE client_id = ? AND joined_at >= ? ORDER BY joined_at ASC, id ASC`,
    [clientId, since]
  );
  const settings = await loadSettings(dbImpl, clientId);
  const queue = buildQueue(entries, now);
  const seatedTimes = entries.filter((e) => e.status === 'seated' && e.finished_at).map((e) => e.finished_at);
  const interval = seatingInterval(seatedTimes, { now, defaultMinutes: settings.default_minutes_per_party });
  return {
    waiting: queue.waiting.map((e) => ({ ...e, estimated_wait: estimateWait(e.position, interval) })),
    called: queue.called,
    awaitingSize: queue.awaitingSize,
    settings,
    interval,
    summary: daySummary(entries, now)
  };
}

function resolveDeps(deps) {
  return {
    send: deps.send || sendToContact,
    broadcastFn: deps.broadcast || broadcast,
    now: deps.now ? deps.now() : new Date()
  };
}

// Mensagem automática de um marco. Falha de envio (WhatsApp caído) só vai pro log:
// a ação da recepcionista já foi gravada e não pode ser desfeita por causa disso.
async function notifyEntry(entry, key, vars, { settings, send }) {
  if (!entry.contact_id) return false;
  const body = renderMessage(settings.messages[key], {
    nome: firstName(entry.name),
    tolerancia: settings.hold_minutes,
    ...vars
  });
  try {
    await send({ clientId: entry.client_id, contactId: entry.contact_id, body });
    return true;
  } catch (error) {
    console.error(`Na Mesa: falha ao enviar "${key}" pra entrada ${entry.id}:`, error.message);
    return false;
  }
}

async function claimNear(dbImpl, entryId) {
  const { rows } = await dbImpl.query(
    `UPDATE waitlist_entries SET notified_near = true WHERE id = ? AND notified_near = false RETURNING id`,
    [entryId]
  );
  return rows.length > 0;
}

export async function afterQueueChange(dbImpl, clientId, deps = {}, reason = 'update') {
  const { send, broadcastFn, now } = resolveDeps(deps);
  const state = await loadQueueState(dbImpl, clientId, now);
  const limit = state.settings.near_threshold + 1;
  for (const entry of state.waiting) {
    if (entry.position > limit || entry.notified_near) continue;
    if (!(await claimNear(dbImpl, entry.id))) continue;
    if (entry.position > 1) {
      await notifyEntry(entry, 'near', { faltam: formatGroupsAhead(entry.position - 1) }, { settings: state.settings, send });
    }
  }
  broadcastFn(clientId, 'waitlist', { reason, changedAt: now.toISOString() });
  return state;
}

// awaiting_size -> waiting. joined_at é renovado aqui: a posição conta a partir de
// quando a pessoa respondeu o número de pessoas.
export async function enterQueue(dbImpl, { clientId, entryId, partySize, needsCheck = false }, deps = {}) {
  const { send, now } = resolveDeps(deps);
  const { rows } = await dbImpl.query(
    `UPDATE waitlist_entries SET status = 'waiting', party_size = ?, needs_check = ?, joined_at = CURRENT_TIMESTAMP
     WHERE id = ? AND client_id = ? AND status = 'awaiting_size' RETURNING *`,
    [partySize, needsCheck, entryId, clientId]
  );
  if (!rows[0]) return null;

  const state = await loadQueueState(dbImpl, clientId, now);
  const me = state.waiting.find((e) => e.id === rows[0].id) || { ...rows[0], position: 1, estimated_wait: estimateWait(1, state.interval) };
  // Já entrou perto da vez: o "Entrou" já diz a posição, não manda "quase lá" logo depois.
  if (me.position <= state.settings.near_threshold + 1) await claimNear(dbImpl, me.id);
  await notifyEntry(me, 'joined', { posicao: me.position, espera: me.estimated_wait }, { settings: state.settings, send });
  await afterQueueChange(dbImpl, clientId, deps, 'joined');
  return me;
}

const TRANSITIONS = {
  call: { from: ['waiting'], to: 'called', set: 'called_at = CURRENT_TIMESTAMP', message: 'called' },
  seat: { from: ['waiting', 'called'], to: 'seated', set: 'finished_at = CURRENT_TIMESTAMP' },
  noShow: { from: ['waiting', 'called'], to: 'no_show', set: 'finished_at = CURRENT_TIMESTAMP', message: 'noShow' },
  remove: { from: ACTIVE_STATUSES, to: 'removed', set: 'finished_at = CURRENT_TIMESTAMP' },
  leave: { from: ACTIVE_STATUSES, to: 'left', set: 'finished_at = CURRENT_TIMESTAMP', message: 'left' }
};

export async function transitionEntry(dbImpl, { clientId, entryId, action }, deps = {}) {
  const t = TRANSITIONS[action];
  if (!t) throw new Error(`Ação inválida: ${action}`);
  const { send } = resolveDeps(deps);
  const placeholders = t.from.map(() => '?').join(', ');
  const { rows } = await dbImpl.query(
    `UPDATE waitlist_entries SET status = ?, ${t.set}
     WHERE id = ? AND client_id = ? AND status IN (${placeholders}) RETURNING *`,
    [t.to, entryId, clientId, ...t.from]
  );
  const entry = rows[0];
  if (!entry) return null;

  const settings = await loadSettings(dbImpl, clientId);
  const silent = action === 'noShow' && !settings.notify_no_show;
  if (t.message && !silent) await notifyEntry(entry, t.message, {}, { settings, send });
  await afterQueueChange(dbImpl, clientId, deps);
  return entry;
}

export async function addManualEntry(dbImpl, { clientId, name, phone, partySize }, deps = {}) {
  const rawPhone = String(phone || '').trim();
  const waId = rawPhone ? normalizePhone(rawPhone) : null;
  if (rawPhone && !waId) throw new Error('Telefone inválido. Use DDD + número, ex: (11) 99999-8888.');
  const size = Number(partySize);
  if (!Number.isInteger(size) || size < 1 || size > 30) throw new Error('Número de pessoas inválido.');

  let contactId = null;
  if (waId) {
    const { rows } = await dbImpl.query(
      `INSERT INTO whatsapp_contacts (client_id, wa_id, profile_name, source)
       VALUES (?, ?, ?, 'organic')
       ON CONFLICT (client_id, wa_id) DO UPDATE SET profile_name = COALESCE(whatsapp_contacts.profile_name, excluded.profile_name)
       RETURNING id`,
      [clientId, waId, name || null]
    );
    contactId = rows[0].id;
  }

  const { rows } = await dbImpl.query(
    `INSERT INTO waitlist_entries (client_id, contact_id, name, phone, status, source)
     VALUES (?, ?, ?, ?, 'awaiting_size', 'manual') RETURNING id`,
    [clientId, contactId, name || null, waId]
  );
  return enterQueue(dbImpl, { clientId, entryId: rows[0].id, partySize: size, needsCheck: false }, deps);
}

export async function updateEntry(dbImpl, { clientId, entryId, name, partySize }, deps = {}) {
  const size = partySize === undefined || partySize === null || partySize === '' ? null : Number(partySize);
  if (size !== null && (!Number.isInteger(size) || size < 1 || size > 30)) throw new Error('Número de pessoas inválido.');
  const { rows } = await dbImpl.query(
    `UPDATE waitlist_entries
     SET name = COALESCE(?, name), party_size = COALESCE(?, party_size), needs_check = false
     WHERE id = ? AND client_id = ? RETURNING *`,
    [name ? String(name).trim() : null, size, entryId, clientId]
  );
  if (rows[0]) await afterQueueChange(dbImpl, clientId, deps);
  return rows[0] || null;
}

export async function findActiveEntryForContact(dbImpl, { clientId, contactId, waId, now = new Date() }) {
  const since = new Date(now.getTime() - ACTIVE_WINDOW_MS);
  const { rows } = await dbImpl.query(
    `SELECT * FROM waitlist_entries
     WHERE client_id = ? AND status IN ('awaiting_size', 'waiting', 'called') AND joined_at >= ?
       AND (contact_id = ? OR phone = ?)
     ORDER BY joined_at DESC LIMIT 1`,
    [clientId, since, contactId, waId]
  );
  return rows[0] || null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && node --test src/services/waitlistQueue.test.js`
Expected: PASS (13 testes). Se `seatingInterval` com 4 baixas der outro valor, confira a conta: as baixas de 100, 10 e 5 min atrás dão os intervalos `min(90,30)=30` e `5`, com média 17,5.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/waitlistQueue.js backend/src/services/waitlistQueue.test.js
git commit -m "feat(namesa): regras da fila (posicao, espera estimada, marcos)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Robô da conversa (`waitlistBot.js`)

**Files:**
- Create: `backend/src/services/waitlistBot.js`
- Test: `backend/src/services/waitlistBot.test.js`

**Interfaces:**
- Consumes: `findActiveEntryForContact`, `loadSettings`, `loadQueueState`, `enterQueue`, `transitionEntry`, `afterQueueChange` (Task 3); `isJoinCommand`, `isLeaveCommand`, `parsePartySize`, `renderMessage`, `firstName` (Task 1).
- Produces: `handleInboundForWaitlist({ clientId, contactId, waId, profileName, body }, deps?) → Promise<'ignored'|'asked_size'|'asked_size_again'|'joined'|'joined_unchecked'|'left'|'called_reminder'|'status'>`. `deps = { db, send, broadcast, now }`.

- [ ] **Step 1: Write the failing test**

```js
// backend/src/services/waitlistBot.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleInboundForWaitlist } from './waitlistBot.js';

const NOW = new Date('2026-10-15T23:00:00Z');

// Banco em memória mínimo: só o que o robô e a fila consultam.
function memoryDb() {
  const entries = [];
  let nextId = 1;
  const calls = [];
  const query = async (sql, params = []) => {
    calls.push(sql);
    if (/INSERT INTO waitlist_entries/.test(sql)) {
      const [client_id, contact_id, name, phone] = params;
      const e = { id: nextId++, client_id, contact_id, name, phone, status: 'awaiting_size', size_attempts: 0, notified_near: false, joined_at: NOW.toISOString() };
      entries.push(e);
      return { rows: [{ id: e.id }] };
    }
    if (/SELECT \* FROM waitlist_entries\s+WHERE client_id = \? AND status IN/.test(sql)) {
      const [, , contactId, waId] = params;
      const found = entries.filter((e) => ['awaiting_size', 'waiting', 'called'].includes(e.status) && (e.contact_id === contactId || e.phone === waId));
      return { rows: found.slice(-1) };
    }
    if (/SELECT \* FROM waitlist_entries/.test(sql)) return { rows: entries };
    if (/SET size_attempts = size_attempts \+ 1/.test(sql)) {
      entries.find((e) => e.id === params[0]).size_attempts++;
      return { rows: [] };
    }
    if (/SET contact_id = \?/.test(sql)) {
      entries.find((e) => e.id === params[1]).contact_id = params[0];
      return { rows: [] };
    }
    if (/SET status = 'waiting'/.test(sql)) {
      const [party_size, needs_check, id] = params;
      const e = entries.find((x) => x.id === id && x.status === 'awaiting_size');
      if (!e) return { rows: [] };
      Object.assign(e, { status: 'waiting', party_size, needs_check });
      return { rows: [e] };
    }
    if (/SET notified_near = true/.test(sql)) {
      const e = entries.find((x) => x.id === params[0] && !x.notified_near);
      if (!e) return { rows: [] };
      e.notified_near = true;
      return { rows: [{ id: e.id }] };
    }
    if (/UPDATE waitlist_entries SET status = \?/.test(sql)) {
      const [to, id, , ...from] = params;
      const e = entries.find((x) => x.id === id && from.includes(x.status));
      if (!e) return { rows: [] };
      e.status = to;
      return { rows: [e] };
    }
    return { rows: [] };
  };
  return { entries, calls, query };
}

function setup() {
  const db = memoryDb();
  const sent = [];
  const deps = {
    db,
    send: async (m) => { sent.push(m.body); return 'wamid'; },
    broadcast: () => {},
    now: () => NOW
  };
  const say = (body, contactId = 3) =>
    handleInboundForWaitlist({ clientId: 1, contactId, waId: `55119999900${contactId}`, profileName: 'Maria Souza', body }, deps);
  return { db, sent, say };
}

test('quem não está na fila e não mandou FILA é ignorado', async () => {
  const { sent, say } = setup();
  assert.equal(await say('tem fila hoje?'), 'ignored');
  assert.equal(sent.length, 0);
});

test('fluxo completo: FILA, tamanho inválido, tamanho válido, consulta e SAIR', async () => {
  const { sent, say, db } = setup();
  assert.equal(await say('Quero entrar na fila (cód. FILA)'), 'asked_size');
  assert.equal(sent.at(-1), 'Oi, Maria! Pra quantas pessoas?');

  assert.equal(await say('oi?'), 'asked_size_again');
  assert.match(sent.at(-1), /Não entendi/);

  assert.equal(await say('somos 4'), 'joined');
  assert.match(sent.at(-1), /Posição: 1/);
  assert.equal(db.entries[0].party_size, 4);

  assert.equal(await say('e aí?'), 'status');
  assert.match(sent.at(-1), /sua posição na fila é 1/);

  assert.equal(await say('FILA'), 'status'); // não cria segunda entrada
  assert.equal(db.entries.length, 1);

  assert.equal(await say('sair'), 'left');
  assert.match(sent.at(-1), /você saiu da fila/);
  assert.equal(db.entries[0].status, 'left');
});

test('depois de 2 respostas sem número, entra com 2 pessoas e marca pra conferir', async () => {
  const { say, db } = setup();
  await say('FILA');
  await say('hã');
  await say('não sei');
  assert.equal(await say('???'), 'joined_unchecked');
  assert.equal(db.entries[0].party_size, 2);
  assert.equal(db.entries[0].needs_check, true);
});

test('quem já foi chamado recebe a lembrança da mesa pronta', async () => {
  const { say, db, sent } = setup();
  await say('FILA');
  await say('2');
  db.entries[0].status = 'called';
  assert.equal(await say('cheguei?'), 'called_reminder');
  assert.match(sent.at(-1), /mesa já está pronta/);
});

test('entrada manual com telefone é ligada ao contato quando a pessoa escreve', async () => {
  const { say, db } = setup();
  db.entries.push({ id: 50, client_id: 1, contact_id: null, phone: '5511999990003', name: 'Zé', status: 'waiting', notified_near: true, joined_at: NOW.toISOString() });
  assert.equal(await say('qual minha posição?'), 'status');
  assert.equal(db.entries[0].contact_id, 3);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node --test src/services/waitlistBot.test.js`
Expected: FAIL, módulo não encontrado.

- [ ] **Step 3: Write the implementation**

```js
// backend/src/services/waitlistBot.js
// Conversa do robô da fila (Na Mesa). Só age com quem mandou FILA ou já está numa
// fila ativa -- o resto do WhatsApp do restaurante segue pro atendimento humano.
import db from '../config/db.js';
import { sendToContact } from './whatsappSender.js';
import { isJoinCommand, isLeaveCommand, parsePartySize, renderMessage, firstName } from './waitlistText.js';
import {
  findActiveEntryForContact, loadSettings, loadQueueState, enterQueue, transitionEntry, afterQueueChange
} from './waitlistQueue.js';

const MAX_SIZE_RETRIES = 2;

export async function handleInboundForWaitlist({ clientId, contactId, waId, profileName, body }, deps = {}) {
  const dbImpl = deps.db || db;
  const send = deps.send || sendToContact;
  const now = deps.now ? deps.now() : new Date();
  const queueDeps = { ...deps, send };
  const text = body || '';

  const entry = await findActiveEntryForContact(dbImpl, { clientId, contactId, waId, now });
  const settings = await loadSettings(dbImpl, clientId);
  const reply = (key, vars = {}) => send({
    clientId,
    contactId,
    body: renderMessage(settings.messages[key], {
      nome: firstName(entry?.name || profileName),
      tolerancia: settings.hold_minutes,
      ...vars
    })
  });

  if (!entry) {
    if (!isJoinCommand(text)) return 'ignored';
    await dbImpl.query(
      `INSERT INTO waitlist_entries (client_id, contact_id, name, phone, status, source)
       VALUES (?, ?, ?, ?, 'awaiting_size', 'whatsapp') RETURNING id`,
      [clientId, contactId, profileName || null, waId]
    );
    await reply('askSize');
    await afterQueueChange(dbImpl, clientId, queueDeps);
    return 'asked_size';
  }

  // Entrada manual (recepcionista digitou o telefone): liga ao contato na 1ª mensagem.
  if (!entry.contact_id) {
    await dbImpl.query(`UPDATE waitlist_entries SET contact_id = ? WHERE id = ?`, [contactId, entry.id]);
    entry.contact_id = contactId;
  }

  if (isLeaveCommand(text)) {
    await transitionEntry(dbImpl, { clientId, entryId: entry.id, action: 'leave' }, queueDeps);
    return 'left';
  }

  if (entry.status === 'awaiting_size') {
    const size = parsePartySize(text);
    if (size) {
      await enterQueue(dbImpl, { clientId, entryId: entry.id, partySize: size, needsCheck: false }, queueDeps);
      return 'joined';
    }
    if ((entry.size_attempts || 0) >= MAX_SIZE_RETRIES) {
      await enterQueue(dbImpl, { clientId, entryId: entry.id, partySize: 2, needsCheck: true }, queueDeps);
      return 'joined_unchecked';
    }
    await dbImpl.query(`UPDATE waitlist_entries SET size_attempts = size_attempts + 1 WHERE id = ?`, [entry.id]);
    await reply('askSizeAgain');
    return 'asked_size_again';
  }

  if (entry.status === 'called') {
    await reply('calledReminder');
    return 'called_reminder';
  }

  const state = await loadQueueState(dbImpl, clientId, now);
  const me = state.waiting.find((e) => e.id === entry.id);
  await reply('status', { posicao: me?.position ?? '-', espera: me?.estimated_wait ?? '-' });
  return 'status';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && node --test src/services/waitlistBot.test.js`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/waitlistBot.js backend/src/services/waitlistBot.test.js
git commit -m "feat(namesa): robo da fila no WhatsApp (entrar, posicao, sair)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Ligar o robô no recebimento + cliente sem CRM

**Files:**
- Modify: `backend/src/services/whatsappIngest.js` (imports nas linhas 1-4; corpo de `ingestWhatsAppEvent`)
- Test: `backend/src/services/whatsappIngest.test.js` (adicionar testes no fim)

**Interfaces:**
- Consumes: `handleInboundForWaitlist` (Task 4).
- Produces: `ingestWhatsAppEvent(clientId, event, deps)` aceita `deps.onInbound` (padrão: `handleInboundForWaitlist`). Cliente com `dashboard_enabled = false` pula `matchTrackingClick` e `moveToAutoStage`.

- [ ] **Step 1: Write the failing tests** (no fim de `whatsappIngest.test.js`)

```js
function flagsDb(flags) {
  const calls = [];
  let nextId = 1;
  return {
    calls,
    query: async (sql, params = []) => {
      calls.push({ sql, params });
      if (/FROM clients WHERE id/.test(sql)) return { rows: [flags] };
      if (/RETURNING id/.test(sql)) return { rows: [{ id: nextId++ }] };
      return { rows: [] };
    }
  };
}

const tick = () => new Promise((r) => setImmediate(r));

test('ingestWhatsAppEvent aciona o robô da fila só pra cliente com Na Mesa e mensagem nova', async () => {
  const db = flagsDb({ dashboard_enabled: false, waitlist_enabled: true });
  const seen = [];
  await ingestWhatsAppEvent(5, baseEvent({ body: 'FILA' }), { db, broadcast: () => {}, onInbound: async (args) => seen.push(args) });
  await tick();
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0], { clientId: 5, contactId: 1, waId: '5511999998888', profileName: 'Maria Teste', body: 'FILA' });
  // sem CRM: não entra no funil
  assert.ok(!db.calls.some((c) => /UPDATE whatsapp_contacts SET stage_id/.test(c.sql)));
});

test('ingestWhatsAppEvent não aciona o robô em mensagem repetida nem enviada por nós', async () => {
  const seen = [];
  const onInbound = async (args) => seen.push(args);
  const repeated = {
    query: async (sql) => {
      if (/FROM clients WHERE id/.test(sql)) return { rows: [{ dashboard_enabled: false, waitlist_enabled: true }] };
      if (/INSERT INTO whatsapp_messages/.test(sql)) return { rows: [] }; // ON CONFLICT DO NOTHING
      if (/RETURNING id/.test(sql)) return { rows: [{ id: 1 }] };
      return { rows: [] };
    }
  };
  await ingestWhatsAppEvent(5, baseEvent({ body: 'FILA' }), { db: repeated, broadcast: () => {}, onInbound });
  await ingestWhatsAppEvent(5, baseEvent({ body: 'FILA', direction: 'outbound', waMessageId: 'w2' }), { db: flagsDb({ waitlist_enabled: true }), broadcast: () => {}, onInbound });
  await tick();
  assert.equal(seen.length, 0);
});

test('ingestWhatsAppEvent sem Na Mesa não aciona o robô e continua no CRM', async () => {
  const db = flagsDb({ dashboard_enabled: true, waitlist_enabled: false });
  const seen = [];
  await ingestWhatsAppEvent(5, baseEvent({ body: 'FILA' }), { db, broadcast: () => {}, onInbound: async (a) => seen.push(a) });
  await tick();
  assert.equal(seen.length, 0);
  assert.ok(db.calls.some((c) => /UPDATE whatsapp_contacts SET stage_id/.test(c.sql)));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && node --test src/services/whatsappIngest.test.js`
Expected: os 3 testes novos falham (o robô nunca é chamado e o CRM roda sempre). Os antigos passam.

- [ ] **Step 3: Write the implementation**

Em `whatsappIngest.js`, adicione o import:

```js
import { handleInboundForWaitlist } from './waitlistBot.js';
```

Em `ingestWhatsAppEvent`, logo depois de `const contactId = contactRows[0].id;`, troque o bloco do `matchTrackingClick` + `moveToAutoStage` por:

```js
  // Cliente só do Na Mesa (sem dashboard) não tem funil nem Link Rastreável.
  const { rows: flagRows } = await dbImpl.query(
    `SELECT dashboard_enabled, waitlist_enabled FROM clients WHERE id = ?`,
    [clientId]
  );
  const flags = flagRows[0] || {};
  const usesCrm = flags.dashboard_enabled !== false;

  // Antes de entrar no funil: se veio pelo Link Rastreável, a origem já fica certa pro
  // evento Lead que a entrada no funil pode disparar.
  if (usesCrm && event.direction === 'inbound') {
    await matchTrackingClick(dbImpl, { clientId, contactId, body: event.body });
  }

  // Contato novo entra no funil (etapa de "novo lead"). Quem já está numa etapa fica lá:
  // mensagem comum não move card -- só agendamento e venda (ver crmStages.js).
  if (usesCrm) {
    await moveToAutoStage(dbImpl, { clientId, contactId, event: 'novo_lead' });
  }
```

E logo depois do bloco `if (messageRows.length > 0 && event.media?.download) { ... }`:

```js
  // Robô da fila (Na Mesa): só mensagem recebida e nova -- reenvio do WhatsApp
  // (ON CONFLICT não devolve linha) não pode gerar resposta duplicada. Em segundo
  // plano: um erro no robô não pode derrubar a gravação da mensagem.
  if (event.direction === 'inbound' && flags.waitlist_enabled && messageRows.length > 0) {
    const onInbound = deps.onInbound || handleInboundForWaitlist;
    Promise.resolve()
      .then(() => onInbound(
        { clientId, contactId, waId: event.waId, profileName: event.profileName, body: event.body },
        deps.db ? { db: dbImpl } : {}
      ))
      .catch((error) => console.error('Na Mesa: erro no robô da fila:', error.message));
  }
```

- [ ] **Step 4: Run tests**

Run: `cd backend && node --test`
Expected: suíte inteira passa, inclusive os 3 testes novos.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/whatsappIngest.js backend/src/services/whatsappIngest.test.js
git commit -m "feat(namesa): robo da fila ligado no recebimento de mensagens

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Rotas da fila, login por produto e flags do cliente

**Files:**
- Create: `backend/src/controllers/waitlistController.js`
- Modify: `backend/src/server.js` (import + rotas, logo antes de `// Campaigns & Metrics`)
- Modify: `backend/src/controllers/staffAuthController.js` (`listRestaurants`)
- Modify: `backend/src/controllers/clientController.js` (`createClient`, `updateClient`)

**Interfaces:**
- Consumes: `loadQueueState`, `loadSettings`, `transitionEntry`, `addManualEntry`, `updateEntry` (Task 3); `MESSAGE_KEYS`, `normalizePhone` (Task 1); `getConnectionState` (`baileysClient.js`).
- Produces (HTTP, todas com `Authorization: Bearer` de admin ou staff; admin passa `clientId` por query/body):
  - `GET /api/waitlist` → `{ waiting, called, awaitingSize, summary, settings, whatsappStatus }` (`whatsappStatus ∈ 'connected'|'connecting'|'qr'|'standby'|'disconnected'|'cloud_api'|'not_configured'`).
  - `POST /api/waitlist` body `{ name, phone?, partySize }` → `{ entry }` (400 com `error` em validação).
  - `PATCH /api/waitlist/:id` body `{ name?, partySize? }` → `{ entry }`.
  - `POST /api/waitlist/:id/call|seat|no-show|remove` → `{ entry }` ou 409 `{ error }` se o status já mudou.
  - `GET /api/waitlist/settings` → `{ settings, defaults }`; `PUT /api/waitlist/settings` → `{ settings }`.
  - `GET /api/waitlist/qr` → `{ link, dataUrl }` ou 400 sem número.
  - `GET /api/staff/restaurants?product=waitlist` → só clientes com `waitlist_enabled`.

- [ ] **Step 1: Write the controller**

```js
// backend/src/controllers/waitlistController.js
import QRCode from 'qrcode';
import db from '../config/db.js';
import { getConnectionState } from '../services/baileysClient.js';
import { DEFAULT_MESSAGES, MESSAGE_KEYS, normalizePhone } from '../services/waitlistText.js';
import { loadQueueState, loadSettings, transitionEntry, addManualEntry, updateEntry } from '../services/waitlistQueue.js';

export const JOIN_TEXT = 'Quero entrar na fila (cód. FILA)';

function resolveClientId(req) {
  return req.user.role === 'admin'
    ? (req.query.clientId || req.body.clientId || req.user.clientId)
    : req.user.clientId;
}

function handler(fn, errorMessage) {
  return async (req, res) => {
    try {
      const clientId = resolveClientId(req);
      if (!clientId) return res.status(400).json({ error: 'ID do cliente é obrigatório.' });
      return await fn(req, res, clientId);
    } catch (error) {
      console.error(`${errorMessage}:`, error);
      return res.status(500).json({ error: `${errorMessage}.` });
    }
  };
}

async function whatsappStatus(clientId) {
  const { rows } = await db.query('SELECT connection_type FROM whatsapp_settings WHERE client_id = ?', [clientId]);
  if (!rows[0]) return 'not_configured';
  if (rows[0].connection_type !== 'baileys') return 'cloud_api';
  return getConnectionState(clientId).status;
}

export const getQueue = handler(async (req, res, clientId) => {
  const state = await loadQueueState(db, clientId);
  return res.json({
    waiting: state.waiting,
    called: state.called,
    awaitingSize: state.awaitingSize,
    summary: state.summary,
    settings: { hold_minutes: state.settings.hold_minutes },
    whatsappStatus: await whatsappStatus(clientId)
  });
}, 'Erro ao carregar a fila');

export const addEntry = handler(async (req, res, clientId) => {
  const { name, phone, partySize } = req.body;
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Nome é obrigatório.' });
  try {
    const entry = await addManualEntry(db, { clientId, name: String(name).trim(), phone, partySize });
    return res.status(201).json({ entry });
  } catch (error) {
    if (/inválido/.test(error.message)) return res.status(400).json({ error: error.message });
    throw error;
  }
}, 'Erro ao adicionar na fila');

export const editEntry = handler(async (req, res, clientId) => {
  try {
    const entry = await updateEntry(db, { clientId, entryId: Number(req.params.id), name: req.body.name, partySize: req.body.partySize });
    if (!entry) return res.status(404).json({ error: 'Entrada não encontrada.' });
    return res.json({ entry });
  } catch (error) {
    if (/inválido/.test(error.message)) return res.status(400).json({ error: error.message });
    throw error;
  }
}, 'Erro ao editar entrada');

function transition(action) {
  return handler(async (req, res, clientId) => {
    const entry = await transitionEntry(db, { clientId, entryId: Number(req.params.id), action });
    if (!entry) return res.status(409).json({ error: 'Essa pessoa já mudou de situação. A lista foi atualizada.' });
    return res.json({ entry });
  }, 'Erro ao atualizar a fila');
}

export const callEntry = transition('call');
export const seatEntry = transition('seat');
export const noShowEntry = transition('noShow');
export const removeEntry = transition('remove');

export const getSettings = handler(async (req, res, clientId) => {
  return res.json({ settings: await loadSettings(db, clientId), defaults: DEFAULT_MESSAGES });
}, 'Erro ao carregar configurações da fila');

function intInRange(value, min, max, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

export const saveSettings = handler(async (req, res, clientId) => {
  const current = await loadSettings(db, clientId);
  const body = req.body || {};
  const number = body.whatsapp_number ? normalizePhone(body.whatsapp_number) : null;
  if (body.whatsapp_number && !number) return res.status(400).json({ error: 'Número do WhatsApp inválido.' });

  // Só guarda o texto que difere do padrão; vazio volta pro padrão.
  const messages = {};
  for (const key of MESSAGE_KEYS) {
    const text = typeof body.messages?.[key] === 'string' ? body.messages[key].trim().slice(0, 500) : '';
    if (text && text !== DEFAULT_MESSAGES[key]) messages[key] = text;
  }

  await db.query(
    `INSERT INTO waitlist_settings (client_id, whatsapp_number, default_minutes_per_party, hold_minutes, near_threshold, notify_no_show, messages, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, now())
     ON CONFLICT (client_id) DO UPDATE SET
       whatsapp_number = excluded.whatsapp_number,
       default_minutes_per_party = excluded.default_minutes_per_party,
       hold_minutes = excluded.hold_minutes,
       near_threshold = excluded.near_threshold,
       notify_no_show = excluded.notify_no_show,
       messages = excluded.messages,
       updated_at = now()`,
    [
      clientId,
      number,
      intInRange(body.default_minutes_per_party, 1, 60, current.default_minutes_per_party),
      intInRange(body.hold_minutes, 1, 60, current.hold_minutes),
      intInRange(body.near_threshold, 0, 10, current.near_threshold),
      typeof body.notify_no_show === 'boolean' ? body.notify_no_show : current.notify_no_show,
      JSON.stringify(messages)
    ]
  );
  return res.json({ settings: await loadSettings(db, clientId) });
}, 'Erro ao salvar configurações da fila');

export const getQr = handler(async (req, res, clientId) => {
  const settings = await loadSettings(db, clientId);
  if (!settings.whatsapp_number) {
    return res.status(400).json({ error: 'Cadastre o número do WhatsApp do restaurante antes de gerar o QR.' });
  }
  const link = `https://wa.me/${settings.whatsapp_number}?text=${encodeURIComponent(JOIN_TEXT)}`;
  const dataUrl = await QRCode.toDataURL(link, { width: 600, margin: 2 });
  return res.json({ link, dataUrl });
}, 'Erro ao gerar QR da fila');
```

- [ ] **Step 2: Register routes in `server.js`**

Import junto dos outros controllers:

```js
import { getQueue, addEntry, editEntry, callEntry, seatEntry, noShowEntry, removeEntry, getSettings as getWaitlistSettings, saveSettings as saveWaitlistSettings, getQr as getWaitlistQr } from './controllers/waitlistController.js';
```

Rotas, logo antes de `// Campaigns & Metrics`. As fixas (`/settings`, `/qr`) vêm antes de `/:id` só por clareza, já que não colidem por verbo e caminho:

```js
// Na Mesa (fila de espera) -- recepcionista (staff) e admin.
app.get('/api/waitlist', getQueue);
app.post('/api/waitlist', addEntry);
app.get('/api/waitlist/settings', getWaitlistSettings);
app.put('/api/waitlist/settings', saveWaitlistSettings);
app.get('/api/waitlist/qr', getWaitlistQr);
app.patch('/api/waitlist/:id', editEntry);
app.post('/api/waitlist/:id/call', callEntry);
app.post('/api/waitlist/:id/seat', seatEntry);
app.post('/api/waitlist/:id/no-show', noShowEntry);
app.post('/api/waitlist/:id/remove', removeEntry);
```

- [ ] **Step 3: Login por produto (`staffAuthController.js`)**

Troque a query de `listRestaurants` por:

```js
    // /namesa pede ?product=waitlist; o /caixa (sem parâmetro) não lista cliente só do Na Mesa.
    const productFilter = req.query.product === 'waitlist'
      ? 'AND c.waitlist_enabled = true'
      : 'AND c.dashboard_enabled IS NOT FALSE';
    const { rows } = await db.query(
      `SELECT c.id, c.name
       FROM clients c
       JOIN whatsapp_settings ws ON ws.client_id = c.id
       WHERE c.active = 1 ${productFilter}
       ORDER BY c.name`
    );
```

- [ ] **Step 4: Flags no cadastro de cliente (`clientController.js`)**

Adicione o helper perto de `normalizeOptionalText`:

```js
function optionalBoolean(value) {
  return typeof value === 'boolean' ? value : null;
}
```

Em `createClient`, desestruture também `dashboard_enabled, waitlist_enabled` do `req.body` e troque o INSERT por:

```js
    const { rows } = await db.query(
      `INSERT INTO clients (name, company, logo_url, campaign_prefix, page_id, dashboard_enabled, waitlist_enabled)
       VALUES (?, ?, ?, ?, ?, COALESCE(?, true), COALESCE(?, false)) RETURNING id`,
      [name, company, logo_url || null, normalizeOptionalText(campaign_prefix), normalizeOptionalText(page_id),
        optionalBoolean(dashboard_enabled), optionalBoolean(waitlist_enabled)]
    );
```

Em `updateClient`, desestruture os dois também e troque o UPDATE por:

```js
    await db.query(
      `UPDATE clients SET name = ?, company = ?, logo_url = ?, campaign_prefix = ?, page_id = ?,
         dashboard_enabled = COALESCE(?, dashboard_enabled), waitlist_enabled = COALESCE(?, waitlist_enabled)
       WHERE id = ?`,
      [name, company, logo_url || null, normalizeOptionalText(campaign_prefix), normalizeOptionalText(page_id),
        optionalBoolean(dashboard_enabled), optionalBoolean(waitlist_enabled), clientId]
    );
```

Se `clientController.test.js` verificar os parâmetros exatos desse INSERT ou UPDATE, atualize o teste para os novos parâmetros (o padrão continua `null`, `null` quando o campo não vem).

- [ ] **Step 5: Verify**

Run: `cd backend && node --test`
Expected: suíte inteira passa.

Run (sobe o backend local contra o banco de produção sem abrir sessão de WhatsApp): `cd backend && BAILEYS_AUTOCONNECT=false node src/server.js`. Em outro terminal:

```bash
curl -s "http://localhost:5000/api/staff/restaurants?product=waitlist"
```
Expected: `{"restaurants":[]}`. Ninguém tem `waitlist_enabled` ainda, o que prova que as colunas foram criadas e a query roda.

- [ ] **Step 6: Commit**

```bash
git add backend/src/controllers/waitlistController.js backend/src/server.js backend/src/controllers/staffAuthController.js backend/src/controllers/clientController.js backend/src/controllers/clientController.test.js
git commit -m "feat(namesa): rotas da fila, login por produto e flags do cliente

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Tela da recepcionista (`/namesa`)

**Files:**
- Create: `frontend/src/NaMesaApp.jsx`
- Create: `frontend/src/components/namesa/QueueBoard.jsx`
- Create: `frontend/src/components/namesa/WaitlistSettings.jsx`
- Modify: `frontend/src/main.jsx`

**Interfaces:**
- Consumes: rotas da Task 6; `GET /api/whatsapp/events?token=` (SSE, evento nomeado `waitlist` com `{ reason }`); `playNotificationSound`, `unlockNotificationSound` de `components/notificationSound.js`.
- Produces: `QueueBoard({ api, refreshKey })` e `WaitlistSettings({ api })`, em que `api` é uma instância axios com o header `Authorization` já setado.

- [ ] **Step 1: Roteamento em `main.jsx`**

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import CaixaApp from './CaixaApp.jsx';
import NaMesaApp from './NaMesaApp.jsx';
import './index.css';

const path = window.location.pathname;
const Root = path.startsWith('/caixa') ? CaixaApp : path.startsWith('/namesa') ? NaMesaApp : App;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
```

- [ ] **Step 2: `NaMesaApp.jsx` (login + abas + SSE)**

```jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Store, Lock, ArrowLeft, Users, Settings, LogOut } from 'lucide-react';
import QueueBoard from './components/namesa/QueueBoard';
import WaitlistSettings from './components/namesa/WaitlistSettings';
import { playNotificationSound, unlockNotificationSound } from './components/notificationSound';

const TOKEN_KEY = 'namesa_token';
const RESTAURANT_KEY = 'namesa_restaurant';

const api = axios.create();

// Mesmo padrão do CaixaApp: interceptor no módulo, só desloga se já havia sessão
// (PIN errado também responde 401 e não pode jogar pra fora).
let onSessionExpired = null;
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const hadSession = Boolean(api.defaults.headers.common['Authorization']);
    if (hadSession && (err.response?.status === 401 || err.response?.status === 403) && onSessionExpired) {
      onSessionExpired();
    }
    return Promise.reject(err);
  }
);

function loadStoredSession() {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const restaurant = JSON.parse(localStorage.getItem(RESTAURANT_KEY) || 'null');
    return token && restaurant ? { token, restaurant } : null;
  } catch {
    return null;
  }
}

const C = {
  bg: '#0b1120', panel: '#131b2e', border: 'rgba(255,255,255,0.1)', text: '#fff',
  muted: '#94a3b8', accent: '#f59e0b'
};

const inputStyle = {
  width: '100%', padding: '14px', borderRadius: '10px', border: `1px solid ${C.border}`,
  backgroundColor: C.panel, color: C.text, marginBottom: '12px', fontSize: '1rem'
};
const buttonStyle = {
  width: '100%', padding: '14px', borderRadius: '10px', border: 'none',
  background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#111', fontWeight: 700,
  fontSize: '1rem', cursor: 'pointer'
};

export default function NaMesaApp() {
  const stored = loadStoredSession();
  const [step, setStep] = useState(stored ? 'app' : 'select');
  const [tab, setTab] = useState('fila');
  const [restaurants, setRestaurants] = useState([]);
  const [restaurant, setRestaurant] = useState(stored?.restaurant || null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  if (stored) api.defaults.headers.common['Authorization'] = `Bearer ${stored.token}`;

  useEffect(() => {
    api.get('/api/staff/restaurants', { params: { product: 'waitlist' } })
      .then((res) => setRestaurants(res.data.restaurants || []))
      .catch(() => setError('Não foi possível carregar a lista de restaurantes.'));
  }, []);

  const handleLogout = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(RESTAURANT_KEY);
    delete api.defaults.headers.common['Authorization'];
    setRestaurant(null);
    setPin('');
    setTab('fila');
    setStep('select');
  };
  onSessionExpired = handleLogout;

  const handlePin = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await api.post('/api/staff/login', { clientId: restaurant.id, pin });
      api.defaults.headers.common['Authorization'] = `Bearer ${res.data.token}`;
      localStorage.setItem(TOKEN_KEY, res.data.token);
      localStorage.setItem(RESTAURANT_KEY, JSON.stringify(restaurant));
      setStep('app');
    } catch (err) {
      setError(err.response?.data?.error || 'PIN inválido.');
    }
  };

  useEffect(() => {
    window.addEventListener('pointerdown', unlockNotificationSound);
    return () => window.removeEventListener('pointerdown', unlockNotificationSound);
  }, []);

  useEffect(() => {
    if (step !== 'app') return;
    const token = (api.defaults.headers.common['Authorization'] || '').replace('Bearer ', '');
    if (!token) return;
    const source = new EventSource(`/api/whatsapp/events?token=${encodeURIComponent(token)}`);
    source.addEventListener('waitlist', (e) => {
      setRefreshKey((k) => k + 1);
      try {
        if (JSON.parse(e.data).reason === 'joined') playNotificationSound();
      } catch { /* evento sem corpo */ }
    });
    return () => source.close();
  }, [step]);

  if (step !== 'app') {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, color: C.text, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
        <div style={{ width: '100%', maxWidth: '380px' }}>
          <h1 style={{ textAlign: 'center', marginBottom: '4px' }}>Na Mesa</h1>
          <p style={{ textAlign: 'center', color: C.muted, marginBottom: '24px' }}>Fila de espera</p>
          {error && <p style={{ color: '#f87171', marginBottom: '12px' }}>{error}</p>}
          {step === 'select' && (
            <>
              {restaurants.length === 0 && <p style={{ color: C.muted, textAlign: 'center' }}>Nenhum restaurante com fila ativa.</p>}
              {restaurants.map((r) => (
                <button key={r.id} style={{ ...buttonStyle, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'center' }}
                  onClick={() => { setRestaurant(r); setError(''); setStep('pin'); }}>
                  <Store size={18} /> {r.name}
                </button>
              ))}
            </>
          )}
          {step === 'pin' && (
            <form onSubmit={handlePin}>
              <button type="button" onClick={() => setStep('select')} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ArrowLeft size={16} /> {restaurant?.name}
              </button>
              <input style={inputStyle} type="password" inputMode="numeric" placeholder="PIN" value={pin} onChange={(e) => setPin(e.target.value)} autoFocus />
              <button style={buttonStyle} type="submit"><Lock size={16} style={{ verticalAlign: 'middle' }} /> Entrar</button>
            </form>
          )}
        </div>
      </div>
    );
  }

  const tabButton = (key, label, Icon) => (
    <button onClick={() => setTab(key)} style={{
      padding: '10px 16px', borderRadius: '10px', border: 'none', cursor: 'pointer', fontWeight: 700,
      display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem',
      background: tab === key ? C.accent : 'transparent', color: tab === key ? '#111' : C.text
    }}><Icon size={18} /> {label}</button>
  );

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderBottom: `1px solid ${C.border}`, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: '1.2rem', marginRight: 'auto' }}>Na Mesa · {restaurant?.name}</strong>
        {tabButton('fila', 'Fila', Users)}
        {tabButton('config', 'Configurar', Settings)}
        <button onClick={handleLogout} title="Sair" style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer' }}><LogOut size={20} /></button>
      </header>
      <main style={{ padding: '16px', maxWidth: '1100px', margin: '0 auto' }}>
        {tab === 'fila' ? <QueueBoard api={api} refreshKey={refreshKey} /> : <WaitlistSettings api={api} />}
      </main>
    </div>
  );
}
```

- [ ] **Step 3: `QueueBoard.jsx`**

```jsx
import React, { useState, useEffect, useCallback } from 'react';
import { Bell, Check, UserX, Trash2, Plus, Pencil, AlertTriangle, MessageCircle } from 'lucide-react';

const C = { panel: '#131b2e', border: 'rgba(255,255,255,0.1)', muted: '#94a3b8', accent: '#f59e0b', red: '#ef4444', green: '#22c55e' };

function minutesSince(ts, now) {
  return Math.max(0, Math.floor((now - new Date(ts).getTime()) / 60000));
}

const WA_LABEL = {
  qr: 'WhatsApp desconectado: avisos não estão saindo. Peça pra reconectar o QR em Chaves e APIs.',
  disconnected: 'WhatsApp desconectado: avisos não estão saindo.',
  connecting: 'WhatsApp reconectando... avisos podem atrasar.',
  standby: 'WhatsApp em espera: avisos podem não estar saindo.',
  not_configured: 'WhatsApp não configurado pra este restaurante.'
};

const actionBtn = (bg, color = '#fff') => ({
  padding: '12px 14px', borderRadius: '10px', border: 'none', background: bg, color,
  fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
});

export default function QueueBoard({ api, refreshKey }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', partySize: '2' });
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    api.get('/api/waitlist')
      .then((res) => { setData(res.data); setError(''); })
      .catch(() => setError('Não foi possível carregar a fila.'));
  }, [api]);

  useEffect(() => { load(); }, [load, refreshKey]);
  useEffect(() => {
    const t = setInterval(() => { setNow(Date.now()); load(); }, 30000);
    return () => clearInterval(t);
  }, [load]);

  const act = async (entry, action) => {
    if (action === 'remove' && !window.confirm(`Remover ${entry.name || 'esta pessoa'} da fila?`)) return;
    setBusyId(entry.id);
    try {
      await api.post(`/api/waitlist/${entry.id}/${action}`);
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao atualizar a fila.');
    } finally {
      setBusyId(null);
      load();
    }
  };

  const edit = async (entry) => {
    const name = window.prompt('Nome', entry.name || '');
    if (name === null) return;
    const partySize = window.prompt('Quantas pessoas?', String(entry.party_size || ''));
    if (partySize === null) return;
    try {
      await api.patch(`/api/waitlist/${entry.id}`, { name, partySize: Number(partySize) });
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao editar.');
    }
    load();
  };

  const submitAdd = async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/waitlist', { name: form.name, phone: form.phone, partySize: Number(form.partySize) });
      setForm({ name: '', phone: '', partySize: '2' });
      setAdding(false);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao adicionar.');
    }
  };

  if (!data) return <p style={{ color: C.muted }}>{error || 'Carregando...'}</p>;

  const hold = data.settings?.hold_minutes ?? 10;
  const waWarning = WA_LABEL[data.whatsappStatus];
  const s = data.summary;

  const row = (entry, kind) => {
    const waited = minutesSince(entry.joined_at, now);
    const calledFor = entry.called_at ? minutesSince(entry.called_at, now) : null;
    const late = kind === 'called' && calledFor > hold;
    return (
      <div key={entry.id} style={{
        display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', padding: '14px',
        background: C.panel, borderRadius: '12px', marginBottom: '10px',
        border: `1px solid ${late ? C.red : kind === 'called' ? C.accent : C.border}`
      }}>
        {kind === 'waiting' && <div style={{ fontSize: '1.6rem', fontWeight: 800, width: '44px', textAlign: 'center' }}>{entry.position}</div>}
        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>
            {entry.name || 'Sem nome'} · {entry.party_size ?? '?'} {entry.party_size === 1 ? 'pessoa' : 'pessoas'}
            {entry.needs_check && <span style={{ color: C.accent, fontSize: '0.85rem', marginLeft: '8px' }}><AlertTriangle size={14} style={{ verticalAlign: 'middle' }} /> conferir pessoas</span>}
          </div>
          <div style={{ color: late ? C.red : C.muted, fontSize: '0.9rem' }}>
            {kind === 'called' ? `Chamado há ${calledFor} min` : `Esperando há ${waited} min · ~${entry.estimated_wait} min`}
            {' · '}{entry.source === 'whatsapp' ? <><MessageCircle size={12} style={{ verticalAlign: 'middle' }} /> WhatsApp</> : 'manual'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {kind === 'waiting' && <button disabled={busyId === entry.id} style={actionBtn(C.accent, '#111')} onClick={() => act(entry, 'call')}><Bell size={16} /> Chamar</button>}
          <button disabled={busyId === entry.id} style={actionBtn(C.green, '#111')} onClick={() => act(entry, 'seat')}><Check size={16} /> Sentou</button>
          <button disabled={busyId === entry.id} style={actionBtn('#334155')} onClick={() => act(entry, 'no-show')}><UserX size={16} /> Não veio</button>
          <button style={actionBtn('transparent', C.muted)} onClick={() => edit(entry)} title="Editar"><Pencil size={16} /></button>
          <button style={actionBtn('transparent', C.muted)} onClick={() => act(entry, 'remove')} title="Remover"><Trash2 size={16} /></button>
        </div>
      </div>
    );
  };

  const stat = (label, value) => (
    <div style={{ background: C.panel, borderRadius: '12px', padding: '12px 16px', flex: '1 1 120px' }}>
      <div style={{ color: C.muted, fontSize: '0.8rem' }}>{label}</div>
      <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{value}</div>
    </div>
  );

  return (
    <div>
      {waWarning && (
        <div style={{ background: 'rgba(239,68,68,0.15)', border: `1px solid ${C.red}`, color: '#fca5a5', padding: '12px', borderRadius: '10px', marginBottom: '12px' }}>
          <AlertTriangle size={16} style={{ verticalAlign: 'middle' }} /> {waWarning}
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {stat('Na fila agora', data.waiting.length)}
        {stat('Entraram hoje', s.total)}
        {stat('Sentaram', s.seated)}
        {stat('Desistiram', s.gaveUp)}
        {stat('Espera média', s.avgWaitMinutes === null ? '-' : `${s.avgWaitMinutes} min`)}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
        <button style={actionBtn(C.accent, '#111')} onClick={() => setAdding((v) => !v)}><Plus size={16} /> Adicionar</button>
      </div>

      {adding && (
        <form onSubmit={submitAdd} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', background: C.panel, padding: '12px', borderRadius: '12px', marginBottom: '16px' }}>
          {[['name', 'Nome', 'text'], ['phone', 'WhatsApp (opcional)', 'tel'], ['partySize', 'Pessoas', 'number']].map(([key, ph, type]) => (
            <input key={key} required={key !== 'phone'} type={type} min={key === 'partySize' ? 1 : undefined} max={key === 'partySize' ? 30 : undefined}
              placeholder={ph} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              style={{ flex: key === 'partySize' ? '0 0 100px' : '1 1 180px', padding: '12px', borderRadius: '10px', border: `1px solid ${C.border}`, background: '#0b1120', color: '#fff', fontSize: '1rem' }} />
          ))}
          <button type="submit" style={actionBtn(C.green, '#111')}>Colocar na fila</button>
        </form>
      )}

      {data.called.length > 0 && <h3 style={{ margin: '8px 0' }}>Chamados</h3>}
      {data.called.map((e) => row(e, 'called'))}

      <h3 style={{ margin: '8px 0' }}>Esperando</h3>
      {data.waiting.length === 0 && <p style={{ color: C.muted }}>Ninguém na fila.</p>}
      {data.waiting.map((e) => row(e, 'waiting'))}

      {data.awaitingSize.length > 0 && (
        <p style={{ color: C.muted, marginTop: '12px' }}>
          Respondendo quantas pessoas: {data.awaitingSize.map((e) => e.name || 'sem nome').join(', ')}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: `WaitlistSettings.jsx`**

```jsx
import React, { useState, useEffect } from 'react';
import { Printer, Save } from 'lucide-react';

const C = { panel: '#131b2e', border: 'rgba(255,255,255,0.1)', muted: '#94a3b8', accent: '#f59e0b' };

const MESSAGE_LABELS = {
  askSize: 'Pergunta de quantas pessoas',
  askSizeAgain: 'Quando não entende o número',
  joined: 'Entrou na fila',
  status: 'Resposta de posição',
  near: 'Quase lá',
  called: 'Mesa pronta (botão Chamar)',
  calledReminder: 'Lembrança de mesa pronta',
  noShow: 'Não veio',
  left: 'Saiu da fila'
};

const field = { width: '100%', padding: '12px', borderRadius: '10px', border: `1px solid ${C.border}`, background: '#0b1120', color: '#fff', fontSize: '1rem' };

export default function WaitlistSettings({ api }) {
  const [settings, setSettings] = useState(null);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api.get('/api/waitlist/settings').then((res) => setSettings(res.data.settings));
  }, [api]);

  if (!settings) return <p style={{ color: C.muted }}>Carregando...</p>;

  const set = (key, value) => setSettings({ ...settings, [key]: value });

  const save = async () => {
    setMsg('');
    try {
      const res = await api.put('/api/waitlist/settings', settings);
      setSettings(res.data.settings);
      setMsg('Salvo!');
    } catch (err) {
      setMsg(err.response?.data?.error || 'Erro ao salvar.');
    }
  };

  const printQr = async () => {
    try {
      const { data } = await api.get('/api/waitlist/qr');
      const w = window.open('', '_blank');
      w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>QR da fila</title>
        <style>body{font-family:system-ui,sans-serif;text-align:center;padding:40px}h1{font-size:42px;margin:0 0 8px}p{font-size:22px;color:#444}img{width:420px;max-width:90vw}</style>
        </head><body><h1>Entre na fila pelo WhatsApp</h1><p>Aponte a câmera do celular e mande a mensagem</p>
        <img src="${data.dataUrl}" alt="QR da fila"/><p>Você recebe sua posição e avisamos quando a mesa estiver pronta.</p>
        <script>window.onload=()=>window.print()</script></body></html>`);
      w.document.close();
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao gerar o QR.');
    }
  };

  const num = (key, label, min, max) => (
    <label style={{ display: 'block', marginBottom: '12px' }}>
      <span style={{ color: C.muted, fontSize: '0.9rem' }}>{label}</span>
      <input type="number" min={min} max={max} style={field} value={settings[key]} onChange={(e) => set(key, Number(e.target.value))} />
    </label>
  );

  return (
    <div style={{ display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
      <section style={{ background: C.panel, padding: '16px', borderRadius: '12px' }}>
        <h3 style={{ marginTop: 0 }}>Fila</h3>
        <label style={{ display: 'block', marginBottom: '12px' }}>
          <span style={{ color: C.muted, fontSize: '0.9rem' }}>WhatsApp do restaurante (com DDD)</span>
          <input style={field} value={settings.whatsapp_number || ''} placeholder="(11) 99999-8888" onChange={(e) => set('whatsapp_number', e.target.value)} />
        </label>
        {num('default_minutes_per_party', 'Minutos por grupo (até ter histórico da noite)', 1, 60)}
        {num('hold_minutes', 'Tolerância depois de chamar (min)', 1, 60)}
        {num('near_threshold', 'Avisar "quase lá" quando faltarem N grupos', 0, 10)}
        <label style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '16px' }}>
          <input type="checkbox" checked={settings.notify_no_show} onChange={(e) => set('notify_no_show', e.target.checked)} />
          Mandar mensagem quando marcar "Não veio"
        </label>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={save} style={{ padding: '12px 16px', borderRadius: '10px', border: 'none', background: C.accent, fontWeight: 700, cursor: 'pointer' }}><Save size={16} style={{ verticalAlign: 'middle' }} /> Salvar</button>
          <button onClick={printQr} style={{ padding: '12px 16px', borderRadius: '10px', border: `1px solid ${C.border}`, background: 'transparent', color: '#fff', fontWeight: 700, cursor: 'pointer' }}><Printer size={16} style={{ verticalAlign: 'middle' }} /> Imprimir QR da porta</button>
        </div>
        {msg && <p style={{ color: C.muted }}>{msg}</p>}
      </section>

      <section style={{ background: C.panel, padding: '16px', borderRadius: '12px' }}>
        <h3 style={{ marginTop: 0 }}>Mensagens do robô</h3>
        <p style={{ color: C.muted, fontSize: '0.85rem' }}>Variáveis: {'{nome} {posicao} {espera} {faltam} {tolerancia}'}. Apague o texto pra voltar ao padrão.</p>
        {Object.entries(MESSAGE_LABELS).map(([key, label]) => (
          <label key={key} style={{ display: 'block', marginBottom: '12px' }}>
            <span style={{ color: C.muted, fontSize: '0.9rem' }}>{label}</span>
            <textarea rows={3} style={{ ...field, resize: 'vertical' }} value={settings.messages[key] || ''}
              onChange={(e) => set('messages', { ...settings.messages, [key]: e.target.value })} />
          </label>
        ))}
        <button onClick={save} style={{ padding: '12px 16px', borderRadius: '10px', border: 'none', background: C.accent, fontWeight: 700, cursor: 'pointer' }}>Salvar mensagens</button>
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Build**

Run: `cd frontend && npx vite build`
Expected: build sem erro.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/main.jsx frontend/src/NaMesaApp.jsx frontend/src/components/namesa
git commit -m "feat(namesa): tela da recepcionista (fila, configurar, QR da porta)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Admin (login, seletor, cadastro de cliente)

**Files:**
- Modify: `frontend/src/pages/LoginPage.jsx` (depois do `</form>`, ~linha 105)
- Modify: `frontend/src/components/Navbar.jsx` (`<option>` dos clientes, ~linha 48)
- Modify: `frontend/src/pages/ClientsPage.jsx` (`EMPTY_FORM` ~linha 8, carregar edição ~linha 50, campos do form ~linha 285, card ~linha 173)

**Interfaces:**
- Consumes: `dashboard_enabled` e `waitlist_enabled` em `GET/POST/PUT /api/clients` (Task 6).

- [ ] **Step 1: Link no login** (`LoginPage.jsx`, logo depois do `</form>`)

```jsx
        <a href="/namesa" style={{ display: 'block', textAlign: 'center', marginTop: '20px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Acessar o Na Mesa (fila de espera) →
        </a>
```

- [ ] **Step 2: Marca no seletor** (`Navbar.jsx`)

```jsx
                <option key={c.id} value={c.id}>
                  {c.name} ({c.company}){c.dashboard_enabled === false ? ' · Na Mesa' : ''}
                </option>
```

- [ ] **Step 3: Cadastro de cliente** (`ClientsPage.jsx`)

- Em `EMPTY_FORM`, adicione `dashboard_enabled: true, waitlist_enabled: false,`.
- Onde o form de edição é preenchido a partir do `client` (perto de `campaign_prefix: client.campaign_prefix || ''`), adicione `dashboard_enabled: client.dashboard_enabled !== false, waitlist_enabled: Boolean(client.waitlist_enabled),`.
- Depois do campo `page_id` no form, adicione:

```jsx
              <div className="form-group" style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input type="checkbox" checked={formData.dashboard_enabled}
                    onChange={(e) => setFormData({ ...formData, dashboard_enabled: e.target.checked })} />
                  Dashboard e CRM
                </label>
                <label style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input type="checkbox" checked={formData.waitlist_enabled}
                    onChange={(e) => setFormData({ ...formData, waitlist_enabled: e.target.checked })} />
                  Na Mesa (fila de espera)
                </label>
              </div>
```

- No card do cliente, perto do bloco `{c.campaign_prefix && (...)}`, adicione:

```jsx
              {c.waitlist_enabled && (
                <span style={{ display: 'inline-block', marginTop: '6px', padding: '2px 8px', borderRadius: '999px', background: 'rgba(245,158,11,0.15)', color: '#f59e0b', fontSize: '0.75rem', fontWeight: 700 }}>
                  Na Mesa{c.dashboard_enabled === false ? ' (só fila)' : ''}
                </span>
              )}
```

- [ ] **Step 4: Build**

Run: `cd frontend && npx vite build`
Expected: build sem erro.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/LoginPage.jsx frontend/src/components/Navbar.jsx frontend/src/pages/ClientsPage.jsx
git commit -m "feat(namesa): acesso pelo login e chaves Na Mesa/Dashboard no cadastro de cliente

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Teste ponta a ponta local + diário

Sem código novo de produto. Serve para provar o fluxo real antes de pedir o deploy.

**Files:**
- Modify: `docs/diario.md`

- [ ] **Step 1: Subir local contra o banco de produção, sem abrir sessão do WhatsApp**

Terminal 1: `cd backend && BAILEYS_AUTOCONNECT=false node src/server.js`
Terminal 2: `cd frontend && npx vite` (porta 3000, proxy para a 5000)

- [ ] **Step 2: Criar um cliente de teste "Mercearia (teste)" direto no banco**

Use `waitlist_enabled=true, dashboard_enabled=false` e uma linha em `whatsapp_settings` com `connection_type='cloud_api'`, um `phone_number_id` falso e um PIN conhecido (gere o hash com `hashPin` de `utils/staffAuth.js`). Com `cloud_api`, o webhook assinado (`META_APP_SECRET` do `.env`) consegue simular mensagens recebidas, como foi feito nas fases 2 e 4 (ver diário). O envio das respostas vai falhar (token falso), e isso só aparece no log, o que também prova que a ação é gravada mesmo com o envio falhando.

- [ ] **Step 3: Simular o fluxo pelo webhook assinado e conferir no banco e na tela `/namesa`**

1. "Quero entrar na fila (cód. FILA)" cria uma entrada `awaiting_size`, e a tela mostra "Respondendo quantas pessoas".
2. "somos 3" leva a `waiting` na posição 1, e a tela atualiza sozinha (SSE) e toca o som.
3. Mais duas pessoas entram. Chamar a 1ª faz o card ficar amarelo; depois de "Sentou", a lista recalcula.
4. "tem fila hoje?" de um número novo não cria entrada nenhuma.
5. "sair" de quem está na fila leva a `left`.
6. Em `whatsapp_messages`, conferir que as respostas do robô foram tentadas (ou o erro no log do backend).

- [ ] **Step 4: Apagar os dados de teste** (entradas, contatos, `whatsapp_settings` e o cliente de teste).

- [ ] **Step 5: Atualizar `docs/diario.md`**

Adicionar uma entrada nova no Registro: o que foi feito, o que foi testado, o que falta (cadastrar a Mercearia de verdade, conectar o QR do Baileys dela, imprimir o QR da porta e testar com o celular real). Atualizar "Estado atual". Commit `docs(diario): Na Mesa (fila de espera)`.

- [ ] **Step 6: Pedir ao usuário autorização para o push/deploy.** Não fazer o push sem a resposta.
