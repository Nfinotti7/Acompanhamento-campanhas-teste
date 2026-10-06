# Atribuição de Campanhas em Conta de Anúncio Compartilhada — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separar corretamente as campanhas Meta de clientes que compartilham a mesma conta de anúncios (por prefixo de nome + validação opcional de página), sem alterar em nada o comportamento de clientes com conta própria.

**Architecture:** A sincronização Meta deixa de rodar "um cliente por vez" e passa a agrupar os clientes-alvo pela conta de anúncios que eles usam (lida de `credentials.config_json`). Contas com um único cliente seguem o caminho de hoje, inalterado. Contas com mais de um cliente buscam os dados uma vez só e classificam cada campanha por prefixo de nome (`clients.campaign_prefix`), com uma checagem opcional de página do Facebook (`clients.page_id`) contra o criativo do anúncio. Campanhas sem dono claro ficam gravadas sem `client_id`, marcadas com o motivo, e somem de qualquer dashboard porque toda consulta já filtra por `client_id`. A lógica de classificação fica isolada em módulos puros/testáveis, separados da orquestração de banco e das chamadas de rede.

**Tech Stack:** Node.js 18+ (ESM), Express, `pg` (Postgres) — nenhuma dependência nova. Testes com o runner nativo (`node --test`) para a lógica pura de classificação, seguindo o mesmo padrão já estabelecido no projeto (ver `backend/src/utils/whatsappRoi.js` e seus testes).

**Spec:** `docs/superpowers/specs/2026-10-05-shared-ad-account-attribution-design.md`

## Global Constraints

- Nenhuma tabela é recriada — só `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` e um
  `ALTER TABLE campaigns ALTER COLUMN client_id DROP NOT NULL`, dentro do `initDb()` que já
  roda esse tipo de migração aditiva hoje.
- A sincronização do Google Ads não muda em nenhuma linha de lógica.
- Clientes cuja conta de anúncios Meta não é compartilhada com mais ninguém continuam
  sincronizando exatamente como hoje — sem checagem de prefixo, sem chamada extra de API.
- Campanhas `inconsistent`/`unclassified` ficam gravadas (pra consulta manual) mas sem
  `client_id` e sem métricas diárias — nenhuma tela existe pra revisá-las agora.
- `DATABASE_URL` aponta pro Postgres de produção — não existe banco de dev separado. As
  migrações aditivas são seguras de rodar contra produção (mesmo padrão já usado pelo
  `reach` em `daily_metrics`).
- Hoje só o cliente **Recreio** (id confirmado em produção) existe de fato no sistema com
  credenciais Meta reais configuradas. Alma, Giulí e Malibu ainda não foram cadastrados —
  por isso, o caminho "conta compartilhada entre 2+ clientes" não é testável ponta-a-ponta
  contra a Meta real dentro deste plano; a confiança nele vem dos testes automatizados com
  dados falsos (Tarefas 2 e 4), e a verificação real acontece quando esses clientes forem
  cadastrados com credenciais de verdade.

## Review Focus

- **Prefixo no meio do nome, não no início** — uma campanha chamada "Promo RECREIO - Teste"
  não deve bater com o prefixo `"RECREIO -"` (comparação é por início da string, não por
  conter em qualquer lugar). Testado na Tarefa 2 e na Tarefa 4.
- **Falha ao buscar a página do anúncio na Meta (API fora do ar, anúncio apagado)** — o
  comportamento seguro é tratar como inconsistente (esconder), nunca liberar a campanha por
  padrão só porque não deu pra confirmar. Testado na Tarefa 4.
- **Cliente do grupo sem `campaign_prefix` cadastrado** — nunca deve absorver campanha de
  outro cliente do mesmo grupo nem travar a sincronização dos demais. Testado na Tarefa 4.
- **Credencial Meta malformada de um cliente do grupo** (JSON inválido, falta
  `access_token` ou `ad_account_id`) — não pode derrubar a sincronização dos outros
  clientes do mesmo grupo nem de clientes de outras contas. Testado na Tarefa 5.
- **Regressão no caminho de hoje (conta com um cliente só)** — depois da mudança, sincronizar
  o Recreio (único cliente real configurado hoje) tem que continuar produzindo o mesmo
  resultado de antes, sem nenhuma campanha sumir ou ficar `unclassified` por engano.
  Verificado manualmente contra produção na Tarefa 5.

---

## Task 1: Colunas novas no banco de dados

**Files:**
- Modify: `backend/src/config/db.js`

**Interfaces:**
- Produces: `clients.campaign_prefix`, `clients.page_id` (ambos `TEXT`, nullable);
  `campaigns.client_id` passa a aceitar `NULL`; `campaigns.classification` (`TEXT`, default
  `'ok'`). Todas as tarefas seguintes dependem disso.

- [ ] **Step 1: Adicionar as migrações aditivas**

Em `backend/src/config/db.js`, logo depois da linha já existente
`await query(\`ALTER TABLE daily_metrics ADD COLUMN IF NOT EXISTS reach INTEGER DEFAULT 0\`);`
e antes de `await seedData();`, adicione:

```js
  await query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS campaign_prefix TEXT`);
  await query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS page_id TEXT`);
  await query(`ALTER TABLE campaigns ALTER COLUMN client_id DROP NOT NULL`);
  await query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS classification TEXT NOT NULL DEFAULT 'ok'`);
```

- [ ] **Step 2: Verificar manualmente**

```bash
cd backend && node src/server.js
```

Expected: log `🚀 Backend Ad Campaign Tracker rodando na porta 5000` sem erro. Confirme as
colunas novas:

```bash
node -r dotenv/config -e "import('./src/config/db.js').then(async ({default: db}) => { const {rows} = await db.query(\"SELECT column_name, is_nullable FROM information_schema.columns WHERE (table_name = 'clients' AND column_name IN ('campaign_prefix','page_id')) OR (table_name = 'campaigns' AND column_name IN ('client_id','classification'))\"); console.log(rows); process.exit(0); })"
```

Expected: `client_id` com `is_nullable: 'YES'`, `classification` presente, `campaign_prefix`
e `page_id` presentes.

- [ ] **Step 3: Commit**

```bash
git add backend/src/config/db.js
git commit -m "feat(campanhas): adiciona colunas de atribuicao por conta compartilhada"
```

---

## Task 2: Classificador puro por prefixo de campanha

**Files:**
- Create: `backend/src/utils/campaignClassifier.js`
- Test: `backend/src/utils/campaignClassifier.test.js`

**Interfaces:**
- Produces: `classifyCampaignByPrefix(campaignName: string, candidates: Array<{clientId: number, campaignPrefix: string|null}>) => { status: 'matched'|'unclassified', clientId: number|null }`.
  Usado pela Tarefa 4.

- [ ] **Step 1: Escrever o teste que falha**

```js
// backend/src/utils/campaignClassifier.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyCampaignByPrefix } from './campaignClassifier.js';

