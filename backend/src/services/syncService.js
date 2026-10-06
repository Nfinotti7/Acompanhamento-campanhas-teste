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

export async function getMetaAccountMembers(accountId, deps = {}) {
  const dbImpl = deps.db || db;
  const { rows } = await dbImpl.query(`
    SELECT c.id as client_id, c.campaign_prefix, c.page_id, cr.config_json
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
    if (normalizeAccountId(rawAccountId) !== accountId) continue;

    const accessToken = typeof config?.access_token === 'string' && config.access_token.trim()
      ? config.access_token
      : null;

    members.push({
      clientId: row.client_id,
      campaignPrefix: row.campaign_prefix,
      pageId: row.page_id,
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
  const config = await getCredentialsImpl(clientId, platform);
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

  const classifiedRows = await classifyAndPrepareRows(rawRows, members, groupAccessToken, { fetchCampaignPageId });
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
  const accountIdByClient = new Map();

  // Um erro lendo/normalizando a credencial de UM cliente alvo (JSON malformado,
  // ad_account_id nao-string) nunca pode derrubar a sincronizacao dos outros.
  for (const clientId of clientIds) {
    try {
      const config = await getCredentialsImpl(clientId, 'meta');
      if (!config?.ad_account_id || !config?.access_token) {
        metaResults[clientId] = { status: 'skipped', error: 'Nenhuma credencial cadastrada para esta plataforma.' };
        continue;
      }
      accountIdByClient.set(clientId, normalizeAccountId(config.ad_account_id));
    } catch (err) {
      metaResults[clientId] = { status: 'error', error: err.message };
    }
  }

  const accountIdsTouched = new Set(accountIdByClient.values());

  // Um grupo (conta de anuncios) que falhar nunca pode derrubar a sincronizacao
  // dos clientes de outras contas -- so marca erro pros clientes alvo dessa conta.
  for (const accountId of accountIdsTouched) {
    try {
      const groupResults = await syncMetaAccountGroupImpl(accountId, startDate, endDate);
      Object.assign(metaResults, groupResults);
    } catch (err) {
      for (const [clientId, accId] of accountIdByClient) {
        if (accId === accountId) metaResults[clientId] = { status: 'error', error: err.message };
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
