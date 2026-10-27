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

// Cliente com data de início (clients.data_start_date) só tem métricas a partir dela:
// o que vem antes era de outro gestor e não entra no painel.
export function dropRowsBeforeStart(rows, startDateOf) {
  return rows.filter((r) => {
    const start = startDateOf(r);
    return !start || r.date >= start;
  });
}

async function getDataStartDate(clientId) {
  const { rows } = await db.query(
    "SELECT to_char(data_start_date, 'YYYY-MM-DD') AS start FROM clients WHERE id = ?",
    [clientId]
  );
  return rows[0]?.start || null;
}

// Tira do banco as métricas já gravadas antes da data de início de cada cliente, e as
// campanhas que ficaram sem nenhuma métrica (só rodaram com o gestor anterior).
export async function purgeMetricsBeforeStart(deps = {}) {
  const withTransaction = deps.withTransaction || db.withTransaction;
  return withTransaction(async (tx) => {
    const { rowCount: metrics } = await tx.query(`
      DELETE FROM daily_metrics dm USING clients c
      WHERE dm.client_id = c.id AND c.data_start_date IS NOT NULL
        AND dm.date < to_char(c.data_start_date, 'YYYY-MM-DD')
    `);
    const { rowCount: campaigns } = await tx.query(`
      DELETE FROM campaigns cp USING clients c
      WHERE cp.client_id = c.id AND c.data_start_date IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM daily_metrics dm WHERE dm.campaign_id = cp.id)
    `);
    return { metrics: metrics || 0, campaigns: campaigns || 0 };
  });
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

// ad_account_id pode guardar varias contas separadas por virgula (ex: um cliente
// migrando de uma conta pra outra e rodando campanhas nas duas ao mesmo tempo).
function parseAccountIds(rawAccountId) {
  if (typeof rawAccountId !== 'string') return [];
  return rawAccountId.split(',').map((s) => s.trim()).filter(Boolean).map(normalizeAccountId);
}

export async function getMetaAccountMembers(accountId, deps = {}) {
  const dbImpl = deps.db || db;
  const { rows } = await dbImpl.query(`
    SELECT c.id as client_id, c.campaign_prefix, c.page_id, cr.config_json,
      to_char(c.data_start_date, 'YYYY-MM-DD') as data_start_date
    FROM clients c
    JOIN credentials cr ON cr.client_id = c.id AND cr.platform = 'meta'
  `);

  const members = [];
  for (const row of rows) {
    // Uma credencial malformada de UM cliente do grupo nunca pode derrubar a
    // sincronizacao dos outros -- so pula esse membro.
    let config;
    try {
      config = JSON.parse(row.config_json);
    } catch {
      continue;
    }

    // Membership depende so do ad_account_id. Um cliente sem access_token ainda
    // tem que contar como membro do grupo -- senao o grupo "encolhe" pra 1
    // cliente e a classificacao por prefixo/pagina e pulada por engano,
    // reabrindo o vazamento que esta feature existe pra fechar.
    const rawAccountId = typeof config?.ad_account_id === 'string' ? config.ad_account_id : '';
    if (!rawAccountId.trim()) continue;
    if (!parseAccountIds(rawAccountId).includes(accountId)) continue;

    const accessToken = typeof config?.access_token === 'string' && config.access_token.trim()
      ? config.access_token
      : null;

    members.push({
      clientId: row.client_id,
      campaignPrefix: row.campaign_prefix,
      pageId: row.page_id,
      dataStartDate: row.data_start_date || null,
      accessToken
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

export async function storeRows(clientId, platform, rows) {
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

// Campanhas importadas por CSV (campaign_id "csv:<nome>") passam pra campanha real da API
// quando o sync do Google começa a funcionar: o histórico que só existe no CSV é mantido,
// e nos dias que a API também trouxe vale o dado da API. Nada fica duplicado.
export async function adoptCsvCampaigns(clientId, platform, deps = {}) {
  const withTransaction = deps.withTransaction || db.withTransaction;
  const match = `r.client_id = c.client_id AND r.platform = c.platform
        AND r.campaign_name = c.campaign_name AND r.campaign_id NOT LIKE 'csv:%'`;
  return withTransaction(async (tx) => {
    const { rowCount: moved } = await tx.query(
      `UPDATE daily_metrics dm SET campaign_id = r.id
       FROM campaigns c JOIN campaigns r ON ${match}
       WHERE dm.campaign_id = c.id AND c.client_id = ? AND c.platform = ?
         AND c.campaign_id LIKE 'csv:%'
         AND NOT EXISTS (SELECT 1 FROM daily_metrics x WHERE x.campaign_id = r.id AND x.date = dm.date)`,
      [clientId, platform]
    );
    const { rowCount: removed } = await tx.query(
      `DELETE FROM campaigns c USING campaigns r
       WHERE ${match} AND c.client_id = ? AND c.platform = ? AND c.campaign_id LIKE 'csv:%'`,
      [clientId, platform]
    );
    return { moved: moved || 0, removed: removed || 0 };
  });
}

async function clearStaleOwnership(tx, platform, campaignId, targetClientId) {
  // Uma campanha ja sincronizada sob um dono fica presa a esse dono pra sempre
  // se a linha antiga nunca for removida quando a classificacao muda (reclassificação
  // pra outro cliente, ou de 'ok' pra escondida e vice-versa). Sem isso o vazamento
  // que esta feature existe pra fechar continua visivel pra sempre em dados ja sincronizados.
  if (targetClientId === null) {
    await tx.query(
      'DELETE FROM campaigns WHERE platform = ? AND campaign_id = ? AND client_id IS NOT NULL',
      [platform, campaignId]
    );
  } else {
    await tx.query(
      'DELETE FROM campaigns WHERE platform = ? AND campaign_id = ? AND client_id IS DISTINCT FROM ?',
      [platform, campaignId, targetClientId]
    );
  }
}

export async function storeClassifiedRows(platform, classifiedRows, deps = {}) {
  const withTransaction = deps.withTransaction || db.withTransaction;
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

  await withTransaction(async (tx) => {
    for (const [campaignId, meta] of byCampaign) {
      await clearStaleOwnership(tx, platform, campaignId, meta.classification === 'ok' ? meta.clientId : null);

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

async function syncPlatformForClient(clientId, platform, startDate, endDate, deps = {}) {
  const getCredentialsImpl = deps.getCredentials || getCredentials;
  const getDataStartDateImpl = deps.getDataStartDate || getDataStartDate;
  const config = await getCredentialsImpl(clientId, platform);
  if (!config) {
    return { status: 'skipped', error: 'Nenhuma credencial cadastrada para esta plataforma.' };
  }

  try {
    const clientStart = await getDataStartDateImpl(clientId);
    const rows = dropRowsBeforeStart(await fetchGoogleAdsData(config, { startDate, endDate }), () => clientStart);
    const { campaigns, rows: rowCount } = await storeRows(clientId, platform, rows);
    // Falha ao juntar o histórico do CSV não invalida o sync que já gravou.
    await (deps.adoptCsvCampaigns || adoptCsvCampaigns)(clientId, platform)
      .catch((err) => console.error(`Sync [client ${clientId}]: não juntou campanhas importadas por CSV:`, err.message));
    return { status: 'ok', campaigns, rows: rowCount };
  } catch (err) {
    return { status: 'error', error: err.message };
  }
}

export async function syncMetaAccountGroup(accountId, startDate, endDate, deps = {}) {
  const getMetaAccountMembersImpl = deps.getMetaAccountMembers || getMetaAccountMembers;
  const members = await getMetaAccountMembersImpl(accountId);
  if (members.length === 0) return {};

  const tokenHolders = members.filter((m) => m.accessToken);
  if (tokenHolders.length === 0) {
    const results = {};
    for (const m of members) {
      results[m.clientId] = { status: 'error', error: 'Nenhum cliente desta conta de anúncios tem access_token cadastrado.' };
    }
    return results;
  }

  const sortedByAge = [...tokenHolders].sort((a, b) => a.clientId - b.clientId);
  const groupAccessToken = sortedByAge[0].accessToken;

  let rawRows;
  try {
    rawRows = await fetchMetaAdsData({ access_token: groupAccessToken, ad_account_id: accountId }, { startDate, endDate });
  } catch (err) {
    const results = {};
    for (const m of members) results[m.clientId] = { status: 'error', error: err.message };
    return results;
  }

  const startByClient = new Map(members.map((m) => [m.clientId, m.dataStartDate]));
  const classifiedRows = dropRowsBeforeStart(
    await classifyAndPrepareRows(rawRows, members, groupAccessToken, { fetchCampaignPageId }),
    (r) => (r.classification === 'ok' ? startByClient.get(r.resolvedClientId) : null)
  );
  const perClientCounts = await storeClassifiedRows('meta', classifiedRows);

  const results = {};
  for (const m of members) {
    const counts = perClientCounts.get(m.clientId) || { campaigns: 0, rows: 0 };
    results[m.clientId] = { status: 'ok', campaigns: counts.campaigns, rows: counts.rows };
  }
  return results;
}

export async function syncClients(clientIds, deps = {}) {
  const getCredentialsImpl = deps.getCredentials || getCredentials;
  const syncMetaAccountGroupImpl = deps.syncMetaAccountGroup || syncMetaAccountGroup;
  const { startDate, endDate } = getDateRange(SYNC_WINDOW_DAYS);

  const googleResults = {};
  for (const clientId of clientIds) {
    googleResults[clientId] = await syncPlatformForClient(clientId, 'google', startDate, endDate, { getCredentials: getCredentialsImpl });
  }

  const metaResults = {};
  const accountIdsByClient = new Map(); // clientId -> array de ad_account_ids normalizados

  // Um erro lendo/normalizando a credencial de UM cliente alvo (JSON malformado,
  // ad_account_id nao-string) nunca pode derrubar a sincronizacao dos outros.
  for (const clientId of clientIds) {
    try {
      const config = await getCredentialsImpl(clientId, 'meta');
      if (!config?.ad_account_id || !config?.access_token) {
        metaResults[clientId] = { status: 'skipped', error: 'Nenhuma credencial cadastrada para esta plataforma.' };
        continue;
      }
      const ids = parseAccountIds(config.ad_account_id);
      if (ids.length === 0) {
        metaResults[clientId] = { status: 'skipped', error: 'Nenhuma credencial cadastrada para esta plataforma.' };
        continue;
      }
      accountIdsByClient.set(clientId, ids);
    } catch (err) {
      metaResults[clientId] = { status: 'error', error: err.message };
    }
  }

  const accountIdsTouched = new Set();
  for (const ids of accountIdsByClient.values()) {
    for (const id of ids) accountIdsTouched.add(id);
  }

  // Um cliente com mais de uma conta (ex: migrando de uma pra outra) tem seu
  // resultado somado entre os grupos -- nunca sobrescrito pelo ultimo grupo processado.
  const mergeMetaResult = (clientId, incoming) => {
    const current = metaResults[clientId];
    if (!current) {
      metaResults[clientId] = incoming;
      return;
    }
    if (current.status === 'error') return; // erro ja registrado nesse cliente permanece
    if (incoming.status === 'error' || current.status !== 'ok' || incoming.status !== 'ok') {
      metaResults[clientId] = incoming;
      return;
    }
    metaResults[clientId] = {
      status: 'ok',
      campaigns: current.campaigns + incoming.campaigns,
      rows: current.rows + incoming.rows
    };
  };

  // Um grupo (conta de anuncios) que falhar nunca pode derrubar a sincronizacao
  // dos clientes de outras contas -- so marca erro pros clientes alvo dessa conta.
  for (const accountId of accountIdsTouched) {
    try {
      const groupResults = await syncMetaAccountGroupImpl(accountId, startDate, endDate);
      for (const [clientId, result] of Object.entries(groupResults)) {
        mergeMetaResult(Number(clientId), result);
      }
    } catch (err) {
      for (const [clientId, ids] of accountIdsByClient) {
        if (ids.includes(accountId)) mergeMetaResult(clientId, { status: 'error', error: err.message });
      }
    }
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
