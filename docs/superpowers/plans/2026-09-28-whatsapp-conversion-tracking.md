# WhatsApp Conversion Tracking & ROI Real Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rastrear conversas de WhatsApp iniciadas por anúncios Click-to-WhatsApp da Meta, deixar o caixa do restaurante lançar a venda real vinculada àquela conversa, e calcular o ROI real (gasto em anúncio vs. faturamento de verdade).

**Architecture:** Módulo novo e isolado dentro do monorepo existente (Express + React). Backend: webhook da WhatsApp Cloud API grava contatos/mensagens em tabelas novas; login por PIN gera um JWT escopado a um `client_id` fixo, reaproveitando o mesmo middleware de autenticação já existente. Frontend: uma aba nova no painel principal (mesmo padrão de acesso de Remarketing/Tracking) e uma segunda aplicação React totalmente separada, servida em `/caixa`, sem nenhuma dependência da árvore de componentes do painel.

**Tech Stack:** Node.js 18+ (ESM), Express, `pg` (Postgres), `bcryptjs`, `jsonwebtoken` — todos já usados no projeto, nenhuma dependência nova no backend. Frontend: React 18, `axios`, `lucide-react` — mesmas libs já usadas, nenhuma dependência nova.

**Spec:** `docs/superpowers/specs/2026-09-28-whatsapp-conversion-tracking-design.md`

## Global Constraints

- Nenhuma tabela existente muda de estrutura. Só `CREATE TABLE IF NOT EXISTS` novas, seguindo exatamente o padrão de `backend/src/config/db.js`.
- Nenhuma rota, controller ou componente existente é modificado além de adições puramente aditivas (nova linha de rota, novo item de menu, novo `case` de aba). Nenhuma lógica existente é alterada.
- O projeto **não tem framework de testes automatizados hoje** (nem backend, nem frontend) — só `vite build` como checagem de compilação, e verificação manual (curl / rodar os servidores localmente / Playwright) é como o time já valida mudanças neste repositório (ver sessão anterior desta mesma conversa). Este plano segue essa convenção:
  - Módulos de lógica pura e sem I/O (hash de PIN, cálculo de ROI, parser do payload do webhook, montagem da chamada à API da Meta) **ganham teste automatizado de verdade**, usando o test runner nativo do Node (`node --test`, já disponível no Node 18+, zero dependência nova) — é lógica financeira/parsing onde um bug tem custo real e é barato de testar sem banco/rede.
  - Rotas Express, consultas SQL e telas React são verificadas manualmente (curl com token real, ou rodando os servidores + Playwright), do mesmo jeito que o resto do backend/frontend já é verificado hoje.
- `DATABASE_URL` do `.env` aponta pro Postgres de produção (Supabase) — não existe banco de dev/staging separado neste projeto. Os `CREATE TABLE IF NOT EXISTS` das tabelas novas são seguros de rodar contra produção (não tocam em tabela existente), igual ao `ALTER TABLE daily_metrics ADD COLUMN IF NOT EXISTS reach` que já roda hoje.
- Envio real de mensagem pela Cloud API da Meta **não é testável ponta-a-ponta** neste momento — o cliente ainda vai comprar o chip e configurar o número na Meta. A Tarefa 9 implementa a chamada real e testa a função de montagem da chamada isoladamente (mockando `fetch`), mas o caminho de sucesso completo (mensagem chegando de verdade no WhatsApp de alguém) só será validável quando o número estiver configurado.

---

## Task 1: Tabelas novas no banco de dados

**Files:**
- Modify: `backend/src/config/db.js`

**Interfaces:**
- Produces: tabelas `whatsapp_settings`, `whatsapp_contacts`, `whatsapp_messages`, `real_conversions` — todas as tarefas seguintes dependem delas.

- [ ] **Step 1: Adicionar as tabelas novas dentro do bloco de `initDb()`**

Em `backend/src/config/db.js`, dentro do template string do primeiro `await query(...)` de `initDb()`, logo depois do bloco `CREATE TABLE IF NOT EXISTS attribution_events (...)` e antes dos `CREATE UNIQUE INDEX`, adicione:

```sql
    CREATE TABLE IF NOT EXISTS whatsapp_settings (
      id SERIAL PRIMARY KEY,
      client_id INTEGER NOT NULL UNIQUE,
      phone_number_id TEXT NOT NULL,
      waba_id TEXT NOT NULL,
      access_token TEXT NOT NULL,
      display_phone_number TEXT,
      staff_pin_hash TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS whatsapp_contacts (
      id SERIAL PRIMARY KEY,
      client_id INTEGER NOT NULL,
      wa_id TEXT NOT NULL,
      profile_name TEXT,
      ctwa_clid TEXT,
      ad_id TEXT,
      ad_headline TEXT,
      ad_body TEXT,
      source TEXT DEFAULT 'organic',
      first_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_message_at TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
      UNIQUE(client_id, wa_id)
    );

    CREATE TABLE IF NOT EXISTS whatsapp_messages (
      id SERIAL PRIMARY KEY,
      client_id INTEGER NOT NULL,
      contact_id INTEGER NOT NULL,
      direction TEXT CHECK(direction IN ('inbound', 'outbound')) NOT NULL,
      body TEXT,
      wa_message_id TEXT UNIQUE,
      sent_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (contact_id) REFERENCES whatsapp_contacts(id) ON DELETE CASCADE,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS real_conversions (
      id SERIAL PRIMARY KEY,
      client_id INTEGER NOT NULL,
      contact_id INTEGER,
      customer_name TEXT NOT NULL,
      phone TEXT,
      amount_spent REAL NOT NULL,
      matched_by TEXT CHECK(matched_by IN ('phone', 'name', 'manual')) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (contact_id) REFERENCES whatsapp_contacts(id) ON DELETE SET NULL,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    );
```

- [ ] **Step 2: Verificar manualmente**

Rode o backend localmente:

```bash
cd backend && node src/server.js
```

Espera: log `🚀 Backend Ad Campaign Tracker rodando na porta 5000` sem erro. Confirme que as 4 tabelas foram criadas:

```bash
node -e "import('./src/config/db.js').then(async ({default: db}) => { const {rows} = await db.query(\"SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'whatsapp%' OR table_name = 'real_conversions'\"); console.log(rows); process.exit(0); })"
```

Expected: array com as 4 tabelas listadas.

- [ ] **Step 3: Commit**

```bash
git add backend/src/config/db.js
git commit -m "feat(whatsapp): adiciona tabelas de rastreamento de WhatsApp e conversao real"
```

---

## Task 2: Serviço de envio de mensagem (Meta Graph API)

**Files:**
- Create: `backend/src/services/metaWhatsAppApi.js`
- Test: `backend/src/services/metaWhatsAppApi.test.js`

**Interfaces:**
- Produces: `sendWhatsAppMessage({ phoneNumberId, accessToken, to, body, fetchImpl })` → `Promise<object>` (resposta JSON da Meta). Usado pela Tarefa 9.

- [ ] **Step 1: Escrever o teste que falha**

```js
// backend/src/services/metaWhatsAppApi.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendWhatsAppMessage } from './metaWhatsAppApi.js';

test('sendWhatsAppMessage monta a chamada correta e retorna o JSON da resposta', async () => {
  let capturedUrl;
  let capturedOptions;

  const fakeFetch = async (url, options) => {
    capturedUrl = url;
    capturedOptions = options;
    return {
      ok: true,
      json: async () => ({ messages: [{ id: 'wamid.FAKE123' }] })
    };
  };

  const result = await sendWhatsAppMessage({
    phoneNumberId: '123456',
    accessToken: 'token-abc',
    to: '5511999998888',
    body: 'Olá!',
    fetchImpl: fakeFetch
  });

  assert.equal(capturedUrl, 'https://graph.facebook.com/v20.0/123456/messages');
  assert.equal(capturedOptions.method, 'POST');
  assert.equal(capturedOptions.headers['Authorization'], 'Bearer token-abc');
  assert.equal(capturedOptions.headers['Content-Type'], 'application/json');

  const sentBody = JSON.parse(capturedOptions.body);
  assert.equal(sentBody.messaging_product, 'whatsapp');
  assert.equal(sentBody.to, '5511999998888');
  assert.equal(sentBody.type, 'text');
  assert.equal(sentBody.text.body, 'Olá!');

  assert.deepEqual(result, { messages: [{ id: 'wamid.FAKE123' }] });
});

test('sendWhatsAppMessage lança erro quando a resposta não é ok', async () => {
  const fakeFetch = async () => ({
    ok: false,
    status: 401,
    text: async () => '{"error":"invalid token"}'
  });

  await assert.rejects(
    () => sendWhatsAppMessage({
      phoneNumberId: '123456',
      accessToken: 'bad-token',
      to: '5511999998888',
      body: 'oi',
      fetchImpl: fakeFetch
    }),
    /Falha ao enviar mensagem no WhatsApp \(status 401\)/
  );
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd backend && node --test src/services/metaWhatsAppApi.test.js`
Expected: FAIL — `Cannot find module './metaWhatsAppApi.js'` (o arquivo ainda não existe).

