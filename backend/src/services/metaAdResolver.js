import db from '../config/db.js';

const API_VERSION = 'v19.0';

// Nome de campanha/conjunto/anúncio pode ser editado no Gerenciador -- refaz a consulta
// depois de uma semana. Antes disso usa o cache (vários contatos vêm do mesmo anúncio).
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function fromCacheRow(row) {
  return {
    adId: row.ad_id,
    adName: row.ad_name,
    adsetId: row.adset_id,
    adsetName: row.adset_name,
    campaignId: row.campaign_id,
    campaignName: row.campaign_name,
    accountId: row.account_id,
    accountName: row.account_name
  };
}

async function getAccessToken(dbImpl, clientId) {
  const { rows } = await dbImpl.query(
    `SELECT config_json FROM credentials WHERE client_id = ? AND platform = 'meta'`,
    [clientId]
  );
  if (rows.length === 0) return null;
  try {
    return JSON.parse(rows[0].config_json).access_token || null;
  } catch {
    return null;
  }
}

async function graphGet(fetchImpl, path, fields, accessToken) {
  const params = new URLSearchParams({ fields, access_token: accessToken });
  const res = await fetchImpl(`https://graph.facebook.com/${API_VERSION}/${path}?${params.toString()}`);
  const body = await res.json();
  if (!res.ok || body?.error) {
    throw new Error(body?.error?.message || `HTTP ${res.status}`);
  }
  return body;
}

// Resolve o ad_id que vem no "referral" do WhatsApp (clique em anúncio) em
// conta/campanha/conjunto/anúncio, via Marketing API, com o token Meta do cliente.
// Nunca lança: o referral pode ser de um post impulsionado (não é ad id), o token pode
// não ter acesso à conta, etc. -- a conversa continua sendo "Meta Ads", só sem os nomes.
export async function resolveAd({ adId, clientId, db: dbImpl = db, fetchImpl = fetch, now = Date.now }) {
  if (!adId) return null;

  const { rows: cachedRows } = await dbImpl.query(`SELECT * FROM meta_ad_cache WHERE ad_id = ?`, [adId]);
  const cached = cachedRows[0];
  if (cached && now() - new Date(cached.fetched_at).getTime() < CACHE_TTL_MS) {
    return fromCacheRow(cached);
  }

  const accessToken = await getAccessToken(dbImpl, clientId);
  if (!accessToken) return cached ? fromCacheRow(cached) : null;

  try {
    const ad = await graphGet(fetchImpl, adId, 'name,account_id,adset{id,name},campaign{id,name}', accessToken);
    let accountName = null;
    if (ad.account_id) {
      try {
        accountName = (await graphGet(fetchImpl, `act_${ad.account_id}`, 'name', accessToken)).name || null;
      } catch {
        // nome da conta é só cosmético -- segue sem ele
      }
    }

    const resolved = {
      adId,
      adName: ad.name || null,
      adsetId: ad.adset?.id || null,
      adsetName: ad.adset?.name || null,
      campaignId: ad.campaign?.id || null,
      campaignName: ad.campaign?.name || null,
      accountId: ad.account_id || null,
      accountName
    };

    await dbImpl.query(
      `INSERT INTO meta_ad_cache (ad_id, ad_name, adset_id, adset_name, campaign_id, campaign_name, account_id, account_name, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (ad_id) DO UPDATE SET
         ad_name = excluded.ad_name, adset_id = excluded.adset_id, adset_name = excluded.adset_name,
         campaign_id = excluded.campaign_id, campaign_name = excluded.campaign_name,
         account_id = excluded.account_id, account_name = excluded.account_name, fetched_at = excluded.fetched_at`,
      [resolved.adId, resolved.adName, resolved.adsetId, resolved.adsetName, resolved.campaignId, resolved.campaignName, resolved.accountId, resolved.accountName, new Date(now()).toISOString()]
    );
    return resolved;
  } catch (error) {
    console.error(`Não foi possível resolver o anúncio ${adId} (cliente ${clientId}):`, error.message);
    return cached ? fromCacheRow(cached) : null;
  }
}

// Resolve os anúncios de contatos que chegaram por anúncio e ainda não têm nome de
// campanha no cache (contatos antigos, ou falha anterior). Roda na subida do servidor.
export async function resolveMissingAds({ db: dbImpl = db, fetchImpl = fetch } = {}) {
  const { rows } = await dbImpl.query(
    `SELECT DISTINCT wc.ad_id, wc.client_id
     FROM whatsapp_contacts wc
     LEFT JOIN meta_ad_cache c ON c.ad_id = wc.ad_id
     WHERE wc.ad_id IS NOT NULL AND c.ad_id IS NULL`
  );
  let resolved = 0;
  for (const row of rows) {
    if (await resolveAd({ adId: row.ad_id, clientId: row.client_id, db: dbImpl, fetchImpl })) resolved++;
  }
  return resolved;
}
