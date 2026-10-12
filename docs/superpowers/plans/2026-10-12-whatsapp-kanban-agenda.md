# Funil WhatsApp (Kanban) + Agenda Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar automaticamente em qual etapa do funil cada contato de WhatsApp está (Novo Lead → Em Atendimento → Agendado → Não Compareceu → Compareceu → Remarketing), deixar o caixa marcar um agendamento direto do `/caixa`, e dar ao admin uma agenda por dia de todos os agendamentos.

**Architecture:** Extensão aditiva do módulo de WhatsApp já em produção. A etapa do funil é **calculada a cada requisição** (sem coluna `stage` armazenada, sem job agendado) a partir de dados que já existem (`real_conversions`, `whatsapp_messages`) mais um campo novo (`appointment_at`). Backend: um helper de lógica pura (`whatsappStage.js`) consumido por um controller novo com 3 rotas. Frontend: duas abas novas no painel admin (Kanban e Agenda) e uma ação nova no app `/caixa` já existente.

**Tech Stack:** Node.js (ESM), Express, `pg` — mesmas libs já usadas, nenhuma dependência nova no backend. Frontend: React, `axios`, `lucide-react` — mesmas libs já usadas, nenhuma dependência nova (sem drag-and-drop, o quadro é só leitura).

**Spec:** `docs/superpowers/specs/2026-10-12-whatsapp-kanban-agenda-design.md`

## Global Constraints

- Nenhuma tabela, rota, controller ou componente existente muda de comportamento — só adições (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, rotas novas, abas novas, um novo branch de UI em `CaixaApp.jsx`).
- A etapa do Kanban nunca é armazenada em coluna nem calculada por job/cron — sempre recalculada na hora da requisição (decisão do spec, seção "Decisões já validadas").
- O projeto não tem framework de testes automatizado; segue a mesma convenção já usada no módulo de WhatsApp (ver `docs/superpowers/plans/2026-09-28-whatsapp-conversion-tracking.md`): lógica pura e sem I/O ganha teste automatizado com `node --test` (zero dependência nova, Node 18+); rotas Express e telas React são verificadas manualmente (curl com token real / rodando os servidores).
- `DATABASE_URL` do `.env` aponta pro Postgres de produção (não existe banco de dev separado neste projeto) — os `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` são seguros de rodar contra produção, mesmo padrão dos que já existem em `backend/src/config/db.js:209-213`.
- Seis etapas fixas, chaves internas em snake_case: `novo_lead`, `em_atendimento`, `agendado`, `nao_compareceu`, `compareceu`, `remarketing`.

## Review Focus

- **Contato sem nenhuma mensagem ainda mas já com `appointment_at` no passado** (ex: agendamento criado manualmente sem conversa prévia) — a regra de prioridade deve classificar como "Não Compareceu" sem explodir ao calcular última atividade (que pode não existir). Testado na Tarefa 2.
- **Contato que teve resposta da equipe há muito tempo e nunca mais teve contato nem agendamento** — não pode ficar permanentemente em "Em Atendimento"; precisa cair em "Remarketing" depois de `remarketing_days` (esse era um bug real identificado na revisão do spec). Testado na Tarefa 2.
- **Cliente sem `whatsapp_settings` configurado** chamando `/api/whatsapp/kanban` ou `/api/whatsapp/agenda` — não pode derrubar a rota com erro 500 por `remarketing_days` nulo; precisa cair num default de 3 dias. Testado na Tarefa 3.
- **`appointmentAt` inválido ou de outro cliente** enviado para `POST /api/whatsapp/contacts/:contactId/appointment` — a rota precisa validar o formato da data e confirmar que o `contactId` pertence ao `clientId` do token (igual ao padrão de `getMessages`/`replyToConversation`), devolvendo 400/404 em vez de gravar lixo ou vazar dado de outro cliente. Testado na Tarefa 3.
- **Agendar sem ter encontrado o contato na busca do `/caixa`** (fluxo "Não achei — lançar mesmo assim") — como agendamento exige `contact_id` (diferente de lançar venda, que aceita manual), a opção "Marcar agendamento" precisa ficar indisponível nesse caminho, não só falhar silenciosamente. Testado na Tarefa 6.

---

## Task 1: Colunas novas no banco de dados

**Files:**
- Modify: `backend/src/config/db.js:209-213`

**Interfaces:**
- Produces: `whatsapp_contacts.appointment_at` (TIMESTAMP, nullable) e `whatsapp_settings.remarketing_days` (INTEGER, default 3). Todas as tarefas seguintes dependem dessas colunas.

