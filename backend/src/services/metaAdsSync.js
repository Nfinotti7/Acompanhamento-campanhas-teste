const API_VERSION = 'v19.0';

const CONVERSION_ACTION_TYPES = [
  'purchase',
  'offsite_conversion.fb_pixel_purchase',
  'lead',
  'onsite_conversion.lead_grouped',
  'onsite_conversion.messaging_conversation_started_7d'
];

function sumActions(actions = []) {
  return actions
    .filter((a) => CONVERSION_ACTION_TYPES.includes(a.action_type))
    .reduce((sum, a) => sum + Number(a.value || 0), 0);
}

export function normalizeAccountId(adAccountId) {
  const trimmed = String(adAccountId ?? '').trim();
  return trimmed.startsWith('act_') ? trimmed : `act_${trimmed}`;
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
    fields: 'campaign_id,campaign_name,spend,clicks,impressions,reach,actions,action_values',
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
        reach: Number(r.reach || 0),
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

// Conjuntos de anúncio por campanha: quantos existem e quantos estão rodando. Campanha ativa
// com todos os conjuntos pausados não entrega nada, e o status da campanha sozinho não mostra.
async function fetchAdsetActivity(accountId, accessToken, fetchImpl = fetch) {
  const params = new URLSearchParams({
    fields: 'id,campaign_id,effective_status',
    access_token: accessToken,
    limit: '500'
  });
  const activity = new Map();
  let url = `https://graph.facebook.com/${API_VERSION}/${accountId}/adsets?${params.toString()}`;
  while (url) {
    const res = await fetchImpl(url);
    const data = await parseJsonResponse(res, 'Erro ao consultar conjuntos de anúncios do Meta Ads');
    if (!res.ok) throw new Error(data?.error?.message || 'Erro ao consultar conjuntos de anúncios do Meta Ads.');
    for (const a of data.data || []) {
      const entry = activity.get(a.campaign_id) || { total: 0, active: 0 };
      entry.total += 1;
      if (a.effective_status === 'ACTIVE') entry.active += 1;
      activity.set(a.campaign_id, entry);
    }
    url = data.paging?.next || null;
  }
  return activity;
}

// Campanha "ACTIVE" cujos conjuntos estão todos parados conta como pausada.
export function resolveCampaignStatus(status, adsets) {
  if (status === 'ACTIVE' && adsets && adsets.total > 0 && adsets.active === 0) return 'PAUSED';
  return status;
}

// Status de TODAS as campanhas da conta (não só as que tiveram gasto no período). Sem isso,
// uma campanha pausada deixa de ter dados, o status nunca é atualizado e ela segue como
// "ativa" no banco (alerta falso de "sem entrega").
export async function fetchCampaignStatuses(accountId, accessToken, deps = {}) {
  const campaigns = await (deps.fetchCampaignMeta || fetchCampaignMeta)(accountId, accessToken);
  let adsets = new Map();
  try {
    adsets = await (deps.fetchAdsetActivity || fetchAdsetActivity)(accountId, accessToken);
  } catch {
    // Sem o detalhe dos conjuntos, vale o status da campanha.
  }
  return new Map([...campaigns].map(([id, c]) => [id, resolveCampaignStatus(c.status, adsets.get(id))]));
}

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
