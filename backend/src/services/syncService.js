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

async function syncPlatformForClient(clientId, platform) {
  const config = await getCredentials(clientId, platform);
  if (!config) {
    return { status: 'skipped', error: 'Nenhuma credencial cadastrada para esta plataforma.' };
  }

  const { startDate, endDate } = getDateRange(SYNC_WINDOW_DAYS);

  try {
    const rows =
      platform === 'google'
        ? await fetchGoogleAdsData(config, { startDate, endDate })
        : await fetchMetaAdsData(config, { startDate, endDate });

    const { campaigns, rows: rowCount } = await storeRows(clientId, platform, rows);
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