- [ ] **Step 1: Adicionar as duas colunas no bloco aditivo de `initDb()`**

Em `backend/src/config/db.js`, o bloco aditivo atual (linhas 209-213) é:

```js
  await query(`ALTER TABLE daily_metrics ADD COLUMN IF NOT EXISTS reach INTEGER DEFAULT 0`);
  await query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS campaign_prefix TEXT`);
  await query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS page_id TEXT`);
  await query(`ALTER TABLE campaigns ALTER COLUMN client_id DROP NOT NULL`);
  await query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS classification TEXT NOT NULL DEFAULT 'ok'`);
```

Adicione duas linhas no final desse bloco (antes de `await seedData();`):

```js
  await query(`ALTER TABLE daily_metrics ADD COLUMN IF NOT EXISTS reach INTEGER DEFAULT 0`);
  await query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS campaign_prefix TEXT`);
  await query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS page_id TEXT`);
  await query(`ALTER TABLE campaigns ALTER COLUMN client_id DROP NOT NULL`);
  await query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS classification TEXT NOT NULL DEFAULT 'ok'`);
  await query(`ALTER TABLE whatsapp_contacts ADD COLUMN IF NOT EXISTS appointment_at TIMESTAMP`);
  await query(`ALTER TABLE whatsapp_settings ADD COLUMN IF NOT EXISTS remarketing_days INTEGER NOT NULL DEFAULT 3`);
```

- [ ] **Step 2: Verificar manualmente**

Rode o backend localmente:

```bash
cd backend && node src/server.js
```

Expected: log `🚀 Backend Ad Campaign Tracker rodando na porta 5000` sem erro. Confirme as colunas:

```bash
node -e "import('./src/config/db.js').then(async ({default: db}) => { const {rows} = await db.query(\"SELECT column_name FROM information_schema.columns WHERE table_name = 'whatsapp_contacts' AND column_name = 'appointment_at' UNION SELECT column_name FROM information_schema.columns WHERE table_name = 'whatsapp_settings' AND column_name = 'remarketing_days'\"); console.log(rows); process.exit(0); })"
```

Expected: duas linhas, `appointment_at` e `remarketing_days`.

- [ ] **Step 3: Commit**

```bash
git add backend/src/config/db.js
git commit -m "feat(whatsapp): adiciona colunas de agendamento e prazo de remarketing"
```

---

## Task 2: Cálculo da etapa do funil (lógica pura)

**Files:**
- Create: `backend/src/services/whatsappStage.js`
- Test: `backend/src/services/whatsappStage.test.js`

**Interfaces:**
- Consumes: nenhuma dependência externa.
- Produces: `computeStage({ hasConversion, appointmentAt, hasOutbound, lastActivityAt, remarketingDays, now }) => 'novo_lead' | 'em_atendimento' | 'agendado' | 'nao_compareceu' | 'compareceu' | 'remarketing'`. Usado pela Tarefa 3.

- [ ] **Step 1: Escrever o teste que falha**

