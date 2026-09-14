const API_VERSION = 'v19.0';

const CONVERSION_ACTION_TYPES = [
  'purchase',
  'offsite_conversion.fb_pixel_purchase',
  'lead',
  'onsite_conversion.lead_grouped'
];

function sumActions(actions = []) {
  return actions
    .filter((a) => CONVERSION_ACTION_TYPES.includes(a.action_type))
    .reduce((sum, a) => sum + Number(a.value || 0), 0);
}

function normalizeAccountId(adAccountId) {
  return adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
}

async function parseJsonResponse(res, fallbackErrorMessage) {
  const rawText = await res.text();
  try {
    return JSON.parse(rawText);
  } catch {
    const snippet = rawText.slice(0, 200).replace(/\s+/g, ' ').trim();
    throw new Error(
      `${fallbackErrorMessage} (HTTP ${res.status}, resposta não era JSON: ${snippet || '[vazio]'})`
    );
  }
}

async function fetchInsights(accountId, accessToken, startDate, endDate) {
  const params = new URLSearchParams({
    level: 'campaign',
    time_increment: '1',
    time_range: JSON.stringify({ since: startDate, until: endDate }),
    fields: 'campaign_id,campaign_name,spend,clicks,impressions,actions,action_values',
    access_token: accessToken
  });

  let url = `https://graph.facebook.com/${API_VERSION}/${accountId}/insights?${params.toString()}`;
  const rows = [];

  while (url) {
    const res = await fetch(url);
    const data = await parseJsonResponse(res, 'Erro ao consultar a Meta Graph API');
    if (!res.ok) {
      throw new Error(data?.error?.message || 'Erro ao consultar a Meta Graph API.');
    }

    for (const r of data.data || []) {
      rows.push({
        campaignId: r.campaign_id,
        campaignName: r.campaign_name,
        date: r.date_start,
        spend: Number(r.spend || 0),
        clicks: Number(r.clicks || 0),
        impressions: Number(r.impressions || 0),
        conversions: sumActions(r.actions),
        conversionValue: sumActions(r.action_values)
      });
    }

    url = data.paging?.next || null;
  }

  return rows;
}

async function fetchCampaignMeta(accountId, accessToken) {
  const params = new URLSearchParams({
    fields: 'id,status,daily_budget,lifetime_budget',
    access_token: accessToken,
    limit: '500'
  });

  const map = new Map();
  let url = `https://graph.facebook.com/${API_VERSION}/${accountId}/campaigns?${params.toString()}`;

  while (url) {
    const res = await fetch(url);
    const data = await parseJsonResponse(res, 'Erro ao consultar campanhas do Meta Ads');
    if (!res.ok) {
      throw new Error(data?.error?.message || 'Erro ao consultar campanhas do Meta Ads.');
    }

    for (const c of data.data || []) {
      const budgetCents = Number(c.daily_budget || c.lifetime_budget || 0);
      map.set(c.id, { status: c.status, budget: budgetCents / 100 });
    }

    url = data.paging?.next || null;
  }

  return map;
}

export async function fetchMetaAdsData(config, { startDate, endDate }) {
  const { access_token, ad_account_id } = config || {};

  if (!access_token || !ad_account_id) {
    throw new Error('Credenciais do Meta Ads incompletas.');
  }

  const accountId = normalizeAccountId(ad_account_id);

  const [insightRows, campaignMeta] = await Promise.all([
    fetchInsights(accountId, access_token, startDate, endDate),
    fetchCampaignMeta(accountId, access_token)
  ]);

  return insightRows.map((r) => {
    const meta = campaignMeta.get(r.campaignId);
    return {
      ...r,
      status: meta?.status || 'ACTIVE',
      budget: meta?.budget ?? 0
    };
  });
}