test('bate com o prefixo correto quando ele esta no inicio do nome', () => {
  const result = classifyCampaignByPrefix('RECREIO - Happy Hour', [
    { clientId: 5, campaignPrefix: 'RECREIO -' },
    { clientId: 6, campaignPrefix: 'MALIBU -' }
  ]);
  assert.deepEqual(result, { status: 'matched', clientId: 5 });
});

test('nao bate se o prefixo nao estiver no inicio', () => {
  const result = classifyCampaignByPrefix('Promo RECREIO - Teste', [
    { clientId: 5, campaignPrefix: 'RECREIO -' }
  ]);
  assert.deepEqual(result, { status: 'unclassified', clientId: null });
});

test('comparacao e exata, sensivel a maiuscula/minuscula', () => {
  const result = classifyCampaignByPrefix('recreio - happy hour', [
    { clientId: 5, campaignPrefix: 'RECREIO -' }
  ]);
  assert.deepEqual(result, { status: 'unclassified', clientId: null });
});

test('candidato com campaignPrefix nulo nunca bate com nada', () => {
  const result = classifyCampaignByPrefix('RECREIO - Happy Hour', [
    { clientId: 5, campaignPrefix: null }
  ]);
  assert.deepEqual(result, { status: 'unclassified', clientId: null });
});