```js
// backend/src/services/whatsappStage.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStage } from './whatsappStage.js';

const NOW = new Date('2026-10-12T12:00:00.000Z');

test('conversao registrada vence qualquer outra condicao -> compareceu', () => {
  const stage = computeStage({
    hasConversion: true,
    appointmentAt: new Date('2026-10-20T18:00:00.000Z'), // futuro, mas irrelevante
    hasOutbound: true,
    lastActivityAt: NOW,
    remarketingDays: 3,
    now: NOW
  });
  assert.equal(stage, 'compareceu');
});

test('agendamento no futuro, sem conversao -> agendado', () => {
  const stage = computeStage({
    hasConversion: false,
    appointmentAt: new Date('2026-10-13T18:00:00.000Z'),
    hasOutbound: true,
    lastActivityAt: NOW,
    remarketingDays: 3,
    now: NOW
  });
  assert.equal(stage, 'agendado');
});

test('agendamento no passado, sem conversao -> nao_compareceu', () => {
  const stage = computeStage({
    hasConversion: false,
    appointmentAt: new Date('2026-10-10T18:00:00.000Z'),
    hasOutbound: true,
    lastActivityAt: NOW,
    remarketingDays: 3,
    now: NOW
  });
  assert.equal(stage, 'nao_compareceu');
});

test('agendamento no passado sem nenhuma mensagem registrada -> nao_compareceu (nao quebra)', () => {
  const stage = computeStage({
    hasConversion: false,
    appointmentAt: new Date('2026-10-10T18:00:00.000Z'),
    hasOutbound: false,
    lastActivityAt: null,
    remarketingDays: 3,
    now: NOW
  });
  assert.equal(stage, 'nao_compareceu');
});

test('sem agendamento, atividade recente e equipe ja respondeu -> em_atendimento', () => {
  const stage = computeStage({
    hasConversion: false,
    appointmentAt: null,
    hasOutbound: true,
    lastActivityAt: new Date('2026-10-11T12:00:00.000Z'), // 1 dia atras
    remarketingDays: 3,
    now: NOW
  });
  assert.equal(stage, 'em_atendimento');
});

test('sem agendamento, atividade recente e equipe nunca respondeu -> novo_lead', () => {
  const stage = computeStage({
    hasConversion: false,
    appointmentAt: null,
    hasOutbound: false,
    lastActivityAt: new Date('2026-10-11T12:00:00.000Z'),
    remarketingDays: 3,
    now: NOW
  });
  assert.equal(stage, 'novo_lead');
});

test('sem agendamento, atividade antiga mesmo tendo tido resposta antes -> remarketing (nao fica preso em em_atendimento)', () => {
  const stage = computeStage({
    hasConversion: false,
    appointmentAt: null,
    hasOutbound: true, // a equipe respondeu em algum momento no passado
    lastActivityAt: new Date('2026-10-05T12:00:00.000Z'), // 7 dias atras
    remarketingDays: 3,
    now: NOW
  });
  assert.equal(stage, 'remarketing');
});

test('sem agendamento e sem nenhuma atividade registrada -> remarketing', () => {
  const stage = computeStage({
    hasConversion: false,
    appointmentAt: null,
    hasOutbound: false,
    lastActivityAt: null,
    remarketingDays: 3,
    now: NOW
  });
  assert.equal(stage, 'remarketing');
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd backend && node --test src/services/whatsappStage.test.js`
Expected: FAIL — `Cannot find module './whatsappStage.js'`.

- [ ] **Step 3: Implementar**

```js
// backend/src/services/whatsappStage.js
const DAY_MS = 24 * 60 * 60 * 1000;

export function computeStage({ hasConversion, appointmentAt, hasOutbound, lastActivityAt, remarketingDays = 3, now = new Date() }) {
  if (hasConversion) return 'compareceu';

  if (appointmentAt) {
    return new Date(appointmentAt) > now ? 'agendado' : 'nao_compareceu';
  }

  if (!lastActivityAt) return 'remarketing';

  const withinWindow = (now - new Date(lastActivityAt)) <= remarketingDays * DAY_MS;
  if (!withinWindow) return 'remarketing';

  return hasOutbound ? 'em_atendimento' : 'novo_lead';
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd backend && node --test src/services/whatsappStage.test.js`
Expected: PASS (8 testes).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/whatsappStage.js backend/src/services/whatsappStage.test.js
git commit -m "feat(whatsapp): adiciona calculo automatico da etapa do funil"
```

---

## Task 3: Rotas de Kanban, Agenda e Agendamento

**Files:**
- Create: `backend/src/controllers/whatsappKanbanController.js`
- Modify: `backend/src/server.js`

**Interfaces:**
- Consumes: `computeStage` de `backend/src/services/whatsappStage.js` (Tarefa 2).
- Produces: rotas protegidas `GET /api/whatsapp/kanban`, `GET /api/whatsapp/agenda`, `POST /api/whatsapp/contacts/:contactId/appointment`. Consumido pelas Tarefas 4, 5 e 6.

- [ ] **Step 1: Implementar o controller**

```js
// backend/src/controllers/whatsappKanbanController.js
import db from '../config/db.js';
import { computeStage } from '../services/whatsappStage.js';

function resolveClientId(req) {
  return req.user.role === 'admin'
    ? (req.query.clientId || req.body.clientId || req.user.clientId)
    : req.user.clientId;
}

export async function getKanban(req, res) {
  try {
    const clientId = resolveClientId(req);
    if (!clientId) {
      return res.status(400).json({ error: 'ID do cliente é obrigatório.' });
    }

    const { rows: settingsRows } = await db.query(
      'SELECT remarketing_days FROM whatsapp_settings WHERE client_id = ?',
      [clientId]
    );
    const remarketingDays = settingsRows[0]?.remarketing_days ?? 3;

    const { rows } = await db.query(
      `SELECT
         wc.id, wc.wa_id, wc.profile_name, wc.source, wc.ad_headline,
         wc.appointment_at, wc.first_seen_at,
         EXISTS(SELECT 1 FROM real_conversions rc WHERE rc.contact_id = wc.id) AS has_conversion,
         EXISTS(SELECT 1 FROM whatsapp_messages wm WHERE wm.contact_id = wc.id AND wm.direction = 'outbound') AS has_outbound,
         (SELECT MAX(sent_at) FROM whatsapp_messages wm2 WHERE wm2.contact_id = wc.id) AS last_message_at
       FROM whatsapp_contacts wc
       WHERE wc.client_id = ?
       ORDER BY wc.id DESC`,
      [clientId]
    );

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

    return res.json({ contacts });
  } catch (error) {
    console.error('Get WhatsApp kanban error:', error);
    return res.status(500).json({ error: 'Erro ao montar o funil de WhatsApp.' });
  }
}

