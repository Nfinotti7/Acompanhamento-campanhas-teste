const TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const API_VERSION = 'v25';

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

export async function getAccessToken({ client_id, client_secret, refresh_token }) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id,
      client_secret,
      refresh_token,
      grant_type: 'refresh_token'
    })
  });

  const data = await parseJsonResponse(res, 'Falha ao renovar token OAuth do Google');
  if (!res.ok) {
    throw new Error(data.error_description || data.error || 'Falha ao renovar token OAuth do Google.');
  }
  return data.access_token;
}

function buildQuery(startDate, endDate) {
  return `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign_budget.amount_micros,
      metrics.cost_micros,
      metrics.clicks,
      metrics.impressions,
      metrics.conversions,
      metrics.conversions_value,
      segments.date
    FROM campaign
    WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
  `;
}

// Visitas à loja estimadas pelo Google (ação "Store visits"). Ficam em all_conversions,
// fora da coluna Conversões, e chegam com alguns dias de atraso.
function buildStoreVisitsQuery(startDate, endDate) {
  return `
    SELECT
      campaign.id,
      segments.date,
      segments.conversion_action_category,
      metrics.all_conversions
    FROM campaign
    WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
      AND segments.conversion_action_category = 'STORE_VISIT'
  `;
}

// Junta as visitas (campanha + dia) nas linhas de métricas. Dia com visita e sem linha
// de métrica é ignorado: a visita sempre vem de uma campanha que gastou no período.
export function mergeStoreVisits(rows, visitRows) {
  const visits = new Map();
  for (const v of visitRows || []) {
    const key = `${String(v.campaign?.id)}|${v.segments?.date}`;
    visits.set(key, (visits.get(key) || 0) + Number(v.metrics?.allConversions || 0));
  }
  return rows.map((r) => ({ ...r, storeVisits: visits.get(`${r.campaignId}|${r.date}`) || 0 }));
}

export async function fetchGoogleAdsData(config, { startDate, endDate }) {
  const { developer_token, client_id, client_secret, refresh_token, customer_id, login_customer_id } = config || {};

  if (!client_id || !client_secret || !refresh_token || !customer_id) {
    throw new Error('Credenciais do Google Ads incompletas.');
  }

  const accessToken = await getAccessToken({ client_id, client_secret, refresh_token });
  const cleanCustomerId = customer_id.replace(/-/g, '');

  async function search(query) {
    const results = [];
    let pageToken = null;
    do {
      const res = await fetch(
        `https://googleads.googleapis.com/${API_VERSION}/customers/${cleanCustomerId}/googleAds:search`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'developer-token': developer_token || 'unused-since-sep-2026',
            ...(login_customer_id ? { 'login-customer-id': login_customer_id.replace(/-/g, '') } : {}),
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ query, pageToken: pageToken || undefined })
        }
      );

      const data = await parseJsonResponse(res, 'Erro ao consultar a Google Ads API');
      if (!res.ok) {
        const detailErrors = data?.error?.details?.flatMap((d) => d.errors || []) || [];
        const detailMsg = detailErrors.map((e) => e.message).filter(Boolean).join(' | ');
        const msg = detailMsg || data?.error?.message || 'Erro ao consultar a Google Ads API.';
        throw new Error(msg);
      }
      results.push(...(data.results || []));
      pageToken = data.nextPageToken || null;
    } while (pageToken);
    return results;
  }

  const rows = (await search(buildQuery(startDate, endDate))).map((r) => ({
    campaignId: String(r.campaign.id),
    campaignName: r.campaign.name,
    status: r.campaign.status,
    budget: Number(r.campaignBudget?.amountMicros || 0) / 1_000_000,
    date: r.segments.date,
    spend: Number(r.metrics?.costMicros || 0) / 1_000_000,
    clicks: Number(r.metrics?.clicks || 0),
    impressions: Number(r.metrics?.impressions || 0),
    conversions: Number(r.metrics?.conversions || 0),
    conversionValue: Number(r.metrics?.conversionsValue || 0)
  }));

  // Conta sem visitas à loja (ou consulta recusada) não pode derrubar o sync.
  let visitRows = [];
  try {
    visitRows = await search(buildStoreVisitsQuery(startDate, endDate));
  } catch (err) {
    console.warn('[googleAdsSync] visitas à loja indisponíveis:', err.message);
  }
  return mergeStoreVisits(rows, visitRows);
}