- [ ] **Step 3: Implementar**

```js
// backend/src/services/metaWhatsAppApi.js
const GRAPH_API_VERSION = 'v20.0';

export async function sendWhatsAppMessage({ phoneNumberId, accessToken, to, body, fetchImpl = fetch }) {
  const res = await fetchImpl(`https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body }
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Falha ao enviar mensagem no WhatsApp (status ${res.status}): ${errText}`);
  }

  return res.json();
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd backend && node --test src/services/metaWhatsAppApi.test.js`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/metaWhatsAppApi.js backend/src/services/metaWhatsAppApi.test.js
git commit -m "feat(whatsapp): adiciona servico de envio de mensagem via Meta Graph API"
```

---

## Task 3: Hash e verificação de PIN

**Files:**
- Create: `backend/src/utils/staffAuth.js`
- Test: `backend/src/utils/staffAuth.test.js`

**Interfaces:**
- Produces: `hashPin(pin: string) => Promise<string>`, `verifyPin(pin: string, hash: string) => boolean`. Usado pelas Tarefas 6 e 7.

- [ ] **Step 1: Escrever o teste que falha**

```js
// backend/src/utils/staffAuth.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPin, verifyPin } from './staffAuth.js';

test('hashPin gera um hash diferente do PIN original', async () => {
  const hash = await hashPin('1234');
  assert.notEqual(hash, '1234');
  assert.ok(hash.length > 20);
});

test('verifyPin retorna true para o PIN correto', async () => {
  const hash = await hashPin('482913');
  assert.equal(verifyPin('482913', hash), true);
});

test('verifyPin retorna false para PIN incorreto', async () => {
  const hash = await hashPin('482913');
  assert.equal(verifyPin('000000', hash), false);
});