export async function getAgenda(req, res) {
  try {
    const clientId = resolveClientId(req);
    const { date } = req.query;
    if (!clientId || !date) {
      return res.status(400).json({ error: 'clientId e date são obrigatórios.' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'date deve estar no formato YYYY-MM-DD.' });
    }

    const { rows } = await db.query(
      `SELECT id, wa_id, profile_name, appointment_at
       FROM whatsapp_contacts
       WHERE client_id = ?
         AND appointment_at >= ?::date
         AND appointment_at < (?::date + INTERVAL '1 day')
       ORDER BY appointment_at ASC`,
      [clientId, date, date]
    );

    return res.json({ appointments: rows });
  } catch (error) {
    console.error('Get WhatsApp agenda error:', error);
    return res.status(500).json({ error: 'Erro ao buscar agenda.' });
  }
}

export async function setAppointment(req, res) {
  try {
    const clientId = resolveClientId(req);
    const { contactId } = req.params;
    const { appointmentAt } = req.body;

    if (!clientId) {
      return res.status(400).json({ error: 'ID do cliente é obrigatório.' });
    }

    let parsedAppointment = null;
    if (appointmentAt) {
      const parsed = new Date(appointmentAt);
      if (Number.isNaN(parsed.getTime())) {
        return res.status(400).json({ error: 'appointmentAt inválido.' });
      }
      parsedAppointment = parsed.toISOString();
    }

    const { rows } = await db.query(
      `UPDATE whatsapp_contacts SET appointment_at = ? WHERE id = ? AND client_id = ? RETURNING id`,
      [parsedAppointment, contactId, clientId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Contato não encontrado.' });
    }

    return res.json({ message: 'Agendamento salvo com sucesso!' });
  } catch (error) {
    console.error('Set WhatsApp appointment error:', error);
    return res.status(500).json({ error: 'Erro ao salvar agendamento.' });
  }
}
```

- [ ] **Step 2: Registrar as rotas protegidas**

Em `backend/src/server.js`, adicione o import junto aos outros controllers (depois da linha `import { searchContacts, createConversion, getRoi } from './controllers/realConversionsController.js';`):

```js
import { getKanban, getAgenda, setAppointment } from './controllers/whatsappKanbanController.js';
```

E registre, depois do bloco `// Real Conversions & ROI`:

```js
// WhatsApp Kanban & Agenda
app.get('/api/whatsapp/kanban', getKanban);
app.get('/api/whatsapp/agenda', getAgenda);
app.post('/api/whatsapp/contacts/:contactId/appointment', setAppointment);
```

- [ ] **Step 3: Verificar manualmente**

Com o backend rodando e um token de admin (`$TOKEN`, mesmo processo de login usado nas tarefas anteriores do módulo de WhatsApp) e pelo menos um contato existente (use o cliente/contato real que já está em produção, ou crie um de teste via webhook como no plano anterior):

```bash
curl -s "http://localhost:5000/api/whatsapp/kanban?clientId=5" -H "Authorization: Bearer $TOKEN"
```

Expected: `{"contacts":[{"id":...,"stage":"novo_lead" (ou outra etapa válida), ...}]}`.

Pegue um `contactId` da resposta acima e marque um agendamento pra daqui a 2 dias:

```bash
CONTACT_ID=<id da resposta anterior>
FUTURE_DATE=$(node -e "console.log(new Date(Date.now() + 2*86400000).toISOString())")

curl -s -X POST "http://localhost:5000/api/whatsapp/contacts/$CONTACT_ID/appointment" \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d "{\"clientId\":5,\"appointmentAt\":\"$FUTURE_DATE\"}"
```

Expected: `{"message":"Agendamento salvo com sucesso!"}`. Confirme que o kanban agora mostra esse contato como `"stage":"agendado"`:

```bash
curl -s "http://localhost:5000/api/whatsapp/kanban?clientId=5" -H "Authorization: Bearer $TOKEN" | node -pe "JSON.parse(require('fs').readFileSync(0)).contacts.find(c => c.id === $CONTACT_ID)"
```

Expected: objeto com `stage: "agendado"` e `appointment_at` igual ao valor enviado.

Teste também o caso de um cliente sem `whatsapp_settings` (nenhuma linha na tabela) — a rota não pode quebrar, só usar o default de 3 dias:

```bash
curl -s "http://localhost:5000/api/whatsapp/kanban?clientId=999999" -H "Authorization: Bearer $TOKEN"
```

Expected: `{"contacts":[]}` (sem erro 500 — `clientId` inexistente só retorna lista vazia, igual às outras rotas de WhatsApp já existentes).

Teste a agenda do dia desse agendamento:

```bash
DATE_ONLY=$(node -e "console.log(new Date(Date.now() + 2*86400000).toISOString().slice(0,10))")
curl -s "http://localhost:5000/api/whatsapp/agenda?clientId=5&date=$DATE_ONLY" -H "Authorization: Bearer $TOKEN"
```

Expected: array contendo esse contato.

Teste o erro de validação:

```bash
curl -s -X POST "http://localhost:5000/api/whatsapp/contacts/$CONTACT_ID/appointment" \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"clientId":5,"appointmentAt":"nao-e-uma-data"}'
```

Expected: status 400, `{"error":"appointmentAt inválido."}`.

- [ ] **Step 4: Commit**

```bash
git add backend/src/controllers/whatsappKanbanController.js backend/src/server.js
git commit -m "feat(whatsapp): adiciona rotas de kanban, agenda e agendamento"
```

---

## Task 4: Frontend — aba "Funil WhatsApp" + deep link pra conversa

**Files:**
- Create: `frontend/src/pages/WhatsAppKanbanPage.jsx`
- Modify: `frontend/src/pages/WhatsAppInboxPage.jsx`
- Modify: `frontend/src/components/Sidebar.jsx`
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: `GET /api/whatsapp/kanban` (Tarefa 3).
- Produces: `WhatsAppKanbanPage({ selectedClient, onViewConversation })`. `onViewConversation(contactId)` é fornecido pelo `App.jsx` e reaproveitado pela Tarefa 5 (Agenda).

- [ ] **Step 1: Adicionar o item de menu no Sidebar**

Em `frontend/src/components/Sidebar.jsx:1-13`, adicione `Columns3` ao import de ícones:

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
  MessageCircle,
  Columns3
} from 'lucide-react';
```

E adicione o item no array `menuItems` (linhas 19-25), logo depois de `whatsapp`:

```js
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'campaigns', label: 'Campanhas', icon: BarChart3 },
    { id: 'remarketing', label: 'Remarketing / Leads', icon: Target },
    { id: 'tracking', label: 'Tracking & Atribuição', icon: Link2 },
    { id: 'whatsapp', label: 'WhatsApp & Conversões', icon: MessageCircle },
    { id: 'whatsapp-kanban', label: 'Funil WhatsApp', icon: Columns3 },
  ];
