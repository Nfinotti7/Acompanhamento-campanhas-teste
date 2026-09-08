import db from '../config/db.js';
import { fetchGoogleAdsData } from './googleAdsSync.js';
import { fetchMetaAdsData } from './metaAdsSync.js';

const SYNC_WINDOW_DAYS = 30;

function getDateRange(days) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (days - 1));
  const fmt = (d) => d.toISOString().split('T')[0];
  return { startDate: fmt(start), endDate: fmt(end) };
}

function getCredentials(clientId, platform) {
  const row = db
    .prepare('SELECT config_json FROM credentials WHERE client_id = ? AND platform = ?')
    .get(clientId, platform);

  if (!row) return null;
  try {
    return JSON.parse(row.config_json);
  } catch {
    return null;
  }
}

function upsertCampaign({ clientId, platform, campaignId, campaignName, status, budget }) {
  const row = db
    .prepare(
      `INSERT INTO campaigns (client_id, platform, campaign_id, campaign_name, status, budget)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(client_id, platform, campaign_id) DO UPDATE SET
         campaign_name = excluded.campaign_name,
         status = excluded.status,
         budget = excluded.budget
       RETURNING id`
    )
    .get(clientId, platform, campaignId, campaignName, status, budget);

  return row.id;
}

function upsertDailyMetric({ campaignInternalId, clientId, platform, date, spend, clicks, impressions, conversions, conversionValue }) {
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const cpc = clicks > 0 ? spend / clicks : 0;
  const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
  const roas = spend > 0 ? conversionValue / spend : 0;

  db.prepare(
    `INSERT INTO daily_metrics
       (campaign_id, client_id, platform, date, spend, clicks, impressions, conversions, conversion_value, ctr, cpc, cpm, roas)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(campaign_id, date) DO UPDATE SET
       spend = excluded.spend,
       clicks = excluded.clicks,
       impressions = excluded.impressions,
       conversions = excluded.conversions,
       conversion_value = excluded.conversion_value,
       ctr = excluded.ctr,
       cpc = excluded.cpc,
       cpm = excluded.cpm,
       roas = excluded.roas`
  ).run(campaignInternalId, clientId, platform, date, spend, clicks, impressions, conversions, conversionValue, ctr, cpc, cpm, roas);
}

function storeRows(clientId, platform, rows) {
  const byCampaign = new Map();
  for (const r of rows) {
    if (!byCampaign.has(r.campaignId)) {
      byCampaign.set(r.campaignId, { name: r.campaignName, status: r.status, budget: r.budget });
    }
  }

  const applyAll = db.transaction(() => {
    for (const [campaignId, meta] of byCampaign) {
      const internalId = upsertCampaign({
        clientId,
        platform,
        campaignId,
        campaignName: meta.name,
        status: meta.status,
        budget: meta.budget
      });

      for (const r of rows.filter((row) => row.campaignId === campaignId)) {
        upsertDailyMetric({
          campaignInternalId: internalId,
          clientId,
          platform,
          date: r.date,
          spend: r.spend,
          clicks: r.clicks,
          impressions: r.impressions,
          conversions: r.conversions,
          conversionValue: r.conversionValue
        });
      }
    }
  });

  applyAll();

  return { campaigns: byCampaign.size, rows: rows.length };
}

async function syncPlatformForClient(clientId, platform) {
  const config = getCredentials(clientId, platform);
  if (!config) {
    return { status: 'skipped', error: 'Nenhuma credencial cadastrada para esta plataforma.' };
  }

  const { startDate, endDate } = getDateRange(SYNC_WINDOW_DAYS);

  try {
    const rows =
      platform === 'google'
        ? await fetchGoogleAdsData(config, { startDate, endDate })
        : await fetchMetaAdsData(config, { startDate, endDate });

    const { campaigns, rows: rowCount } = storeRows(clientId, platform, rows);
    return { status: 'ok', campaigns, rows: rowCount };
  } catch (err) {
    return { status: 'error', error: err.message };
  }
}

export async function syncClient(clientId) {
  const google = await syncPlatformForClient(clientId, 'google');
  const meta = await syncPlatformForClient(clientId, 'meta');
  return { google, meta };
}