test('hashPin rejeita PIN fora do formato (não numérico ou tamanho inválido)', async () => {
  await assert.rejects(() => hashPin('abcd'), /PIN deve ter entre 4 e 8 dígitos numéricos/);
  await assert.rejects(() => hashPin('123'), /PIN deve ter entre 4 e 8 dígitos numéricos/);
  await assert.rejects(() => hashPin('123456789'), /PIN deve ter entre 4 e 8 dígitos numéricos/);
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd backend && node --test src/utils/staffAuth.test.js`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

```js
// backend/src/utils/staffAuth.js
import bcrypt from 'bcryptjs';

export async function hashPin(pin) {
  if (!/^\d{4,8}$/.test(pin)) {
    throw new Error('PIN deve ter entre 4 e 8 dígitos numéricos.');
  }
  const salt = bcrypt.genSaltSync(10);
  return bcrypt.hashSync(pin, salt);
}

export function verifyPin(pin, hash) {
  return bcrypt.compareSync(pin, hash);
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd backend && node --test src/utils/staffAuth.test.js`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add backend/src/utils/staffAuth.js backend/src/utils/staffAuth.test.js
git commit -m "feat(whatsapp): adiciona hash e verificacao de PIN do caixa"
```

---

## Task 4: Cálculo de ROI real

**Files:**
- Create: `backend/src/utils/whatsappRoi.js`
- Test: `backend/src/utils/whatsappRoi.test.js`

**Interfaces:**
- Consumes: nenhuma dependência externa.
- Produces: `computeRoi({ adSpend: number, conversions: Array<{ contactId: number|null, amountSpent: number }> }) => { totalSpend, totalRevenue, conversionCount, matchedCount, roi, roas }`. Usado pela Tarefa 10. Segue a mesma convenção de `roi` (percentual) e `roas` (múltiplo) já usada em `backend/src/controllers/campaignController.js`.

- [ ] **Step 1: Escrever o teste que falha**

```js
// backend/src/utils/whatsappRoi.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeRoi } from './whatsappRoi.js';

test('computeRoi calcula roi e roas corretamente com gasto e conversoes', () => {
  const result = computeRoi({
    adSpend: 200,
    conversions: [
      { contactId: 1, amountSpent: 150 },
      { contactId: 2, amountSpent: 300 },
      { contactId: null, amountSpent: 80 }
    ]
  });

  assert.equal(result.totalSpend, 200);
  assert.equal(result.totalRevenue, 530);
  assert.equal(result.conversionCount, 3);
  assert.equal(result.matchedCount, 2);
  assert.equal(result.roas, 2.65); // 530 / 200
  assert.equal(result.roi, 165);   // ((530 - 200) / 200) * 100
});

test('computeRoi retorna roi e roas zero quando nao ha gasto em anuncio', () => {
  const result = computeRoi({ adSpend: 0, conversions: [{ contactId: 1, amountSpent: 100 }] });
  assert.equal(result.roi, 0);
  assert.equal(result.roas, 0);
  assert.equal(result.totalRevenue, 100);
});

test('computeRoi lida com lista de conversoes vazia', () => {
  const result = computeRoi({ adSpend: 150, conversions: [] });
  assert.equal(result.totalRevenue, 0);
  assert.equal(result.conversionCount, 0);
  assert.equal(result.matchedCount, 0);
  assert.equal(result.roi, -100); // perdeu 100% do gasto, sem faturamento
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd backend && node --test src/utils/whatsappRoi.test.js`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

```js
// backend/src/utils/whatsappRoi.js
export function computeRoi({ adSpend, conversions }) {
  const totalSpend = Number(adSpend) || 0;
  const totalRevenue = conversions.reduce((sum, c) => sum + (Number(c.amountSpent) || 0), 0);
  const matchedCount = conversions.filter((c) => c.contactId != null).length;

  const roas = totalSpend > 0 ? totalRevenue / totalSpend : 0;
  const roi = totalSpend > 0 ? ((totalRevenue - totalSpend) / totalSpend) * 100 : 0;

  return {
    totalSpend: Number(totalSpend.toFixed(2)),
    totalRevenue: Number(totalRevenue.toFixed(2)),
    conversionCount: conversions.length,
    matchedCount,
    roi: Number(roi.toFixed(2)),
    roas: Number(roas.toFixed(2))
  };
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd backend && node --test src/utils/whatsappRoi.test.js`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add backend/src/utils/whatsappRoi.js backend/src/utils/whatsappRoi.test.js
git commit -m "feat(whatsapp): adiciona calculo de ROI real"
```

---

## Task 5: Parser do payload do webhook da Meta

**Files:**
- Create: `backend/src/utils/whatsappWebhookParser.js`
- Test: `backend/src/utils/whatsappWebhookParser.test.js`

**Interfaces:**
- Produces: `parseWhatsAppWebhook(payload: object) => Array<{ phoneNumberId, waId, profileName, waMessageId, direction: 'inbound', body, sentAt, ctwaClid, adId, adHeadline, adBody }>`. Usado pela Tarefa 8.

- [ ] **Step 1: Escrever o teste que falha**

```js
// backend/src/utils/whatsappWebhookParser.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWhatsAppWebhook } from './whatsappWebhookParser.js';

const payloadComAnuncio = {
  object: 'whatsapp_business_account',
  entry: [{
    id: 'WABA_ID',
    changes: [{
      field: 'messages',
      value: {
        messaging_product: 'whatsapp',
        metadata: { display_phone_number: '15551234567', phone_number_id: 'PHONE_123' },
        contacts: [{ profile: { name: 'Maria Silva' }, wa_id: '5511999998888' }],
        messages: [{
          from: '5511999998888',
          id: 'wamid.ABC123',
          timestamp: '1735000000',
          type: 'text',
          text: { body: 'Olá, vim pelo anúncio!' },
          referral: {
            source_type: 'ad',
            source_id: '120211234567890',
            headline: 'Promoção de hoje',
            body: 'Peça já pelo WhatsApp',
            ctwa_clid: 'AfelCsWK_fake_clid'
          }
        }]
      }
    }]
  }]
};

const payloadSemAnuncio = {
  object: 'whatsapp_business_account',
  entry: [{
    id: 'WABA_ID',
    changes: [{
      field: 'messages',
      value: {
        messaging_product: 'whatsapp',
        metadata: { display_phone_number: '15551234567', phone_number_id: 'PHONE_123' },
        contacts: [{ profile: { name: 'João Souza' }, wa_id: '5511988887777' }],
        messages: [{
          from: '5511988887777',
          id: 'wamid.DEF456',
          timestamp: '1735000100',
          type: 'text',
          text: { body: 'Vocês têm mesa pra hoje?' }
        }]
      }
    }]
  }]
};

const payloadDeStatus = {
  object: 'whatsapp_business_account',
  entry: [{
    id: 'WABA_ID',
    changes: [{
      field: 'messages',
      value: {
        messaging_product: 'whatsapp',
        metadata: { display_phone_number: '15551234567', phone_number_id: 'PHONE_123' },
        statuses: [{ id: 'wamid.ABC123', status: 'delivered' }]
      }
    }]
  }]
};

test('extrai ctwa_clid e dados do anuncio quando a mensagem vem de um Click-to-WhatsApp Ad', () => {
  const events = parseWhatsAppWebhook(payloadComAnuncio);
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], {
    phoneNumberId: 'PHONE_123',
    waId: '5511999998888',
    profileName: 'Maria Silva',
    waMessageId: 'wamid.ABC123',
    direction: 'inbound',
    body: 'Olá, vim pelo anúncio!',
    sentAt: new Date(1735000000 * 1000).toISOString(),
    ctwaClid: 'AfelCsWK_fake_clid',
    adId: '120211234567890',
    adHeadline: 'Promoção de hoje',
    adBody: 'Peça já pelo WhatsApp'
  });
});

test('mensagem organica (sem anuncio) tem campos de referral nulos', () => {
  const events = parseWhatsAppWebhook(payloadSemAnuncio);
  assert.equal(events.length, 1);
  assert.equal(events[0].ctwaClid, null);
  assert.equal(events[0].adId, null);
  assert.equal(events[0].profileName, 'João Souza');
});

test('payload de status (sem campo messages) retorna lista vazia', () => {
  const events = parseWhatsAppWebhook(payloadDeStatus);
  assert.deepEqual(events, []);
});

test('payload vazio ou malformado retorna lista vazia sem lancar erro', () => {
  assert.deepEqual(parseWhatsAppWebhook({}), []);
  assert.deepEqual(parseWhatsAppWebhook({ entry: [] }), []);
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd backend && node --test src/utils/whatsappWebhookParser.test.js`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

```js
// backend/src/utils/whatsappWebhookParser.js
export function parseWhatsAppWebhook(payload) {
  const events = [];
  const entries = payload?.entry || [];

  for (const entry of entries) {
    const changes = entry.changes || [];
    for (const change of changes) {
      const value = change.value || {};
      const phoneNumberId = value.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      const profileNameByWaId = {};
      for (const c of value.contacts || []) {
        profileNameByWaId[c.wa_id] = c.profile?.name || null;
      }

      for (const m of value.messages || []) {
        const referral = m.referral || null;
        events.push({
          phoneNumberId,
          waId: m.from,
          profileName: profileNameByWaId[m.from] || null,
          waMessageId: m.id,
          direction: 'inbound',
          body: m.text?.body || null,
          sentAt: new Date(Number(m.timestamp) * 1000).toISOString(),
          ctwaClid: referral?.ctwa_clid || null,
          adId: referral?.source_id || null,
          adHeadline: referral?.headline || null,
          adBody: referral?.body || null
        });
      }
    }
  }

  return events;
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd backend && node --test src/utils/whatsappWebhookParser.test.js`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add backend/src/utils/whatsappWebhookParser.js backend/src/utils/whatsappWebhookParser.test.js
git commit -m "feat(whatsapp): adiciona parser do payload de webhook da Cloud API"
```

---

## Task 6: Configuração do WhatsApp por cliente (admin)

**Files:**
- Create: `backend/src/controllers/whatsappSettingsController.js`
- Modify: `backend/src/server.js`

**Interfaces:**
- Consumes: `hashPin` de `backend/src/utils/staffAuth.js` (Tarefa 3).
- Produces: rotas `GET /api/whatsapp/settings`, `GET /api/whatsapp/settings/:clientId`, `POST /api/whatsapp/settings`. A Tarefa 7 (login de PIN) e a Tarefa 8 (webhook) dependem da tabela `whatsapp_settings` estar populada por aqui.

- [ ] **Step 1: Implementar o controller**

```js
// backend/src/controllers/whatsappSettingsController.js
import db from '../config/db.js';
import { hashPin } from '../utils/staffAuth.js';

export async function getWhatsappSettings(req, res) {
  try {
    const clientId = req.user.role === 'admin' ? (req.params.clientId || req.user.clientId) : req.user.clientId;
    if (!clientId) {
      return res.status(400).json({ error: 'ID do cliente é obrigatório.' });
    }

    const { rows } = await db.query(
      'SELECT client_id, phone_number_id, waba_id, display_phone_number, updated_at FROM whatsapp_settings WHERE client_id = ?',
      [clientId]
    );

    return res.json({ settings: rows[0] || null });
  } catch (error) {
    console.error('Get WhatsApp settings error:', error);
    return res.status(500).json({ error: 'Erro ao buscar configurações do WhatsApp.' });
  }
}

export async function saveWhatsappSettings(req, res) {
  try {
    const clientId = req.body.clientId;
    const { phoneNumberId, wabaId, accessToken, displayPhoneNumber, pin } = req.body;

    if (!clientId || !phoneNumberId || !wabaId || !accessToken) {
      return res.status(400).json({ error: 'clientId, phoneNumberId, wabaId e accessToken são obrigatórios.' });
    }

    const { rows: existingRows } = await db.query('SELECT id FROM whatsapp_settings WHERE client_id = ?', [clientId]);
    const alreadyExists = existingRows.length > 0;

    if (!alreadyExists && !pin) {
      return res.status(400).json({ error: 'PIN é obrigatório no primeiro cadastro deste restaurante.' });
    }

    if (pin) {
      const pinHash = await hashPin(pin);
      await db.query(
        `INSERT INTO whatsapp_settings (client_id, phone_number_id, waba_id, access_token, display_phone_number, staff_pin_hash, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT (client_id) DO UPDATE SET
           phone_number_id = excluded.phone_number_id,
           waba_id = excluded.waba_id,
           access_token = excluded.access_token,
           display_phone_number = excluded.display_phone_number,
           staff_pin_hash = excluded.staff_pin_hash,
           updated_at = CURRENT_TIMESTAMP`,
        [clientId, phoneNumberId, wabaId, accessToken, displayPhoneNumber || null, pinHash]
      );
    } else {
      await db.query(
        `UPDATE whatsapp_settings
         SET phone_number_id = ?, waba_id = ?, access_token = ?, display_phone_number = ?, updated_at = CURRENT_TIMESTAMP
         WHERE client_id = ?`,
        [phoneNumberId, wabaId, accessToken, displayPhoneNumber || null, clientId]
      );
    }

    return res.json({ message: 'Configurações do WhatsApp salvas com sucesso!' });
  } catch (error) {
    console.error('Save WhatsApp settings error:', error);
    return res.status(500).json({ error: 'Erro ao salvar configurações do WhatsApp.' });
  }
}
```

- [ ] **Step 2: Registrar as rotas (admin-only para salvar, mesmo padrão de `credentials`)**

Em `backend/src/server.js`, adicione o import junto aos outros controllers:

```js
import { getWhatsappSettings, saveWhatsappSettings } from './controllers/whatsappSettingsController.js';
```

E as rotas, logo abaixo do bloco `// Credentials`:

```js
// WhatsApp Settings
app.get('/api/whatsapp/settings', getWhatsappSettings);
app.get('/api/whatsapp/settings/:clientId', requireAdmin, getWhatsappSettings);
app.post('/api/whatsapp/settings', requireAdmin, saveWhatsappSettings);
```

- [ ] **Step 3: Verificar manualmente**

Com o backend rodando (`cd backend && node src/server.js`), pegue um token de admin:

```bash
TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"furthericgh@gmail.com","password":"@210722Df"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
```

Salve as configurações do cliente 1 (use um `phone_number_id` de teste — vamos reusar esse valor exato nas próximas tarefas):

```bash
curl -s -X POST http://localhost:5000/api/whatsapp/settings \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"clientId":1,"phoneNumberId":"PHONE_123","wabaId":"WABA_TEST","accessToken":"fake-token-dev","pin":"1234"}'
```

Expected: `{"message":"Configurações do WhatsApp salvas com sucesso!"}`. Depois confirme com:

```bash
curl -s http://localhost:5000/api/whatsapp/settings/1 -H "Authorization: Bearer $TOKEN"
```

Expected: JSON com `phone_number_id: "PHONE_123"` (sem `access_token` nem `staff_pin_hash` no retorno — não são selecionados na query).

- [ ] **Step 4: Commit**

```bash
git add backend/src/controllers/whatsappSettingsController.js backend/src/server.js
git commit -m "feat(whatsapp): adiciona configuracao de WhatsApp por cliente (admin)"
```

---

## Task 7: Login por PIN e listagem de restaurantes

**Files:**
- Create: `backend/src/controllers/staffAuthController.js`
- Modify: `backend/src/server.js`

**Interfaces:**
- Consumes: `verifyPin` de `backend/src/utils/staffAuth.js` (Tarefa 3), `JWT_SECRET` de `backend/src/middleware/authMiddleware.js` (já existe).
- Produces: rotas públicas `GET /api/staff/restaurants` e `POST /api/staff/login` → `{ token }`. O token gerado tem `{ role: 'staff', clientId }` e é aceito por `authenticateToken` (já existe, nenhuma mudança nele é necessária — ele só verifica assinatura e popula `req.user`, funciona pra qualquer payload). Usado pela Tarefa 12 (frontend `/caixa`).

- [ ] **Step 1: Implementar o controller**

```js
// backend/src/controllers/staffAuthController.js
import jwt from 'jsonwebtoken';
import db from '../config/db.js';
import { verifyPin } from '../utils/staffAuth.js';
import { JWT_SECRET } from '../middleware/authMiddleware.js';

export async function listRestaurants(req, res) {
  try {
    const { rows } = await db.query(
      `SELECT c.id, c.name
       FROM clients c
       JOIN whatsapp_settings ws ON ws.client_id = c.id
       WHERE c.active = 1
       ORDER BY c.name`
    );
    return res.json({ restaurants: rows });
  } catch (error) {
    console.error('List restaurants error:', error);
    return res.status(500).json({ error: 'Erro ao listar restaurantes.' });
  }
}

export async function staffLogin(req, res) {
  try {
    const { clientId, pin } = req.body;
    if (!clientId || !pin) {
      return res.status(400).json({ error: 'clientId e pin são obrigatórios.' });
    }

    const { rows } = await db.query('SELECT staff_pin_hash FROM whatsapp_settings WHERE client_id = ?', [clientId]);
    const settings = rows[0];

    if (!settings || !verifyPin(pin, settings.staff_pin_hash)) {
      return res.status(401).json({ error: 'PIN inválido.' });
    }

    const token = jwt.sign({ role: 'staff', clientId: Number(clientId) }, JWT_SECRET, { expiresIn: '12h' });
    return res.json({ token });
  } catch (error) {
    console.error('Staff login error:', error);
    return res.status(500).json({ error: 'Erro ao autenticar.' });
  }
}
```

- [ ] **Step 2: Registrar as rotas — ATENÇÃO: precisam ficar ANTES do `app.use('/api', authenticateToken)`**

Em `backend/src/server.js`, adicione o import:

```js
import { listRestaurants, staffLogin } from './controllers/staffAuthController.js';
```

E registre junto ao bloco `// Public Endpoints` (antes da linha `app.use('/api', authenticateToken);`):

```js
app.get('/api/staff/restaurants', listRestaurants);
app.post('/api/staff/login', staffLogin);
```

- [ ] **Step 3: Verificar manualmente**

Com o backend rodando e as configurações da Tarefa 6 já salvas:

```bash
curl -s http://localhost:5000/api/staff/restaurants
```

Expected: `{"restaurants":[{"id":1,"name":"..."}]}` (o cliente 1, já que só ele tem `whatsapp_settings`).

```bash
curl -s -X POST http://localhost:5000/api/staff/login -H "Content-Type: application/json" -d '{"clientId":1,"pin":"1234"}'
```

Expected: `{"token":"eyJ..."}`. Teste o PIN errado:

```bash
curl -s -X POST http://localhost:5000/api/staff/login -H "Content-Type: application/json" -d '{"clientId":1,"pin":"9999"}'
```

Expected: `{"error":"PIN inválido."}` com status 401.

- [ ] **Step 4: Commit**

```bash
git add backend/src/controllers/staffAuthController.js backend/src/server.js
git commit -m "feat(whatsapp): adiciona login por PIN e listagem de restaurantes"
```

---

## Task 8: Webhook de recebimento de mensagens

**Files:**
- Create: `backend/src/controllers/whatsappWebhookController.js`
- Modify: `backend/src/server.js`

**Interfaces:**
- Consumes: `parseWhatsAppWebhook` de `backend/src/utils/whatsappWebhookParser.js` (Tarefa 5).
- Produces: rotas públicas `GET /api/v1/whatsapp/webhook` (handshake) e `POST /api/v1/whatsapp/webhook` (ingestão). Grava em `whatsapp_contacts` e `whatsapp_messages`. As Tarefas 9 e 10 leem esses dados.

- [ ] **Step 1: Implementar o controller**

```js
// backend/src/controllers/whatsappWebhookController.js
import db from '../config/db.js';
import { parseWhatsAppWebhook } from '../utils/whatsappWebhookParser.js';

const VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'further_whatsapp_verify_2026';

export function verifyWebhook(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
}

export async function receiveWebhook(req, res) {
  // A Meta reenvia agressivamente em caso de resposta não-2xx — responde logo e processa depois.
  res.sendStatus(200);

  try {
    const events = parseWhatsAppWebhook(req.body);

    for (const event of events) {
      const { rows: settingsRows } = await db.query(
        'SELECT client_id FROM whatsapp_settings WHERE phone_number_id = ?',
        [event.phoneNumberId]
      );
      const clientId = settingsRows[0]?.client_id;
      if (!clientId) continue; // numero ainda nao cadastrado a nenhum cliente

      const { rows: contactRows } = await db.query(
        `INSERT INTO whatsapp_contacts (client_id, wa_id, profile_name, ctwa_clid, ad_id, ad_headline, ad_body, source, last_message_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (client_id, wa_id) DO UPDATE SET
           profile_name = COALESCE(excluded.profile_name, whatsapp_contacts.profile_name),
           ctwa_clid = COALESCE(whatsapp_contacts.ctwa_clid, excluded.ctwa_clid),
           ad_id = COALESCE(whatsapp_contacts.ad_id, excluded.ad_id),
           ad_headline = COALESCE(whatsapp_contacts.ad_headline, excluded.ad_headline),
           ad_body = COALESCE(whatsapp_contacts.ad_body, excluded.ad_body),
           source = CASE WHEN whatsapp_contacts.source = 'ad' THEN 'ad' ELSE excluded.source END,
           last_message_at = excluded.last_message_at
         RETURNING id`,
        [
          clientId,
          event.waId,
          event.profileName,
          event.ctwaClid,
          event.adId,
          event.adHeadline,
          event.adBody,
          event.ctwaClid ? 'ad' : 'organic',
          event.sentAt
        ]
      );
      const contactId = contactRows[0].id;

      await db.query(
        `INSERT INTO whatsapp_messages (client_id, contact_id, direction, body, wa_message_id, sent_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (wa_message_id) DO NOTHING`,
        [clientId, contactId, event.direction, event.body, event.waMessageId, event.sentAt]
      );
    }
  } catch (error) {
    console.error('WhatsApp webhook processing error:', error);
  }
}
```

- [ ] **Step 2: Registrar as rotas públicas — ATENÇÃO: precisam ficar ANTES do `app.use('/api', authenticateToken)`**

Em `backend/src/server.js`, adicione o import:

```js
import { verifyWebhook, receiveWebhook } from './controllers/whatsappWebhookController.js';
```

E registre junto ao bloco `// Public Endpoints` (antes da linha `app.use('/api', authenticateToken);`) — a Meta chama essa rota sem nenhum token, e `/api/v1/...` cairia no middleware de autenticação se registrada depois:

```js
app.get('/api/v1/whatsapp/webhook', verifyWebhook);
app.post('/api/v1/whatsapp/webhook', receiveWebhook);
```

- [ ] **Step 3: Verificar manualmente**

Handshake de verificação (deve ecoar o `hub.challenge`):

```bash
curl -s "http://localhost:5000/api/v1/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=further_whatsapp_verify_2026&hub.challenge=12345"
```

Expected: `12345`.

Envie um payload simulado (mesmo formato do teste da Tarefa 5, usando o `phone_number_id` `PHONE_123` já cadastrado na Tarefa 6):

```bash
curl -s -X POST http://localhost:5000/api/v1/whatsapp/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{
      "id": "WABA_TEST",
      "changes": [{
        "field": "messages",
        "value": {
          "messaging_product": "whatsapp",
          "metadata": { "display_phone_number": "15551234567", "phone_number_id": "PHONE_123" },
          "contacts": [{ "profile": { "name": "Maria Teste" }, "wa_id": "5511999998888" }],
          "messages": [{
            "from": "5511999998888",
            "id": "wamid.TESTE001",
            "timestamp": "1735000000",
            "type": "text",
            "text": { "body": "Vim pelo anuncio!" },
            "referral": { "source_type": "ad", "source_id": "AD_777", "headline": "Promo", "body": "Peca ja", "ctwa_clid": "CLID_TESTE" }
          }]
        }
      }]
    }]
  }'
```

Expected: resposta HTTP 200 vazia (a rota responde antes de processar). Confirme que gravou:

```bash
cd backend && node -e "import('./src/config/db.js').then(async ({default: db}) => { const {rows} = await db.query('SELECT wa_id, profile_name, ctwa_clid, source FROM whatsapp_contacts WHERE wa_id = ?', ['5511999998888']); console.log(rows); process.exit(0); })"
```

Expected: uma linha com `profile_name: 'Maria Teste'`, `ctwa_clid: 'CLID_TESTE'`, `source: 'ad'`.

- [ ] **Step 4: Commit**

```bash
git add backend/src/controllers/whatsappWebhookController.js backend/src/server.js
git commit -m "feat(whatsapp): adiciona webhook de recebimento de mensagens da Cloud API"
```

---

## Task 9: Conversas — listar, ler mensagens, responder

**Files:**
- Create: `backend/src/controllers/whatsappConversationsController.js`
- Modify: `backend/src/server.js`

**Interfaces:**
- Consumes: `sendWhatsAppMessage` de `backend/src/services/metaWhatsAppApi.js` (Tarefa 2).
- Produces: rotas protegidas `GET /api/whatsapp/conversations`, `GET /api/whatsapp/conversations/:contactId/messages`, `POST /api/whatsapp/conversations/:contactId/reply`. Consumido pela Tarefa 11 (frontend).

- [ ] **Step 1: Implementar o controller**

```js
// backend/src/controllers/whatsappConversationsController.js
import db from '../config/db.js';
import { sendWhatsAppMessage } from '../services/metaWhatsAppApi.js';

function resolveClientId(req) {
  return req.user.role === 'admin'
    ? (req.query.clientId || req.body.clientId || req.user.clientId)
    : req.user.clientId;
}

export async function listConversations(req, res) {
  try {
    const clientId = resolveClientId(req);
    if (!clientId) {
      return res.status(400).json({ error: 'ID do cliente é obrigatório.' });
    }

    const { rows } = await db.query(
      `SELECT id, wa_id, profile_name, source, ad_headline, last_message_at,
              (SELECT MIN(sent_at) FROM whatsapp_messages WHERE contact_id = whatsapp_contacts.id AND direction = 'inbound') as first_inbound_at,
              (SELECT MIN(sent_at) FROM whatsapp_messages WHERE contact_id = whatsapp_contacts.id AND direction = 'outbound') as first_outbound_at
       FROM whatsapp_contacts
       WHERE client_id = ?
       ORDER BY last_message_at DESC NULLS LAST
       LIMIT 100`,
      [clientId]
    );

    const conversations = rows.map((r) => ({
      ...r,
      responseTimeSeconds: r.first_inbound_at && r.first_outbound_at && new Date(r.first_outbound_at) > new Date(r.first_inbound_at)
        ? Math.round((new Date(r.first_outbound_at) - new Date(r.first_inbound_at)) / 1000)
        : null
    }));

    return res.json({ conversations });
  } catch (error) {
    console.error('List conversations error:', error);
    return res.status(500).json({ error: 'Erro ao listar conversas.' });
  }
}

export async function getMessages(req, res) {
  try {
    const clientId = resolveClientId(req);
    const { contactId } = req.params;

    const { rows } = await db.query(
      'SELECT id, direction, body, sent_at FROM whatsapp_messages WHERE contact_id = ? AND client_id = ? ORDER BY sent_at ASC',
      [contactId, clientId]
    );

    return res.json({ messages: rows });
  } catch (error) {
    console.error('Get messages error:', error);
    return res.status(500).json({ error: 'Erro ao buscar mensagens.' });
  }
}

export async function replyToConversation(req, res) {
  try {
    const clientId = resolveClientId(req);
    const { contactId } = req.params;
    const { body } = req.body;

    if (!body) {
      return res.status(400).json({ error: 'Mensagem não pode ser vazia.' });
    }

    const { rows: contactRows } = await db.query(
      'SELECT wa_id FROM whatsapp_contacts WHERE id = ? AND client_id = ?',
      [contactId, clientId]
    );
    const contact = contactRows[0];
    if (!contact) {
      return res.status(404).json({ error: 'Contato não encontrado.' });
    }

    const { rows: settingsRows } = await db.query(
      'SELECT phone_number_id, access_token FROM whatsapp_settings WHERE client_id = ?',
      [clientId]
    );
    const settings = settingsRows[0];
    if (!settings) {
      return res.status(400).json({ error: 'WhatsApp não configurado para este cliente.' });
    }

    const sendResult = await sendWhatsAppMessage({
      phoneNumberId: settings.phone_number_id,
      accessToken: settings.access_token,
      to: contact.wa_id,
      body
    });

    const waMessageId = sendResult?.messages?.[0]?.id || null;

    await db.query(
      `INSERT INTO whatsapp_messages (client_id, contact_id, direction, body, wa_message_id, sent_at)
       VALUES (?, ?, 'outbound', ?, ?, CURRENT_TIMESTAMP)`,
      [clientId, contactId, body, waMessageId]
    );

    return res.json({ message: 'Mensagem enviada.' });
  } catch (error) {
    console.error('Reply to conversation error:', error);
    return res.status(500).json({ error: 'Erro ao enviar mensagem.' });
  }
}
```

- [ ] **Step 2: Registrar as rotas protegidas**

Em `backend/src/server.js`, adicione o import:

```js
import { listConversations, getMessages, replyToConversation } from './controllers/whatsappConversationsController.js';
```

E registre junto às outras rotas protegidas (depois de `// WhatsApp Settings`):

```js
// WhatsApp Conversations
app.get('/api/whatsapp/conversations', listConversations);
app.get('/api/whatsapp/conversations/:contactId/messages', getMessages);
app.post('/api/whatsapp/conversations/:contactId/reply', replyToConversation);
```

- [ ] **Step 3: Verificar manualmente**

Usando o `$TOKEN` de admin da Tarefa 6 e o contato criado na Tarefa 8:

```bash
curl -s "http://localhost:5000/api/whatsapp/conversations?clientId=1" -H "Authorization: Bearer $TOKEN"
```

Expected: array com a conversa de "Maria Teste", `source: "ad"`, `responseTimeSeconds: null` (ainda não respondemos).

```bash
CONTACT_ID=$(curl -s "http://localhost:5000/api/whatsapp/conversations?clientId=1" -H "Authorization: Bearer $TOKEN" | node -pe 'JSON.parse(require("fs").readFileSync(0)).conversations[0].id')

curl -s "http://localhost:5000/api/whatsapp/conversations/$CONTACT_ID/messages?clientId=1" -H "Authorization: Bearer $TOKEN"
```

Expected: array com a mensagem inbound "Vim pelo anuncio!".

Teste o caminho de erro do reply (o `access_token` salvo é fake, então a chamada real à Meta vai falhar — isso é esperado sem credenciais reais ainda):

```bash
curl -s -X POST "http://localhost:5000/api/whatsapp/conversations/$CONTACT_ID/reply" \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"clientId":1,"body":"Oi! Temos mesa sim."}'
```

Expected: erro 500 com mensagem contendo "Falha ao enviar mensagem no WhatsApp" — confirma que a rota está chamando a Meta de verdade (vai funcionar assim que o token/número reais estiverem configurados). Isso **não é uma falha do código**, é o comportamento esperado sem credenciais reais da Meta ainda.

- [ ] **Step 4: Commit**

```bash
git add backend/src/controllers/whatsappConversationsController.js backend/src/server.js
git commit -m "feat(whatsapp): adiciona listagem, leitura e resposta de conversas"
```

---

## Task 10: Busca de contato, lançamento de conversão e ROI

**Files:**
- Create: `backend/src/controllers/realConversionsController.js`
- Modify: `backend/src/controllers/campaignController.js:36` (exportar `resolveDateRange`)
- Modify: `backend/src/server.js`

**Interfaces:**
- Consumes: `computeRoi` de `backend/src/utils/whatsappRoi.js` (Tarefa 4), `resolveDateRange` de `backend/src/controllers/campaignController.js`.
- Produces: rotas protegidas `GET /api/whatsapp/contacts/search`, `POST /api/whatsapp/conversions`, `GET /api/whatsapp/roi`. Consumido pela Tarefa 11 (painel de ROI) e Tarefa 12 (tela do caixa).

- [ ] **Step 1: Exportar `resolveDateRange` para reuso**

Em `backend/src/controllers/campaignController.js:36`, mude a assinatura da função de:

```js
function resolveDateRange({ startDate, endDate, range = '30d' }) {
```

para:

```js
export function resolveDateRange({ startDate, endDate, range = '30d' }) {
```

Nenhuma outra linha muda — é só adicionar `export`, o uso local dentro do mesmo arquivo continua funcionando igual.

- [ ] **Step 2: Implementar o controller**

```js
// backend/src/controllers/realConversionsController.js
import db from '../config/db.js';
import { computeRoi } from '../utils/whatsappRoi.js';
import { resolveDateRange } from './campaignController.js';

function resolveClientId(req) {
  return req.user.role === 'admin'
    ? (req.query.clientId || req.body.clientId || req.user.clientId)
    : req.user.clientId;
}

export async function searchContacts(req, res) {
  try {
    const clientId = resolveClientId(req);
    const q = (req.query.q || '').trim();

    if (!clientId || !q) {
      return res.json({ contacts: [] });
    }

    const term = `%${q}%`;
    const { rows } = await db.query(
      `SELECT id, wa_id, profile_name, source, ad_headline
       FROM whatsapp_contacts
       WHERE client_id = ? AND (profile_name ILIKE ? OR wa_id ILIKE ?)
       ORDER BY last_message_at DESC NULLS LAST
       LIMIT 20`,
      [clientId, term, term]
    );

    return res.json({ contacts: rows });
  } catch (error) {
    console.error('Search contacts error:', error);
    return res.status(500).json({ error: 'Erro ao buscar contatos.' });
  }
}

export async function createConversion(req, res) {
  try {
    const clientId = resolveClientId(req);
    const { contactId, customerName, phone, amountSpent, matchedBy } = req.body;

    if (!clientId || !customerName || amountSpent == null) {
      return res.status(400).json({ error: 'customerName e amountSpent são obrigatórios.' });
    }

    if (!['phone', 'name', 'manual'].includes(matchedBy)) {
      return res.status(400).json({ error: 'matchedBy deve ser phone, name ou manual.' });
    }

    const { rows } = await db.query(
      `INSERT INTO real_conversions (client_id, contact_id, customer_name, phone, amount_spent, matched_by)
       VALUES (?, ?, ?, ?, ?, ?)
       RETURNING id`,
      [clientId, contactId || null, customerName, phone || null, Number(amountSpent), matchedBy]
    );

    return res.status(201).json({ message: 'Conversão registrada com sucesso!', id: rows[0].id });
  } catch (error) {
    console.error('Create conversion error:', error);
    return res.status(500).json({ error: 'Erro ao registrar conversão.' });
  }
}

export async function getRoi(req, res) {
  try {
    const clientId = resolveClientId(req);
    if (!clientId) {
      return res.status(400).json({ error: 'ID do cliente é obrigatório.' });
    }

    const { startStr, endStr } = resolveDateRange({ range: req.query.range });

    const { rows: spendRows } = await db.query(
      `SELECT COALESCE(SUM(spend), 0) as total_spend
       FROM daily_metrics
       WHERE client_id = ? AND platform = 'meta' AND date >= ? AND date <= ?`,
      [clientId, startStr, endStr]
    );

    const { rows: conversionRows } = await db.query(
      `SELECT contact_id, amount_spent
       FROM real_conversions
       WHERE client_id = ? AND created_at::date >= ? AND created_at::date <= ?`,
      [clientId, startStr, endStr]
    );

    const roi = computeRoi({
      adSpend: spendRows[0].total_spend,
      conversions: conversionRows.map((c) => ({ contactId: c.contact_id, amountSpent: c.amount_spent }))
    });

    return res.json({ roi });
  } catch (error) {
    console.error('Get WhatsApp ROI error:', error);
    return res.status(500).json({ error: 'Erro ao calcular ROI.' });
  }
}
```

- [ ] **Step 3: Registrar as rotas protegidas**

Em `backend/src/server.js`, adicione o import:

```js
import { searchContacts, createConversion, getRoi } from './controllers/realConversionsController.js';
```

E registre:

```js
// Real Conversions & ROI
app.get('/api/whatsapp/contacts/search', searchContacts);
app.post('/api/whatsapp/conversions', createConversion);
app.get('/api/whatsapp/roi', getRoi);
```

- [ ] **Step 4: Verificar manualmente**

Busca (usando o `$TOKEN` de admin e o contato "Maria Teste" das tarefas anteriores):

```bash
curl -s "http://localhost:5000/api/whatsapp/contacts/search?clientId=1&q=Maria" -H "Authorization: Bearer $TOKEN"
```

Expected: array com "Maria Teste".

Lançar conversão:

```bash
curl -s -X POST http://localhost:5000/api/whatsapp/conversions \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d "{\"clientId\":1,\"contactId\":$CONTACT_ID,\"customerName\":\"Maria Teste\",\"phone\":\"5511999998888\",\"amountSpent\":180.50,\"matchedBy\":\"phone\"}"
```

Expected: `{"message":"Conversão registrada com sucesso!","id":1}`.

ROI:

```bash
curl -s "http://localhost:5000/api/whatsapp/roi?clientId=1&range=30d" -H "Authorization: Bearer $TOKEN"
```

Expected: JSON com `totalRevenue: 180.5`, `conversionCount: 1`, `matchedCount: 1`, e `totalSpend`/`roi`/`roas` calculados a partir do gasto Meta real do cliente 1 (que já existe nos dados seed) — confira que os números batem com `totalSpend > 0` e `roas = totalRevenue / totalSpend` arredondado a 2 casas.

- [ ] **Step 5: Commit**

```bash
git add backend/src/controllers/realConversionsController.js backend/src/controllers/campaignController.js backend/src/server.js
git commit -m "feat(whatsapp): adiciona busca de contato, lancamento de conversao e ROI real"
```

---

## Task 11: Frontend — aba de Caixa de Entrada no painel

**Files:**
- Create: `frontend/src/pages/WhatsAppInboxPage.jsx`
- Modify: `frontend/src/components/Sidebar.jsx`
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: `GET /api/whatsapp/conversations`, `GET /api/whatsapp/conversations/:id/messages`, `POST /api/whatsapp/conversations/:id/reply`, `GET /api/whatsapp/roi` (Tarefas 9 e 10).

- [ ] **Step 1: Adicionar o item de menu no Sidebar**

Em `frontend/src/components/Sidebar.jsx`, adicione `MessageCircle` ao import de ícones:

```js
import {
  LayoutDashboard,
  BarChart3,
  KeyRound,
  Users,
  Target,
  Link2,
  LogOut,
  ShieldCheck,
  Building2,
  MessageCircle
} from 'lucide-react';
```

E adicione o item no array `menuItems`, logo depois de `tracking` (mesmo nível de acesso — visível a admin e client, igual Remarketing/Tracking):

```js
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'campaigns', label: 'Campanhas', icon: BarChart3 },
    { id: 'remarketing', label: 'Remarketing / Leads', icon: Target },
    { id: 'tracking', label: 'Tracking & Atribuição', icon: Link2 },
    { id: 'whatsapp', label: 'WhatsApp & Conversões', icon: MessageCircle },
  ];
```

- [ ] **Step 2: Criar a página**

```jsx
// frontend/src/pages/WhatsAppInboxPage.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { MessageCircle, Send } from 'lucide-react';

export default function WhatsAppInboxPage({ selectedClient }) {
  const [conversations, setConversations] = useState([]);
  const [selectedContactId, setSelectedContactId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [replyText, setReplyText] = useState('');
  const [roi, setRoi] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetchConversations();
    fetchRoi();
  }, [selectedClient]);

  useEffect(() => {
    if (selectedContactId) fetchMessages(selectedContactId);
  }, [selectedContactId]);

  const fetchConversations = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/whatsapp/conversations', { params: { clientId: selectedClient } });
      setConversations(res.data.conversations || []);
    } catch (err) {
      console.error('Error fetching conversations:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchRoi = async () => {
    try {
      const res = await axios.get('/api/whatsapp/roi', { params: { clientId: selectedClient } });
      setRoi(res.data.roi);
    } catch (err) {
      console.error('Error fetching WhatsApp ROI:', err);
    }
  };

  const fetchMessages = async (contactId) => {
    try {
      const res = await axios.get(`/api/whatsapp/conversations/${contactId}/messages`, { params: { clientId: selectedClient } });
      setMessages(res.data.messages || []);
    } catch (err) {
      console.error('Error fetching messages:', err);
    }
  };

  const handleSendReply = async (e) => {
    e.preventDefault();
    if (!replyText.trim() || !selectedContactId) return;
    setSending(true);
    try {
      await axios.post(`/api/whatsapp/conversations/${selectedContactId}/reply`, {
        clientId: selectedClient,
        body: replyText
      });
      setReplyText('');
      fetchMessages(selectedContactId);
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao enviar mensagem.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <MessageCircle size={28} color="var(--accent-success)" />
          WhatsApp & Conversões Reais
        </h1>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          Conversas vindas de anúncios Click-to-WhatsApp e o ROI real calculado a partir das vendas lançadas no caixa.
        </p>
      </div>

      {roi && (
        <div className="glass-card" style={{ padding: '20px', marginBottom: '24px', display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Gasto em Anúncio (Meta)</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff' }}>R$ {roi.totalSpend.toFixed(2)}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Faturamento Real Lançado</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#10b981' }}>R$ {roi.totalRevenue.toFixed(2)}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>ROAS Real</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#a855f7' }}>{roi.roas.toFixed(2)}x</div>
          </div>
          <div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Vendas Lançadas</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff' }}>{roi.conversionCount}</div>
          </div>
        </div>
      )}

      <div className="glass-card" style={{ display: 'grid', gridTemplateColumns: '300px 1fr', minHeight: '480px' }}>
        <div style={{ borderRight: '1px solid var(--border-color)', overflowY: 'auto', maxHeight: '600px' }}>
          {loading ? (
            <div style={{ padding: '20px', color: 'var(--text-muted)' }}>Carregando...</div>
          ) : conversations.length === 0 ? (
            <div style={{ padding: '20px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Nenhuma conversa ainda. Configure o número do WhatsApp em Chaves e APIs.
            </div>
          ) : (
            conversations.map((c) => (
              <div
                key={c.id}
                onClick={() => setSelectedContactId(c.id)}
                style={{
                  padding: '14px 16px',
                  cursor: 'pointer',
                  backgroundColor: selectedContactId === c.id ? 'var(--bg-card-hover)' : 'transparent',
                  borderBottom: '1px solid rgba(255,255,255,0.04)'
                }}
              >
                <div style={{ fontWeight: 600, color: '#fff', fontSize: '0.9rem' }}>
                  {c.profile_name || c.wa_id}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  {c.source === 'ad' ? `📢 ${c.ad_headline || 'Veio de anúncio'}` : 'Contato direto'}
                </div>
                <div style={{ fontSize: '0.75rem', marginTop: '4px', color: c.responseTimeSeconds == null ? '#f59e0b' : '#10b981' }}>
                  {c.responseTimeSeconds == null
                    ? '⏳ Ainda sem resposta'
                    : `⏱ Respondido em ${c.responseTimeSeconds < 60
                        ? `${c.responseTimeSeconds}s`
                        : `${Math.round(c.responseTimeSeconds / 60)} min`}`}
                </div>
              </div>
            ))
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', padding: '16px' }}>
          {!selectedContactId ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              Selecione uma conversa
            </div>
          ) : (
            <>
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                {messages.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      alignSelf: m.direction === 'outbound' ? 'flex-end' : 'flex-start',
                      backgroundColor: m.direction === 'outbound' ? 'var(--accent-primary)' : 'var(--bg-card)',
                      color: '#fff',
                      padding: '8px 12px',
                      borderRadius: '10px',
                      maxWidth: '70%',
                      fontSize: '0.85rem'
                    }}
                  >
                    {m.body}
                  </div>
                ))}
              </div>
              <form onSubmit={handleSendReply} style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  className="form-input"
                  placeholder="Digite uma resposta..."
                  style={{ flex: 1 }}
                />
                <button type="submit" disabled={sending} className="btn btn-primary">
                  <Send size={16} />
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Renderizar a página no App.jsx**

Em `frontend/src/App.jsx`, adicione o import junto aos outros:

```js
import WhatsAppInboxPage from './pages/WhatsAppInboxPage';
```

E o bloco de renderização, logo depois do bloco `{activeTab === 'tracking' && (...)}`:

```jsx
          {activeTab === 'whatsapp' && (
            <WhatsAppInboxPage selectedClient={selectedClientId} />
          )}
```

- [ ] **Step 4: Verificar manualmente**

```bash
cd frontend && npx vite build
```

Expected: build limpo, sem erro.

Suba os dois servidores (`cd backend && node src/server.js` e `cd frontend && npx vite --port 5180`), logue como admin, clique em "WhatsApp & Conversões" no menu, e confirme visualmente:
- O painel de ROI aparece com os números da Tarefa 10.
- A lista mostra "Maria Teste" com "📢" (veio de anúncio).
- Clicar na conversa mostra a mensagem "Vim pelo anuncio!" na thread.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/WhatsAppInboxPage.jsx frontend/src/components/Sidebar.jsx frontend/src/App.jsx
git commit -m "feat(whatsapp): adiciona aba de caixa de entrada e ROI no painel"
```

---

## Task 12: Frontend — app separado `/caixa` (PIN + lançamento de venda)

**Files:**
- Create: `frontend/src/CaixaApp.jsx`
- Modify: `frontend/src/main.jsx`

**Interfaces:**
- Consumes: `GET /api/staff/restaurants`, `POST /api/staff/login`, `GET /api/whatsapp/contacts/search`, `POST /api/whatsapp/conversions` (Tarefas 7 e 10).

- [ ] **Step 1: Criar o app do caixa**

```jsx
// frontend/src/CaixaApp.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Store, Lock, Search, CheckCircle2, ArrowLeft } from 'lucide-react';

const caixaApi = axios.create();

export default function CaixaApp() {
  const [step, setStep] = useState('select-restaurant');
  const [restaurants, setRestaurants] = useState([]);
  const [selectedRestaurant, setSelectedRestaurant] = useState(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [selectedContact, setSelectedContact] = useState(null);
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [amountSpent, setAmountSpent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    caixaApi.get('/api/staff/restaurants').then((res) => {
      setRestaurants(res.data.restaurants || []);
    }).catch(() => setError('Não foi possível carregar a lista de restaurantes.'));
  }, []);

  const handlePinSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await caixaApi.post('/api/staff/login', { clientId: selectedRestaurant.id, pin });
      caixaApi.defaults.headers.common['Authorization'] = `Bearer ${res.data.token}`;
      setStep('search');
    } catch (err) {
      setError(err.response?.data?.error || 'PIN inválido.');
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    try {
      const res = await caixaApi.get('/api/whatsapp/contacts/search', { params: { q: query } });
      setResults(res.data.contacts || []);
    } catch (err) {
      setError('Erro ao buscar.');
    }
  };

  const selectContact = (contact) => {
    setSelectedContact(contact);
    setCustomerName(contact.profile_name || '');
    setPhone(contact.wa_id || '');
    setStep('confirm');
  };

  const skipMatch = () => {
    setSelectedContact(null);
    setCustomerName(query);
    setPhone('');
    setStep('confirm');
  };

  const handleConfirm = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await caixaApi.post('/api/whatsapp/conversions', {
        contactId: selectedContact?.id || null,
        customerName,
        phone,
        amountSpent: Number(amountSpent),
        matchedBy: selectedContact ? 'phone' : 'manual'
      });
      setStep('success');
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao lançar conversão.');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForNext = () => {
    setQuery('');
    setResults([]);
    setSelectedContact(null);
    setCustomerName('');
    setPhone('');
    setAmountSpent('');
    setStep('search');
  };

  const inputStyle = {
    width: '100%',
    padding: '14px',
    borderRadius: '10px',
    border: '1px solid rgba(255,255,255,0.1)',
    backgroundColor: '#131b2e',
    color: '#fff',
    marginBottom: '12px',
    fontSize: '1rem'
  };

  const buttonStyle = {
    width: '100%',
    padding: '14px',
    borderRadius: '10px',
    border: 'none',
    background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
    color: '#fff',
    fontWeight: 700,
    fontSize: '1rem',
    cursor: 'pointer'
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#0b0f19',
      color: '#f8fafc',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      fontFamily: "'Inter', sans-serif"
    }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>
        {step === 'select-restaurant' && (
          <div>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Store size={22} /> Selecione o restaurante
            </h1>
            {error && <p style={{ color: '#f87171', marginBottom: '12px' }}>{error}</p>}
            {restaurants.map((r) => (
              <button
                key={r.id}
                onClick={() => { setSelectedRestaurant(r); setStep('pin'); }}
                style={{ ...inputStyle, cursor: 'pointer', textAlign: 'left', fontWeight: 600 }}
              >
                {r.name}
              </button>
            ))}
          </div>
        )}

        {step === 'pin' && (
          <form onSubmit={handlePinSubmit}>
            <button type="button" onClick={() => setStep('select-restaurant')} style={{ background: 'none', border: 'none', color: '#94a3b8', marginBottom: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <ArrowLeft size={16} /> Voltar
            </button>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Lock size={22} /> PIN de {selectedRestaurant?.name}
            </h1>
            <input
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Digite o PIN"
              autoFocus
              style={{ ...inputStyle, fontSize: '1.4rem', textAlign: 'center' }}
            />
            {error && <p style={{ color: '#f87171', marginBottom: '12px' }}>{error}</p>}
            <button type="submit" style={buttonStyle}>Entrar</button>
          </form>
        )}

        {step === 'search' && (
          <form onSubmit={handleSearch}>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Search size={22} /> Buscar cliente
            </h1>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nome ou telefone"
              autoFocus
              style={inputStyle}
            />
            <button type="submit" style={{ ...buttonStyle, marginBottom: '16px' }}>Buscar</button>

            {results.map((c) => (
              <button
                type="button"
                key={c.id}
                onClick={() => selectContact(c)}
                style={{ ...inputStyle, cursor: 'pointer', textAlign: 'left' }}
              >
                <div style={{ fontWeight: 600 }}>{c.profile_name || 'Sem nome'}</div>
                <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{c.wa_id}{c.source === 'ad' ? ' · veio de anúncio' : ''}</div>
              </button>
            ))}

            {query && (
              <button
                type="button"
                onClick={skipMatch}
                style={{ ...inputStyle, cursor: 'pointer', border: '1px dashed rgba(255,255,255,0.2)', backgroundColor: 'transparent', color: '#94a3b8', textAlign: 'center' }}
              >
                Não achei — lançar mesmo assim
              </button>
            )}
          </form>
        )}

        {step === 'confirm' && (
          <form onSubmit={handleConfirm}>
            <button type="button" onClick={() => setStep('search')} style={{ background: 'none', border: 'none', color: '#94a3b8', marginBottom: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <ArrowLeft size={16} /> Voltar
            </button>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '16px' }}>Confirmar venda</h1>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Nome do cliente"
              required
              style={inputStyle}
            />
            <input
              type="number"
              step="0.01"
              value={amountSpent}
              onChange={(e) => setAmountSpent(e.target.value)}
              placeholder="Valor gasto (R$)"
              required
              autoFocus
              style={{ ...inputStyle, fontSize: '1.2rem' }}
            />
            {error && <p style={{ color: '#f87171', marginBottom: '12px' }}>{error}</p>}
            <button type="submit" disabled={submitting} style={{ ...buttonStyle, background: 'linear-gradient(135deg, #10b981, #059669)' }}>
              {submitting ? 'Salvando...' : 'Lançar venda'}
            </button>
          </form>
        )}

        {step === 'success' && (
          <div style={{ textAlign: 'center' }}>
            <CheckCircle2 size={56} color="#10b981" style={{ margin: '0 auto 16px' }} />
            <h1 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '20px' }}>Venda lançada!</h1>
            <button onClick={resetForNext} style={buttonStyle}>Lançar próxima</button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Ramificar o entry point sem tocar em `App.jsx`**

```jsx
// frontend/src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import CaixaApp from './CaixaApp.jsx';
import './index.css';

const isCaixaRoute = window.location.pathname.startsWith('/caixa');

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isCaixaRoute ? <CaixaApp /> : <App />}
  </React.StrictMode>,
);
```

- [ ] **Step 3: Verificar manualmente**

```bash
cd frontend && npx vite build
```

Expected: build limpo.

Com os dois servidores rodando, abra `http://localhost:5180/caixa` no navegador (ou via Playwright) e confirme visualmente:
- A tela de seleção de restaurante aparece, sem sidebar, sem navbar, sem nada do painel principal.
- Selecionar o restaurante e digitar o PIN `1234` (cadastrado na Tarefa 6) avança pra busca.
- Buscar "Maria" retorna o contato e mostra "· veio de anúncio".
- Confirmar a venda com um valor mostra a tela de sucesso.
- Abrir `http://localhost:5180/` (sem `/caixa`) continua mostrando o painel normal, dashboard intacto.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/CaixaApp.jsx frontend/src/main.jsx
git commit -m "feat(whatsapp): adiciona app separado /caixa para lancamento de venda por PIN"
```

---

## Resumo de cobertura da spec

| Requisito da spec | Tarefa |
|---|---|
| Tabelas novas, nenhuma existente alterada | 1 |
| Custo/mensagem via Cloud API (contexto, não código) | — (decisão já tomada, sem tarefa de código) |
| Webhook capta `ctwa_clid` e dados do anúncio | 5, 8 |
| Tempo de resposta (inbound → outbound) | 9 (`responseTimeSeconds`) |
| Login por PIN por restaurante, escopado a um `client_id` | 3, 7 |
| Busca por nome OU telefone | 10 |
| Lançamento de venda pelo caixa, com/sem match | 10, 12 |
| ROI real = gasto Meta vs. faturamento real | 4, 10, 11 |
| Aba no menu principal, mesmo acesso de Remarketing/Tracking | 11 |
| Rota `/caixa` separada, sem tocar no painel | 12 |
| Admin usa o seletor de cliente já existente pra ver qualquer inbox | 9, 10, 11 (via `resolveClientId` + `selectedClient` já propagado no `App.jsx`) |