```

- [ ] **Step 2: Criar a página do Kanban**

```jsx
// frontend/src/pages/WhatsAppKanbanPage.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Columns3, ExternalLink } from 'lucide-react';

const STAGES = [
  { key: 'novo_lead', label: 'Novo Lead' },
  { key: 'em_atendimento', label: 'Em Atendimento' },
  { key: 'agendado', label: 'Agendado' },
  { key: 'nao_compareceu', label: 'Não Compareceu' },
  { key: 'compareceu', label: 'Compareceu' },
  { key: 'remarketing', label: 'Remarketing' }
];

function formatAppointment(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function WhatsAppKanbanPage({ selectedClient, onViewConversation }) {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchKanban();
  }, [selectedClient]);

  const fetchKanban = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/whatsapp/kanban', { params: { clientId: selectedClient } });
      setContacts(res.data.contacts || []);
    } catch (err) {
      console.error('Error fetching WhatsApp kanban:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Columns3 size={28} color="var(--accent-primary)" />
          Funil WhatsApp
        </h1>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          Etapa calculada automaticamente a partir das mensagens, agendamentos e vendas lançadas — nada aqui precisa ser movido manualmente.
        </p>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-muted)' }}>Carregando...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(220px, 1fr))', gap: '12px', overflowX: 'auto' }}>
          {STAGES.map((stage) => {
            const stageContacts = contacts.filter((c) => c.stage === stage.key);
            return (
              <div key={stage.key} className="glass-card" style={{ padding: '12px', minHeight: '200px' }}>
                <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.85rem', marginBottom: '10px', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{stage.label}</span>
                  <span style={{ color: 'var(--text-muted)' }}>{stageContacts.length}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {stageContacts.length === 0 && (
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Vazio</div>
                  )}
                  {stageContacts.map((c) => (
                    <div key={c.id} style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '10px', fontSize: '0.8rem' }}>
                      <div style={{ fontWeight: 600, color: '#fff' }}>{c.profile_name || c.wa_id}</div>
                      <div style={{ color: 'var(--text-muted)', marginTop: '2px' }}>
                        {c.source === 'ad' ? `📢 ${c.ad_headline || 'Veio de anúncio'}` : 'Contato direto'}
                      </div>
                      {c.appointment_at && (
                        <div style={{ color: '#a855f7', marginTop: '4px' }}>
                          📅 {formatAppointment(c.appointment_at)}
                        </div>
                      )}
                      <button
                        onClick={() => onViewConversation && onViewConversation(c.id)}
                        style={{
                          marginTop: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          background: 'none',
                          border: 'none',
                          color: 'var(--accent-primary)',
                          cursor: 'pointer',
                          fontSize: '0.75rem',
                          padding: 0
                        }}
                      >
                        <ExternalLink size={12} /> Ver conversa
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Permitir abrir uma conversa específica no `WhatsAppInboxPage`**

Em `frontend/src/pages/WhatsAppInboxPage.jsx`, mude a assinatura do componente (linha 5) de:

```js
export default function WhatsAppInboxPage({ selectedClient }) {
```

para:

```js
export default function WhatsAppInboxPage({ selectedClient, focusContactId, onFocusHandled }) {
```

E adicione um novo `useEffect`, logo depois do bloco existente (linhas 19-21):

```js
  useEffect(() => {
    if (selectedContactId) fetchMessages(selectedContactId);
  }, [selectedContactId]);

  useEffect(() => {
    if (focusContactId) {
      setSelectedContactId(focusContactId);
      if (onFocusHandled) onFocusHandled();
    }
  }, [focusContactId]);
```

- [ ] **Step 4: Ligar tudo no `App.jsx`**

Em `frontend/src/App.jsx:10`, adicione o import da nova página, logo abaixo do import de `WhatsAppInboxPage`:

```js
import WhatsAppInboxPage from './pages/WhatsAppInboxPage';
import WhatsAppKanbanPage from './pages/WhatsAppKanbanPage';
```

Dentro de `MainApp()`, adicione um novo estado logo depois de `isSidebarOpen` (linha 19):

```js
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [focusContactId, setFocusContactId] = useState(null);
```

E um handler, em qualquer ponto antes do `return` (ex: logo depois de `handleSync`):

```js
  const handleViewConversation = (contactId) => {
    setFocusContactId(contactId);
    setActiveTab('whatsapp');
  };
```

Atualize o bloco de renderização do `whatsapp` (linhas 265-267) para passar as novas props, e adicione o bloco do `whatsapp-kanban` logo depois:

```jsx
          {activeTab === 'whatsapp' && (
            <WhatsAppInboxPage
              selectedClient={selectedClientId}
              focusContactId={focusContactId}
              onFocusHandled={() => setFocusContactId(null)}
            />
          )}

          {activeTab === 'whatsapp-kanban' && (
            <WhatsAppKanbanPage selectedClient={selectedClientId} onViewConversation={handleViewConversation} />
          )}
```

- [ ] **Step 5: Verificar manualmente**

```bash
cd frontend && npx vite build
```

Expected: build limpo, sem erro (isso confirma, entre outras coisas, que o ícone `Columns3` existe na versão instalada de `lucide-react`).

Suba os dois servidores (`cd backend && node src/server.js` e `cd frontend && npx vite --port 5180`), logue como admin, clique em "Funil WhatsApp" no menu, e confirme visualmente:
- As 6 colunas aparecem, cada uma com a contagem de contatos.
- O contato que você agendou na Tarefa 3 aparece na coluna "Agendado" com o horário.
- Clicar em "Ver conversa" muda pra aba "WhatsApp & Conversões" e já abre a conversa daquele contato.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/WhatsAppKanbanPage.jsx frontend/src/pages/WhatsAppInboxPage.jsx frontend/src/components/Sidebar.jsx frontend/src/App.jsx
git commit -m "feat(whatsapp): adiciona aba de funil kanban com etapa automatica"
```

---

## Task 5: Frontend — aba "Agenda"

**Files:**
- Create: `frontend/src/pages/WhatsAppAgendaPage.jsx`
- Modify: `frontend/src/components/Sidebar.jsx`
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: `GET /api/whatsapp/agenda` (Tarefa 3), `onViewConversation` já criado na Tarefa 4.

- [ ] **Step 1: Adicionar o item de menu no Sidebar**

Em `frontend/src/components/Sidebar.jsx`, adicione `CalendarDays` ao import de ícones (mesmo bloco da Tarefa 4):

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
  MessageCircle,
  Columns3,
  CalendarDays
} from 'lucide-react';
```

E adicione o item no array `menuItems`, logo depois de `whatsapp-kanban`:

```js
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'campaigns', label: 'Campanhas', icon: BarChart3 },
    { id: 'remarketing', label: 'Remarketing / Leads', icon: Target },
    { id: 'tracking', label: 'Tracking & Atribuição', icon: Link2 },
    { id: 'whatsapp', label: 'WhatsApp & Conversões', icon: MessageCircle },
    { id: 'whatsapp-kanban', label: 'Funil WhatsApp', icon: Columns3 },
    { id: 'whatsapp-agenda', label: 'Agenda', icon: CalendarDays },
  ];
```

- [ ] **Step 2: Criar a página da Agenda**

```jsx
// frontend/src/pages/WhatsAppAgendaPage.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { CalendarDays, ExternalLink } from 'lucide-react';

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

export default function WhatsAppAgendaPage({ selectedClient, onViewConversation }) {
  const [date, setDate] = useState(todayISODate());
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAgenda();
  }, [selectedClient, date]);

  const fetchAgenda = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/whatsapp/agenda', { params: { clientId: selectedClient, date } });
      setAppointments(res.data.appointments || []);
    } catch (err) {
      console.error('Error fetching WhatsApp agenda:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <CalendarDays size={28} color="var(--accent-primary)" />
          Agenda
        </h1>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          Agendamentos marcados pelo caixa, por dia.
        </p>
      </div>

      <div className="glass-card" style={{ padding: '20px' }}>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="form-input"
          style={{ maxWidth: '220px', marginBottom: '20px' }}
        />

        {loading ? (
          <div style={{ color: 'var(--text-muted)' }}>Carregando...</div>
        ) : appointments.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Nenhum agendamento nesse dia.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {appointments.map((a) => (
              <div
                key={a.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 16px',
                  backgroundColor: 'rgba(255,255,255,0.03)',
                  borderRadius: '8px'
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, color: '#fff' }}>{a.profile_name || a.wa_id}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    {new Date(a.appointment_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <button
                  onClick={() => onViewConversation && onViewConversation(a.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent-primary)',
                    cursor: 'pointer',
                    fontSize: '0.8rem'
                  }}
                >
                  <ExternalLink size={14} /> Ver conversa
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Ligar no `App.jsx`**

Em `frontend/src/App.jsx`, adicione o import logo abaixo do import de `WhatsAppKanbanPage`:

```js
import WhatsAppKanbanPage from './pages/WhatsAppKanbanPage';
import WhatsAppAgendaPage from './pages/WhatsAppAgendaPage';
```

E o bloco de renderização, logo depois do bloco `whatsapp-kanban` da Tarefa 4:

```jsx
          {activeTab === 'whatsapp-kanban' && (
            <WhatsAppKanbanPage selectedClient={selectedClientId} onViewConversation={handleViewConversation} />
          )}

          {activeTab === 'whatsapp-agenda' && (
            <WhatsAppAgendaPage selectedClient={selectedClientId} onViewConversation={handleViewConversation} />
          )}
```

- [ ] **Step 4: Verificar manualmente**

```bash
cd frontend && npx vite build
```

Expected: build limpo, sem erro.

Com os dois servidores rodando, logue como admin, clique em "Agenda", selecione a data em que você marcou o agendamento de teste na Tarefa 3, e confirme:
- O contato aparece na lista com o horário certo.
- "Ver conversa" abre a thread correta na aba de WhatsApp.
- Trocar a data pra um dia sem agendamento mostra "Nenhum agendamento nesse dia."

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/WhatsAppAgendaPage.jsx frontend/src/components/Sidebar.jsx frontend/src/App.jsx
git commit -m "feat(whatsapp): adiciona aba de agenda por dia"
```

---

## Task 6: `/caixa` — ação "Marcar agendamento"

**Files:**
- Modify: `frontend/src/CaixaApp.jsx`

**Interfaces:**
- Consumes: `POST /api/whatsapp/contacts/:contactId/appointment` (Tarefa 3).

- [ ] **Step 1: Reescrever o arquivo com o novo passo intermediário**

O arquivo atual tem a transição `search → confirm → success`, onde `confirm` já é o formulário de venda. Substitua por `search → choose-action → (confirm-sale | confirm-appointment) → success`. Conteúdo completo do novo arquivo:

```jsx
// frontend/src/CaixaApp.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Store, Lock, Search, CheckCircle2, ArrowLeft, DollarSign, CalendarPlus } from 'lucide-react';

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
  const [appointmentDate, setAppointmentDate] = useState('');
  const [appointmentTime, setAppointmentTime] = useState('');
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
    setStep('choose-action');
  };

  const skipMatch = () => {
    setSelectedContact(null);
    setCustomerName(query);
    setPhone('');
    setStep('choose-action');
  };

  const handleConfirmSale = async (e) => {
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

  const handleConfirmAppointment = async (e) => {
    e.preventDefault();
    if (!selectedContact) return;
    setSubmitting(true);
    setError('');
    try {
      const appointmentAt = new Date(`${appointmentDate}T${appointmentTime}`).toISOString();
      await caixaApi.post(`/api/whatsapp/contacts/${selectedContact.id}/appointment`, { appointmentAt });
      setStep('success');
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao marcar agendamento.');
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
    setAppointmentDate('');
    setAppointmentTime('');
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

        {step === 'choose-action' && (
          <div>
            <button type="button" onClick={() => setStep('search')} style={{ background: 'none', border: 'none', color: '#94a3b8', marginBottom: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <ArrowLeft size={16} /> Voltar
            </button>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '8px' }}>{customerName || 'Cliente'}</h1>
            <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '20px' }}>O que você quer fazer?</p>

            <button
              type="button"
              onClick={() => setStep('confirm-sale')}
              style={{ ...buttonStyle, background: 'linear-gradient(135deg, #10b981, #059669)', marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              <DollarSign size={18} /> Lançar venda
            </button>

            {selectedContact ? (
              <button
                type="button"
                onClick={() => setStep('confirm-appointment')}
                style={{ ...buttonStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                <CalendarPlus size={18} /> Marcar agendamento
              </button>
            ) : (
              <p style={{ fontSize: '0.78rem', color: '#64748b', textAlign: 'center' }}>
                Agendamento só é possível pra contato encontrado na busca.
              </p>
            )}
          </div>
        )}

        {step === 'confirm-sale' && (
          <form onSubmit={handleConfirmSale}>
            <button type="button" onClick={() => setStep('choose-action')} style={{ background: 'none', border: 'none', color: '#94a3b8', marginBottom: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
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

        {step === 'confirm-appointment' && (
          <form onSubmit={handleConfirmAppointment}>
            <button type="button" onClick={() => setStep('choose-action')} style={{ background: 'none', border: 'none', color: '#94a3b8', marginBottom: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <ArrowLeft size={16} /> Voltar
            </button>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '16px' }}>Marcar agendamento</h1>
            <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '12px' }}>{customerName}</p>
            <input
              type="date"
              value={appointmentDate}
              onChange={(e) => setAppointmentDate(e.target.value)}
              required
              autoFocus
              style={inputStyle}
            />
            <input
              type="time"
              value={appointmentTime}
              onChange={(e) => setAppointmentTime(e.target.value)}
              required
              style={inputStyle}
            />
            {error && <p style={{ color: '#f87171', marginBottom: '12px' }}>{error}</p>}
            <button type="submit" disabled={submitting} style={buttonStyle}>
              {submitting ? 'Salvando...' : 'Confirmar agendamento'}
            </button>
          </form>
        )}

        {step === 'success' && (
          <div style={{ textAlign: 'center' }}>
            <CheckCircle2 size={56} color="#10b981" style={{ margin: '0 auto 16px' }} />
            <h1 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '20px' }}>Feito!</h1>
            <button onClick={resetForNext} style={buttonStyle}>Lançar próxima</button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar manualmente**

```bash
cd frontend && npx vite build
```

Expected: build limpo, sem erro.

Com os dois servidores rodando, acesse `http://localhost:5180/caixa` (ou a porta que o Vite usar), selecione o restaurante, entre com o PIN, busque um contato existente e confirme:
- **Caminho de venda**: selecionar contato → "Lançar venda" → preencher valor → "Feito!" aparece, e a conversão é registrada (mesmo comportamento de antes).
- **Caminho de agendamento**: selecionar contato → "Marcar agendamento" → escolher data/hora → "Feito!" aparece. Confira no Kanban (Tarefa 4) que esse contato foi pra coluna "Agendado".
- **Caminho sem match**: digite um nome que não existe, clique em "Não achei — lançar mesmo assim" → na tela de escolha, o botão "Marcar agendamento" não aparece, só o aviso de que agendamento exige contato encontrado na busca.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/CaixaApp.jsx
git commit -m "feat(whatsapp): adiciona acao de marcar agendamento no caixa"
```