test('nenhum candidato bate: unclassified', () => {
  const result = classifyCampaignByPrefix('Campanha Qualquer', [
    { clientId: 5, campaignPrefix: 'RECREIO -' },
    { clientId: 6, campaignPrefix: 'MALIBU -' }
  ]);
  assert.deepEqual(result, { status: 'unclassified', clientId: null });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd backend && node --test src/utils/campaignClassifier.test.js`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

```js
// backend/src/utils/campaignClassifier.js
export function classifyCampaignByPrefix(campaignName, candidates) {
  const matches = candidates.filter((c) => c.campaignPrefix && campaignName.startsWith(c.campaignPrefix));

  if (matches.length === 1) {
    return { status: 'matched', clientId: matches[0].clientId };
  }

  return { status: 'unclassified', clientId: null };
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd backend && node --test src/utils/campaignClassifier.test.js`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add backend/src/utils/campaignClassifier.js backend/src/utils/campaignClassifier.test.js
git commit -m "feat(campanhas): adiciona classificador puro por prefixo de campanha"
```

---

## Task 3: Buscar a página do anúncio na Meta (validação de consistência)

**Files:**
- Modify: `backend/src/services/metaAdsSync.js`
- Test: `backend/src/services/metaAdsSync.test.js`

**Interfaces:**
- Produces: `normalizeAccountId(adAccountId: string) => string` (exportada, já existia como
  função local), `fetchCampaignPageId(campaignId: string, accessToken: string, fetchImpl?) => Promise<string|null>`.
  Usadas pela Tarefa 5 e Tarefa 4 respectivamente.

- [ ] **Step 1: Escrever o teste que falha**

```js
// backend/src/services/metaAdsSync.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchCampaignPageId, normalizeAccountId } from './metaAdsSync.js';

test('fetchCampaignPageId extrai o page id do effective_object_story_id', async () => {
  const fakeFetch = async (url) => {
    assert.ok(url.includes('campaign123/ads'));
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: [{ creative: { effective_object_story_id: '987654321_111222333' } }] })
    };
  };
  const pageId = await fetchCampaignPageId('campaign123', 'token-abc', fakeFetch);
  assert.equal(pageId, '987654321');
});

test('fetchCampaignPageId retorna null quando a campanha nao tem anuncio com criativo', async () => {
  const fakeFetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ data: [] }) });
  const pageId = await fetchCampaignPageId('campaign123', 'token-abc', fakeFetch);
  assert.equal(pageId, null);
});

test('fetchCampaignPageId lanca erro quando a API responde com falha', async () => {
  const fakeFetch = async () => ({ ok: false, status: 400, text: async () => JSON.stringify({ error: { message: 'Invalid campaign' } }) });
  await assert.rejects(() => fetchCampaignPageId('campaign123', 'token-abc', fakeFetch), /Invalid campaign/);
});

test('normalizeAccountId adiciona o prefixo act_ quando falta', () => {
  assert.equal(normalizeAccountId('123456'), 'act_123456');
  assert.equal(normalizeAccountId('act_123456'), 'act_123456');
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd backend && node --test src/services/metaAdsSync.test.js`
Expected: FAIL — `fetchCampaignPageId` não existe, `normalizeAccountId` não é exportada.

- [ ] **Step 3: Implementar**

Em `backend/src/services/metaAdsSync.js`, mude a declaração de `normalizeAccountId` de:

```js
function normalizeAccountId(adAccountId) {
```

para:

```js
export function normalizeAccountId(adAccountId) {
```

E adicione a função nova, logo depois de `fetchCampaignMeta`:

```js
export async function fetchCampaignPageId(campaignId, accessToken, fetchImpl = fetch) {
  const params = new URLSearchParams({
    fields: 'creative{effective_object_story_id}',
    limit: '1',
    access_token: accessToken
  });

  const url = `https://graph.facebook.com/${API_VERSION}/${campaignId}/ads?${params.toString()}`;
  const res = await fetchImpl(url);
  const data = await parseJsonResponse(res, 'Erro ao consultar anúncios da campanha');

  if (!res.ok) {
    throw new Error(data?.error?.message || 'Erro ao consultar anúncios da campanha.');
  }

  const storyId = data?.data?.[0]?.creative?.effective_object_story_id;
  if (!storyId) return null;

  return storyId.split('_')[0];
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd backend && node --test src/services/metaAdsSync.test.js`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/metaAdsSync.js backend/src/services/metaAdsSync.test.js
git commit -m "feat(campanhas): busca a pagina do criativo do anuncio na Meta"
```

---

## Task 4: Classificação de uma conta compartilhada (prefixo + página)

**Files:**
- Create: `backend/src/services/metaAccountSync.js`
- Test: `backend/src/services/metaAccountSync.test.js`

**Interfaces:**
- Consumes: `classifyCampaignByPrefix` da Tarefa 2.
- Produces: `classifyAndPrepareRows(rawRows: Array<MetaRow>, accountMembers: Array<{clientId, campaignPrefix, pageId, accessToken}>, groupAccessToken: string, deps: {fetchCampaignPageId}) => Promise<Array<MetaRow & {resolvedClientId: number|null, classification: 'ok'|'inconsistent'|'unclassified'}>>`.
  `MetaRow` é o formato já retornado por `fetchMetaAdsData` (campaignId, campaignName, date,
  spend, clicks, impressions, reach, conversions, conversionValue, status, budget). Usado
  pela Tarefa 5.

- [ ] **Step 1: Escrever o teste que falha**

```js
// backend/src/services/metaAccountSync.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyAndPrepareRows } from './metaAccountSync.js';

const baseRow = (overrides) => ({
  campaignId: 'c1', campaignName: '', date: '2026-10-01', spend: 10, clicks: 1,
  impressions: 100, reach: 90, conversions: 0, conversionValue: 0, status: 'ACTIVE', budget: 50,
  ...overrides
});

test('conta com 1 cliente so: atribui tudo direto, sem checar prefixo nem pagina', async () => {
  const rows = [baseRow({ campaignName: 'Qualquer Nome Aqui' })];
  const members = [{ clientId: 5, campaignPrefix: null, pageId: null, accessToken: 'tok' }];
  const result = await classifyAndPrepareRows(rows, members, 'tok', {
    fetchCampaignPageId: async () => { throw new Error('não deveria ser chamado'); }
  });
  assert.equal(result[0].resolvedClientId, 5);
  assert.equal(result[0].classification, 'ok');
});

test('conta compartilhada: cada campanha vai pro cliente do prefixo certo', async () => {
  const rows = [
    baseRow({ campaignId: 'c1', campaignName: 'RECREIO - Happy Hour' }),
    baseRow({ campaignId: 'c2', campaignName: 'MALIBU - Sushi Night' })
  ];
  const members = [
    { clientId: 5, campaignPrefix: 'RECREIO -', pageId: null, accessToken: 'tok' },
    { clientId: 6, campaignPrefix: 'MALIBU -', pageId: null, accessToken: 'tok' }
  ];
  const result = await classifyAndPrepareRows(rows, members, 'tok', { fetchCampaignPageId: async () => null });
  assert.equal(result.find((r) => r.campaignId === 'c1').resolvedClientId, 5);
  assert.equal(result.find((r) => r.campaignId === 'c2').resolvedClientId, 6);
});

test('prefixo no meio do nome, nao no inicio, fica unclassified', async () => {
  const rows = [baseRow({ campaignName: 'Promo RECREIO - Teste' })];
  const members = [{ clientId: 5, campaignPrefix: 'RECREIO -', pageId: null, accessToken: 'tok' }];
  const result = await classifyAndPrepareRows(rows, members, 'tok', { fetchCampaignPageId: async () => null });
  assert.equal(result[0].resolvedClientId, null);
  assert.equal(result[0].classification, 'unclassified');
});

test('campanha sem prefixo reconhecido fica unclassified', async () => {
  const rows = [baseRow({ campaignName: 'Campanha Sem Prefixo' })];
  const members = [{ clientId: 5, campaignPrefix: 'RECREIO -', pageId: null, accessToken: 'tok' }];
  const result = await classifyAndPrepareRows(rows, members, 'tok', { fetchCampaignPageId: async () => null });
  assert.equal(result[0].classification, 'unclassified');
  assert.equal(result[0].resolvedClientId, null);
});

test('cliente sem campaign_prefix cadastrado nunca absorve campanha de outro', async () => {
  const rows = [baseRow({ campaignName: 'RECREIO - Happy Hour' })];
  const members = [
    { clientId: 5, campaignPrefix: 'RECREIO -', pageId: null, accessToken: 'tok' },
    { clientId: 6, campaignPrefix: null, pageId: null, accessToken: 'tok' }
  ];
  const result = await classifyAndPrepareRows(rows, members, 'tok', { fetchCampaignPageId: async () => null });
  assert.equal(result[0].resolvedClientId, 5);
});

test('page_id configurado e bate: classificacao fica ok', async () => {
  const rows = [baseRow({ campaignName: 'RECREIO - Happy Hour' })];
  const members = [{ clientId: 5, campaignPrefix: 'RECREIO -', pageId: 'PAGE_123', accessToken: 'tok' }];
  const result = await classifyAndPrepareRows(rows, members, 'tok', { fetchCampaignPageId: async () => 'PAGE_123' });
  assert.equal(result[0].classification, 'ok');
  assert.equal(result[0].resolvedClientId, 5);
});

test('page_id configurado e nao bate: fica inconsistente e sem dono', async () => {
  const rows = [baseRow({ campaignName: 'RECREIO - Happy Hour' })];
  const members = [{ clientId: 5, campaignPrefix: 'RECREIO -', pageId: 'PAGE_123', accessToken: 'tok' }];
  const result = await classifyAndPrepareRows(rows, members, 'tok', { fetchCampaignPageId: async () => 'PAGE_999' });
  assert.equal(result[0].classification, 'inconsistent');
  assert.equal(result[0].resolvedClientId, null);
});

test('falha ao buscar a pagina trata como inconsistente, nunca libera por seguranca', async () => {
  const rows = [baseRow({ campaignName: 'RECREIO - Happy Hour' })];
  const members = [{ clientId: 5, campaignPrefix: 'RECREIO -', pageId: 'PAGE_123', accessToken: 'tok' }];
  const result = await classifyAndPrepareRows(rows, members, 'tok', {
    fetchCampaignPageId: async () => { throw new Error('Meta API fora do ar'); }
  });
  assert.equal(result[0].classification, 'inconsistent');
  assert.equal(result[0].resolvedClientId, null);
});

test('mesma campanha em datas diferentes so busca a pagina uma vez (cache)', async () => {
  const rows = [
    baseRow({ campaignId: 'c1', campaignName: 'RECREIO - Happy Hour', date: '2026-10-01' }),
    baseRow({ campaignId: 'c1', campaignName: 'RECREIO - Happy Hour', date: '2026-10-02' })
  ];
  const members = [{ clientId: 5, campaignPrefix: 'RECREIO -', pageId: 'PAGE_123', accessToken: 'tok' }];
  let callCount = 0;
  const result = await classifyAndPrepareRows(rows, members, 'tok', {
    fetchCampaignPageId: async () => { callCount += 1; return 'PAGE_123'; }
  });
  assert.equal(callCount, 1);
  assert.equal(result.length, 2);
  assert.ok(result.every((r) => r.classification === 'ok'));
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd backend && node --test src/services/metaAccountSync.test.js`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

```js
// backend/src/services/metaAccountSync.js
import { classifyCampaignByPrefix } from '../utils/campaignClassifier.js';

export async function classifyAndPrepareRows(rawRows, accountMembers, groupAccessToken, deps) {
  const { fetchCampaignPageId } = deps;

  if (accountMembers.length <= 1) {
    const clientId = accountMembers[0]?.clientId ?? null;
    return rawRows.map((r) => ({
      ...r,
      resolvedClientId: clientId,
      classification: clientId ? 'ok' : 'unclassified'
    }));
  }

  const candidates = accountMembers.map((m) => ({ clientId: m.clientId, campaignPrefix: m.campaignPrefix }));
  const pageIdCache = new Map();
  const classifiedRows = [];

  for (const row of rawRows) {
    const match = classifyCampaignByPrefix(row.campaignName, candidates);

    if (match.status === 'unclassified') {
      classifiedRows.push({ ...row, resolvedClientId: null, classification: 'unclassified' });
      continue;
    }

    const member = accountMembers.find((m) => m.clientId === match.clientId);

    if (!member.pageId) {
      classifiedRows.push({ ...row, resolvedClientId: member.clientId, classification: 'ok' });
      continue;
    }

    let actualPageId;
    if (pageIdCache.has(row.campaignId)) {
      actualPageId = pageIdCache.get(row.campaignId);
    } else {
      try {
        actualPageId = await fetchCampaignPageId(row.campaignId, groupAccessToken);
      } catch {
        actualPageId = null;
      }
      pageIdCache.set(row.campaignId, actualPageId);
    }

    if (actualPageId && actualPageId === member.pageId) {
      classifiedRows.push({ ...row, resolvedClientId: member.clientId, classification: 'ok' });
    } else {
      classifiedRows.push({ ...row, resolvedClientId: null, classification: 'inconsistent' });
    }
  }

  return classifiedRows;
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd backend && node --test src/services/metaAccountSync.test.js`
Expected: PASS (9 testes).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/metaAccountSync.js backend/src/services/metaAccountSync.test.js
git commit -m "feat(campanhas): classifica campanhas de conta compartilhada por prefixo e pagina"
```

---

## Task 5: Reescrever a sincronização pra agrupar por conta de anúncios

**Files:**
- Modify: `backend/src/services/syncService.js`
- Modify: `backend/src/controllers/campaignController.js`
- Test: `backend/src/services/syncService.test.js`

**Interfaces:**
- Consumes: `fetchCampaignPageId`, `normalizeAccountId` (Tarefa 3), `classifyAndPrepareRows`
  (Tarefa 4).
- Produces: `syncClients(clientIds: number[]) => Promise<Array<{clientId, google, meta}>>`
  (substitui o uso direto de `syncClient` dentro do loop do controller). `syncClient(clientId)`
  continua exportada, agora implementada como um wrapper de `syncClients([clientId])`, pra
  nada mais que importe essa função precise mudar. `parseMetaCredentialsConfig(configJsonString: string) => object|null`
  (exportada, pura) — garante que uma credencial malformada de **um** cliente do grupo
  nunca derruba a sincronização dos outros.

- [ ] **Step 1: Escrever o teste que falha, para a parte pura de parsing de credenciais**

```js
// backend/src/services/syncService.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMetaCredentialsConfig } from './syncService.js';

test('parseMetaCredentialsConfig retorna null para JSON invalido', () => {
  assert.equal(parseMetaCredentialsConfig('{invalido'), null);
});

test('parseMetaCredentialsConfig retorna null quando falta ad_account_id', () => {
  assert.equal(parseMetaCredentialsConfig(JSON.stringify({ access_token: 'tok' })), null);
});

test('parseMetaCredentialsConfig retorna null quando falta access_token', () => {
  assert.equal(parseMetaCredentialsConfig(JSON.stringify({ ad_account_id: 'act_1' })), null);
});

test('parseMetaCredentialsConfig retorna a config quando valida', () => {
  const result = parseMetaCredentialsConfig(JSON.stringify({ ad_account_id: 'act_1', access_token: 'tok' }));
  assert.deepEqual(result, { ad_account_id: 'act_1', access_token: 'tok' });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd backend && node --test src/services/syncService.test.js`
Expected: FAIL — `parseMetaCredentialsConfig` não é exportada ainda (o arquivo atual nem
tem essa função).

- [ ] **Step 3: Reescrever `backend/src/services/syncService.js` por completo**

```js
// backend/src/services/syncService.js
import db from '../config/db.js';
import { fetchGoogleAdsData } from './googleAdsSync.js';
import { fetchMetaAdsData, fetchCampaignPageId, normalizeAccountId } from './metaAdsSync.js';
import { classifyAndPrepareRows } from './metaAccountSync.js';

const SYNC_WINDOW_DAYS = 30;

function getDateRange(days) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (days - 1));
  const fmt = (d) => d.toISOString().split('T')[0];
  return { startDate: fmt(start), endDate: fmt(end) };
}

async function getCredentials(clientId, platform) {
  const { rows } = await db.query(
    'SELECT config_json FROM credentials WHERE client_id = ? AND platform = ?',
    [clientId, platform]
  );

  if (!rows[0]) return null;
  try {
    return JSON.parse(rows[0].config_json);
  } catch {
    return null;
  }
}

export function parseMetaCredentialsConfig(configJsonString) {
  try {
    const config = JSON.parse(configJsonString);
    if (!config?.ad_account_id || !config?.access_token) return null;
    return config;
  } catch {
    return null;
  }
}

async function getMetaAccountMembers(accountId) {
  const { rows } = await db.query(`
    SELECT c.id as client_id, c.campaign_prefix, c.page_id, cr.config_json
    FROM clients c
    JOIN credentials cr ON cr.client_id = c.id AND cr.platform = 'meta'
  `);

  const members = [];
  for (const row of rows) {
    // Uma credencial malformada de UM cliente do grupo nunca pode derrubar a
    // sincronizacao dos outros -- so pula esse membro.
    const config = parseMetaCredentialsConfig(row.config_json);
    if (!config) continue;
    if (normalizeAccountId(config.ad_account_id) !== accountId) continue;

    members.push({
      clientId: row.client_id,
      campaignPrefix: row.campaign_prefix,
      pageId: row.page_id,
      accessToken: config.access_token
    });
  }
  return members;
}

async function upsertCampaign(tx, { clientId, platform, campaignId, campaignName, status, budget }) {
  const { rows } = await tx.query(
    `INSERT INTO campaigns (client_id, platform, campaign_id, campaign_name, status, budget)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(client_id, platform, campaign_id) DO UPDATE SET
       campaign_name = excluded.campaign_name,
       status = excluded.status,
       budget = excluded.budget
     RETURNING id`,
    [clientId, platform, campaignId, campaignName, status, budget]
  );

  return rows[0].id;
}

async function upsertHiddenCampaign(tx, { platform, campaignId, campaignName, status, budget, classification }) {
  await tx.query(
    'DELETE FROM campaigns WHERE platform = ? AND campaign_id = ? AND client_id IS NULL',
    [platform, campaignId]
  );

  const { rows } = await tx.query(
    `INSERT INTO campaigns (client_id, platform, campaign_id, campaign_name, status, budget, classification)
     VALUES (NULL, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [platform, campaignId, campaignName, status, budget, classification]
  );

  return rows[0].id;
}

async function upsertDailyMetric(tx, { campaignInternalId, clientId, platform, date, spend, clicks, impressions, reach, conversions, conversionValue }) {
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const cpc = clicks > 0 ? spend / clicks : 0;
  const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
  const roas = spend > 0 ? conversionValue / spend : 0;

  await tx.query(
    `INSERT INTO daily_metrics
       (campaign_id, client_id, platform, date, spend, clicks, impressions, reach, conversions, conversion_value, ctr, cpc, cpm, roas)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(campaign_id, date) DO UPDATE SET
       spend = excluded.spend,
       clicks = excluded.clicks,
       impressions = excluded.impressions,
       reach = excluded.reach,
       conversions = excluded.conversions,
       conversion_value = excluded.conversion_value,
       ctr = excluded.ctr,
       cpc = excluded.cpc,
       cpm = excluded.cpm,
       roas = excluded.roas`,
    [campaignInternalId, clientId, platform, date, spend, clicks, impressions, reach || 0, conversions, conversionValue, ctr, cpc, cpm, roas]
  );
}

async function storeRows(clientId, platform, rows) {
  const byCampaign = new Map();
  for (const r of rows) {
    if (!byCampaign.has(r.campaignId)) {
      byCampaign.set(r.campaignId, { name: r.campaignName, status: r.status, budget: r.budget });
    }
  }

  await db.withTransaction(async (tx) => {
    for (const [campaignId, meta] of byCampaign) {
      const internalId = await upsertCampaign(tx, {
        clientId,
        platform,
        campaignId,
        campaignName: meta.name,
        status: meta.status,
        budget: meta.budget
      });

      for (const r of rows.filter((row) => row.campaignId === campaignId)) {
        await upsertDailyMetric(tx, {
          campaignInternalId: internalId,
          clientId,
          platform,
          date: r.date,
          spend: r.spend,
          clicks: r.clicks,
          impressions: r.impressions,
          reach: r.reach,
          conversions: r.conversions,
          conversionValue: r.conversionValue
        });
      }
    }
  });

  return { campaigns: byCampaign.size, rows: rows.length };
}

async function storeClassifiedRows(platform, classifiedRows) {
  const byCampaign = new Map();
  for (const r of classifiedRows) {
    if (!byCampaign.has(r.campaignId)) {
      byCampaign.set(r.campaignId, {
        name: r.campaignName,
        status: r.status,
        budget: r.budget,
        clientId: r.resolvedClientId,
        classification: r.classification
      });
    }
  }

  const perClientCounts = new Map();

  await db.withTransaction(async (tx) => {
    for (const [campaignId, meta] of byCampaign) {
      let internalId;
      if (meta.classification === 'ok') {
        internalId = await upsertCampaign(tx, {
          clientId: meta.clientId,
          platform,
          campaignId,
          campaignName: meta.name,
          status: meta.status,
          budget: meta.budget
        });
      } else {
        internalId = await upsertHiddenCampaign(tx, {
          platform,
          campaignId,
          campaignName: meta.name,
          status: meta.status,
          budget: meta.budget,
          classification: meta.classification
        });
      }

      if (meta.classification !== 'ok') continue; // sem metricas diarias pra campanha escondida

      const campaignRows = classifiedRows.filter((row) => row.campaignId === campaignId);
      for (const r of campaignRows) {
        await upsertDailyMetric(tx, {
          campaignInternalId: internalId,
          clientId: meta.clientId,
          platform,
          date: r.date,
          spend: r.spend,
          clicks: r.clicks,
          impressions: r.impressions,
          reach: r.reach,
          conversions: r.conversions,
          conversionValue: r.conversionValue
        });
      }

      if (!perClientCounts.has(meta.clientId)) {
        perClientCounts.set(meta.clientId, { campaigns: 0, rows: 0 });
      }
      const current = perClientCounts.get(meta.clientId);
      current.campaigns += 1;
      current.rows += campaignRows.length;
    }
  });

  return perClientCounts;
}

async function syncPlatformForClient(clientId, platform, startDate, endDate) {
  const config = await getCredentials(clientId, platform);
  if (!config) {
    return { status: 'skipped', error: 'Nenhuma credencial cadastrada para esta plataforma.' };
  }

  try {
    const rows = await fetchGoogleAdsData(config, { startDate, endDate });
    const { campaigns, rows: rowCount } = await storeRows(clientId, platform, rows);
    return { status: 'ok', campaigns, rows: rowCount };
  } catch (err) {
    return { status: 'error', error: err.message };
  }
}

async function syncMetaAccountGroup(accountId, startDate, endDate) {
  const members = await getMetaAccountMembers(accountId);
  if (members.length === 0) return {};

  const sortedByAge = [...members].sort((a, b) => a.clientId - b.clientId);
  const groupAccessToken = sortedByAge[0].accessToken;

  let rawRows;
  try {
    rawRows = await fetchMetaAdsData({ access_token: groupAccessToken, ad_account_id: accountId }, { startDate, endDate });
  } catch (err) {
    const results = {};
    for (const m of members) results[m.clientId] = { status: 'error', error: err.message };
    return results;
  }

  const classifiedRows = await classifyAndPrepareRows(rawRows, members, groupAccessToken, { fetchCampaignPageId });
  const perClientCounts = await storeClassifiedRows('meta', classifiedRows);

  const results = {};
  for (const m of members) {
    const counts = perClientCounts.get(m.clientId) || { campaigns: 0, rows: 0 };
    results[m.clientId] = { status: 'ok', campaigns: counts.campaigns, rows: counts.rows };
  }
  return results;
}

export async function syncClients(clientIds) {
  const { startDate, endDate } = getDateRange(SYNC_WINDOW_DAYS);

  const googleResults = {};
  for (const clientId of clientIds) {
    googleResults[clientId] = await syncPlatformForClient(clientId, 'google', startDate, endDate);
  }

  const metaResults = {};
  const accountIdsTouched = new Set();

  for (const clientId of clientIds) {
    const config = await getCredentials(clientId, 'meta');
    if (!config?.ad_account_id || !config?.access_token) {
      metaResults[clientId] = { status: 'skipped', error: 'Nenhuma credencial cadastrada para esta plataforma.' };
      continue;
    }
    accountIdsTouched.add(normalizeAccountId(config.ad_account_id));
  }

  for (const accountId of accountIdsTouched) {
    const groupResults = await syncMetaAccountGroup(accountId, startDate, endDate);
    Object.assign(metaResults, groupResults);
  }

  return clientIds.map((clientId) => ({
    clientId,
    google: googleResults[clientId],
    meta: metaResults[clientId] || { status: 'skipped', error: 'Nenhuma credencial cadastrada para esta plataforma.' }
  }));
}

export async function syncClient(clientId) {
  const [result] = await syncClients([clientId]);
  return { google: result.google, meta: result.meta };
}
```

- [ ] **Step 4: Rodar o teste da Step 1 de novo e confirmar que passa**

Run: `cd backend && node --test src/services/syncService.test.js`
Expected: PASS (4 testes).

- [ ] **Step 5: Atualizar o controller pra sincronizar todos os clientes-alvo de uma vez**

Em `backend/src/controllers/campaignController.js`, troque o import:

```js
import { syncClient } from '../services/syncService.js';
```

por:

```js
import { syncClients } from '../services/syncService.js';
```

E dentro de `syncCampaigns`, troque o laço:

```js
    const results = [];
    for (const client of targets) {
      const { google, meta } = await syncClient(client.id);
      results.push({ clientId: client.id, clientName: client.name, google, meta });
    }
```

por:

```js
    const syncResults = await syncClients(targets.map((t) => t.id));
    const results = syncResults.map((r) => {
      const client = targets.find((t) => t.id === r.clientId);
      return { clientId: r.clientId, clientName: client.name, google: r.google, meta: r.meta };
    });
```

**Por que essa troca importa:** se o controller continuasse chamando `syncClient` um de
cada vez (em vez de `syncClients` com a lista inteira), sincronizar o Recreio sozinho nunca
"enxergaria" o Malibu durante o agrupamento — e a campanha do Malibu ficaria presa como se
fosse de conta própria do Recreio. Passar a lista inteira de uma vez é o que permite o
agrupamento por conta de anúncios funcionar corretamente mesmo sincronizando um cliente
isolado, porque `getMetaAccountMembers` sempre consulta **todos** os clientes do sistema
que apontam pra aquela conta, não só os que foram pedidos nessa chamada.

- [ ] **Step 6: Rodar todos os testes automatizados**

```bash
cd backend && node --test
```

Expected: todos os testes (das Tarefas 2, 3, 4 e desta tarefa inclusas) passam.

- [ ] **Step 7: Verificar manualmente contra produção — regressão no caminho de hoje**

Com o backend rodando e um token de admin (`$TOKEN`, como já usado em verificações
anteriores desta sessão), dispare a sincronização do Recreio (único cliente real
configurado hoje, com conta própria — não compartilhada):

```bash
curl -s -X POST http://localhost:5000/api/campaigns/sync \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"clientId": 5}'
```

Expected: resposta com `meta.status: "ok"` e a mesma contagem de campanhas de antes da
mudança (confira contra o número de campanhas que já apareciam no Dashboard do Recreio
antes desta tarefa — não deve ter mudado). Confirme também que nenhuma campanha ficou
escondida por engano:

```bash
node -r dotenv/config -e "import('./src/config/db.js').then(async ({default: db}) => { const {rows} = await db.query(\"SELECT classification, COUNT(*) FROM campaigns WHERE client_id = 5 OR (client_id IS NULL) GROUP BY classification\"); console.log(rows); process.exit(0); })"
```

Expected: só linhas com `classification: 'ok'` vinculadas ao Recreio — nenhuma
`unclassified`/`inconsistent` aparecendo (o Recreio hoje está sozinho na conta dele, então
o caminho de grupo-de-1 deve ter sido usado, sem classificação nenhuma).

- [ ] **Step 8: Commit**

```bash
git add backend/src/services/syncService.js backend/src/services/syncService.test.js backend/src/controllers/campaignController.js
git commit -m "feat(campanhas): agrupa sincronizacao Meta por conta de anuncios compartilhada"
```

---

## Task 6: Edição de cliente (prefixo e Page ID)

**Files:**
- Modify: `backend/src/controllers/clientController.js`

**Interfaces:**
- Produces: `updateClient(req, res)` — handler de `PUT /api/clients/:id`. `createClient`
  passa a aceitar também `campaign_prefix` e `page_id`. Usado pela Tarefa 7 (rota) e Tarefa
  8 (frontend).

- [ ] **Step 1: Atualizar `createClient` pra aceitar os campos novos**

Em `backend/src/controllers/clientController.js`, troque:

```js
export async function createClient(req, res) {
  try {
    const { name, company, logo_url, clientUserEmail, clientUserPassword } = req.body;

    if (!name || !company) {
      return res.status(400).json({ error: 'Nome e empresa são obrigatórios.' });
    }

    const { rows } = await db.query(
      'INSERT INTO clients (name, company, logo_url) VALUES (?, ?, ?) RETURNING id',
      [name, company, logo_url || null]
    );
```

por:

```js
export async function createClient(req, res) {
  try {
    const { name, company, logo_url, campaign_prefix, page_id, clientUserEmail, clientUserPassword } = req.body;

    if (!name || !company) {
      return res.status(400).json({ error: 'Nome e empresa são obrigatórios.' });
    }

    const { rows } = await db.query(
      'INSERT INTO clients (name, company, logo_url, campaign_prefix, page_id) VALUES (?, ?, ?, ?, ?) RETURNING id',
      [name, company, logo_url || null, campaign_prefix || null, page_id || null]
    );
```

- [ ] **Step 2: Adicionar `updateClient`**

Logo depois da função `createClient` (antes de `deleteClient`), adicione:

```js
export async function updateClient(req, res) {
  try {
    const clientId = req.params.id;
    const { name, company, logo_url, campaign_prefix, page_id } = req.body;

    if (!name || !company) {
      return res.status(400).json({ error: 'Nome e empresa são obrigatórios.' });
    }

    const { rows } = await db.query('SELECT id FROM clients WHERE id = ?', [clientId]);
    if (!rows[0]) {
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }

    await db.query(
      'UPDATE clients SET name = ?, company = ?, logo_url = ?, campaign_prefix = ?, page_id = ? WHERE id = ?',
      [name, company, logo_url || null, campaign_prefix || null, page_id || null, clientId]
    );

    return res.json({ message: 'Cliente atualizado com sucesso!' });
  } catch (error) {
    console.error('Update client error:', error);
    return res.status(500).json({ error: 'Erro ao atualizar cliente.' });
  }
}
```

- [ ] **Step 3: Verificar manualmente**

Com o backend rodando e `$TOKEN` de admin:

```bash
curl -s -X PUT http://localhost:5000/api/clients/5 \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"Recreio","company":"Recreio","campaign_prefix":"RECREIO -","page_id":"1282809294918568"}'
```

Expected: `{"message":"Cliente atualizado com sucesso!"}`. Confirme:

```bash
curl -s http://localhost:5000/api/clients -H "Authorization: Bearer $TOKEN"
```

Expected: o Recreio aparece com `campaign_prefix: "RECREIO -"` e `page_id:
"1282809294918568"` na resposta.

- [ ] **Step 4: Commit**

```bash
git add backend/src/controllers/clientController.js
git commit -m "feat(clientes): adiciona edicao de cliente com prefixo e page id"
```

---

## Task 7: Rota de edição de cliente

**Files:**
- Modify: `backend/src/server.js`

**Interfaces:**
- Consumes: `updateClient` da Tarefa 6.
- Produces: rota `PUT /api/clients/:id` (admin). Consumida pela Tarefa 8.

- [ ] **Step 1: Registrar a rota**

Em `backend/src/server.js`, troque o import:

```js
import { listClients, createClient, deleteClient } from './controllers/clientController.js';
```

por:

```js
import { listClients, createClient, updateClient, deleteClient } from './controllers/clientController.js';
```

E adicione a rota, logo depois de `app.post('/api/clients', requireAdmin, createClient);`:

```js
app.put('/api/clients/:id', requireAdmin, updateClient);
```

- [ ] **Step 2: Verificar manualmente**

Repita a chamada `curl -X PUT .../api/clients/5` da Tarefa 6 — se já funcionou lá, essa
rota já está registrada corretamente (a Tarefa 6 só conseguiu passar no `Step 3` dela se
essa rota já estivesse de pé; confirme reiniciando o backend do zero e repetindo a chamada
pra ter certeza que não é só o processo antigo ainda rodando em memória):

```bash
cd backend && node src/server.js
```

(em outro terminal/depois de reiniciar)

```bash
curl -s -w "\nHTTP_STATUS:%{http_code}\n" -X PUT http://localhost:5000/api/clients/5 \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"Recreio","company":"Recreio","campaign_prefix":"RECREIO -","page_id":"1282809294918568"}'
```

Expected: `HTTP_STATUS:200`.

- [ ] **Step 3: Commit**

```bash
git add backend/src/server.js
git commit -m "feat(clientes): registra rota de edicao de cliente"
```

---

## Task 8: Frontend — editar cliente (prefixo e Page ID)

**Files:**
- Modify: `frontend/src/pages/ClientsPage.jsx`

**Interfaces:**
- Consumes: `PUT /api/clients/:id` (Tarefa 7), `POST /api/clients` (já existente, agora
  aceitando `campaign_prefix`/`page_id` conforme Tarefa 6).

- [ ] **Step 1: Reescrever `frontend/src/pages/ClientsPage.jsx`**

```jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Users, PlusCircle, Building2, ShieldCheck, Mail, Lock, CheckCircle2, Trash2, Pencil } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const EMPTY_FORM = {
  name: '',
  company: '',
  logo_url: '',
  campaign_prefix: '',
  page_id: '',
  clientUserEmail: '',
  clientUserPassword: ''
};

export default function ClientsPage() {
  const { user, setSelectedClientId } = useAuth();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [message, setMessage] = useState(null);

  const [formData, setFormData] = useState(EMPTY_FORM);

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/clients');
      setClients(res.data.clients || []);
    } catch (err) {
      console.error('Error fetching clients:', err);
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    setEditingClient(null);
    setFormData(EMPTY_FORM);
    setShowModal(true);
  };

  const openEditModal = (client) => {
    setEditingClient(client);
    setFormData({
      name: client.name || '',
      company: client.company || '',
      logo_url: client.logo_url || '',
      campaign_prefix: client.campaign_prefix || '',
      page_id: client.page_id || '',
      clientUserEmail: '',
      clientUserPassword: ''
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingClient) {
        const res = await axios.put(`/api/clients/${editingClient.id}`, formData);
        setMessage(res.data.message);
      } else {
        const res = await axios.post('/api/clients', formData);
        setMessage(res.data.message);
      }
      setShowModal(false);
      setEditingClient(null);
      setFormData(EMPTY_FORM);
      fetchClients();
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao salvar cliente.');
    }
  };

  const handleDelete = async (client) => {
    const confirmed = window.confirm(
      `Remover "${client.name}" (${client.company})? Isso apaga campanhas, métricas, leads e credenciais desse cliente. Essa ação não pode ser desfeita.`
    );
    if (!confirmed) return;

    try {
      const res = await axios.delete(`/api/clients/${client.id}`);
      setMessage(res.data.message);
      fetchClients();
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao remover cliente.');
    }
  };

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Users size={28} color="var(--accent-primary)" />
            Gestão de Clientes da Agência
          </h1>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            Cadastre novos clientes e forneça acessos de portal exclusivos
          </p>
        </div>

        <button onClick={openCreateModal} className="btn btn-primary">
          <PlusCircle size={16} />
          <span>Cadastrar Novo Cliente</span>
        </button>
      </div>

      {message && (
        <div style={{
          padding: '14px',
          borderRadius: 'var(--radius-sm)',
          marginBottom: '20px',
          backgroundColor: 'rgba(16, 185, 129, 0.15)',
          color: '#34d399',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          fontWeight: 600
        }}>
          {message}
        </div>
      )}

      {/* Clients Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
        {clients.map((c) => (
          <div key={c.id} className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  backgroundColor: 'rgba(99, 102, 241, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: '1.2rem',
                  color: 'var(--accent-primary)'
                }}>
                  {c.name.charAt(0)}
                </div>

                <div>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fff' }}>
                    {c.name}
                  </h3>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    {c.company}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', fontSize: '0.85rem' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block' }}>Campanhas</span>
                  <strong style={{ color: '#fff', fontSize: '1.1rem' }}>{c.total_campaigns || 0}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block' }}>Investimento Total</span>
                  <strong style={{ color: '#10b981', fontSize: '1.1rem' }}>
                    R$ {(c.total_spend || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </strong>
                </div>
              </div>

              {c.campaign_prefix && (
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
                  Prefixo de campanha: <strong style={{ color: 'var(--text-secondary)' }}>{c.campaign_prefix}</strong>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setSelectedClientId(c.id)}
                className="btn btn-secondary"
                style={{ flex: 1, fontSize: '0.85rem' }}
              >
                Visualizar Dashboard Deste Cliente
              </button>
              <button
                onClick={() => openEditModal(c)}
                className="btn btn-secondary"
                title="Editar cliente"
              >
                <Pencil size={16} />
              </button>
              <button
                onClick={() => handleDelete(c)}
                className="btn btn-secondary"
                title="Remover cliente"
                style={{ color: '#f87171', borderColor: 'rgba(239, 68, 68, 0.3)' }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal Create/Edit Client */}
      {showModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.75)',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: '100px 16px 32px',
          overflowY: 'auto',
          zIndex: 9000
        }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '480px', padding: '32px', backgroundColor: 'var(--bg-card)' }}>
            <h3 style={{ fontSize: '1.3rem', fontWeight: 700, color: '#fff', marginBottom: '16px' }}>
              {editingClient ? 'Editar Cliente' : 'Cadastrar Novo Cliente'}
            </h3>

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Nome do Contato / Responsável</label>
                <input
                  type="text"
                  required
                  className="form-input"
                  placeholder="Ex: Carlos Andrade"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Nome da Empresa / Marca</label>
                <input
                  type="text"
                  required
                  className="form-input"
                  placeholder="Ex: Acme Corp E-commerce"
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                />
              </div>

              <hr style={{ borderColor: 'var(--border-color)', margin: '20px 0' }} />

              <h4 style={{ fontSize: '0.95rem', color: 'var(--accent-primary)', marginBottom: '12px' }}>
                Conta de Anúncios Compartilhada (opcional)
              </h4>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
                Só preencha se este cliente divide a mesma conta de anúncios Meta com outro
                cliente. O prefixo precisa bater exatamente com o início do nome das
                campanhas deste cliente, incluindo o traço.
              </p>

              <div className="form-group">
                <label className="form-label">Prefixo de Campanha</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Ex: RECREIO -"
                  value={formData.campaign_prefix}
                  onChange={(e) => setFormData({ ...formData, campaign_prefix: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Page ID do Facebook (checagem extra, opcional)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Ex: 1282809294918568"
                  value={formData.page_id}
                  onChange={(e) => setFormData({ ...formData, page_id: e.target.value })}
                />
              </div>

              {!editingClient && (
                <>
                  <hr style={{ borderColor: 'var(--border-color)', margin: '20px 0' }} />

                  <h4 style={{ fontSize: '0.95rem', color: 'var(--accent-primary)', marginBottom: '12px' }}>
                    Credenciais de Acesso do Cliente (Portal)
                  </h4>

                  <div className="form-group">
                    <label className="form-label">E-mail de Login do Cliente</label>
                    <input
                      type="email"
                      className="form-input"
                      placeholder="cliente@empresa.com"
                      value={formData.clientUserEmail}
                      onChange={(e) => setFormData({ ...formData, clientUserEmail: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Senha Inicial</label>
                    <input
                      type="password"
                      className="form-input"
                      placeholder="Defina uma senha segura"
                      value={formData.clientUserPassword}
                      onChange={(e) => setFormData({ ...formData, clientUserPassword: e.target.value })}
                    />
                  </div>
                </>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                <button
                  type="button"
                  onClick={() => { setShowModal(false); setEditingClient(null); }}
                  className="btn btn-secondary"
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingClient ? 'Salvar Alterações' : 'Criar Cliente & Acesso'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verificar manualmente**

```bash
cd frontend && npx vite build
```

Expected: build limpo.

Suba os dois servidores, logue como admin, vá em **Clientes**, e confirme visualmente:
- O card do Recreio mostra "Prefixo de campanha: RECREIO -" (valor salvo na Tarefa 6).
- Clicar no ícone de lápis abre o modal **já preenchido** com os dados do Recreio,
  incluindo prefixo e Page ID, sem o bloco de "Credenciais de Acesso do Cliente" (esse
  bloco só aparece no cadastro de cliente novo).
- Alterar o prefixo e salvar mostra "Cliente atualizado com sucesso!" e o card reflete o
  novo valor.
- Clicar em "Cadastrar Novo Cliente" abre o modal vazio, com o bloco de credenciais de
  volta, confirmando que os dois modos (criar/editar) não vazam estado um pro outro.
- O modal continua aparecendo com folga da barra superior (correção já feita antes nesta
  mesma tela).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/ClientsPage.jsx
git commit -m "feat(clientes): adiciona edicao de cliente com prefixo de campanha e page id"
```

---

## Resumo de cobertura da spec

| Requisito da spec | Tarefa |
|---|---|
| Colunas novas, nenhuma tabela recriada | 1 |
| Separação por prefixo de nome de campanha | 2, 4 |
| Validação opcional de Page ID (1 anúncio por campanha) | 3, 4 |
| Campanhas inconsistentes/não classificadas ficam gravadas sem dono, sem tela de revisão | 1, 5 |
| Conta com 1 cliente só continua igual a hoje (zero regressão) | 4, 5 |
| Edição de cliente (lacuna encontrada na spec) | 6, 7, 8 |
| Google Ads não muda | 5 (nenhuma linha do caminho Google é alterada) |
| Grupo corretamente formado mesmo sincronizando 1 cliente isolado | 5 (Step 2, explicado) |
