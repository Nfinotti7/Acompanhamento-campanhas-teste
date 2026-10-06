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
