// Conversão offline pro Google Ads: quando uma venda é lançada pra um contato que veio de
// um Link Rastreável com gclid, a venda real é enviada ao Google (uploadClickConversions)
// e a otimização das campanhas passa a aprender com ela.
//
// Precisa, por cliente: credenciais do Google Ads salvas, uma "ação de conversão" do tipo
// Importação de cliques criada na conta do Google Ads, e a chave ligada em "Links e
// Conversões". Sem isso nada é enviado. Cada envio fica registrado em conversion_events
// (platform 'google').
import db from '../config/db.js';
import { getAccessToken, API_VERSION } from './googleAdsSync.js';

// "2026-11-03 14:05:09+00:00", o formato que o Google exige.
export function googleDateTime(date) {
  const d = new Date(date);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}+00:00`;
}

// Aceita o ID numérico da ação ou o nome completo (customers/123/conversionActions/456).
export function conversionActionResource(value, customerId) {
  const v = String(value || '').trim();
  if (/^customers\/\d+\/conversionActions\/\d+$/.test(v)) return v;
  const id = v.replace(/\D/g, '');
  const customer = String(customerId || '').replace(/\D/g, '');
  return id && customer ? `customers/${customer}/conversionActions/${id}` : null;
}

export function buildClickConversion({ gclid, conversionAction, time, value, orderId }) {
  return {
    gclid,
    conversionAction,
    conversionDateTime: googleDateTime(time),
    conversionValue: Number(value) || 0,
    currencyCode: 'BRL',
    orderId
  };
}

export async function uploadClickConversion(config, conversion, deps = {}) {
  const doFetch = deps.fetch || fetch;
  const token = await (deps.getAccessToken || getAccessToken)(config);
  const customerId = String(config.customer_id).replace(/\D/g, '');
  const res = await doFetch(`https://googleads.googleapis.com/${API_VERSION}/customers/${customerId}:uploadClickConversions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'developer-token': config.developer_token || 'unused-since-sep-2026',
      ...(config.login_customer_id ? { 'login-customer-id': String(config.login_customer_id).replace(/\D/g, '') } : {}),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ conversions: [conversion], partialFailureEnabled: true })
  });
  const raw = await res.text();
  let data = {};
  try { data = JSON.parse(raw); } catch { /* resposta sem JSON: tratada abaixo */ }
  if (!res.ok) throw new Error(data.error?.message || `Google Ads respondeu HTTP ${res.status}`);
  // Com falha parcial o HTTP é 200 e o erro vem dentro da resposta.
  if (data.partialFailureError?.message) throw new Error(data.partialFailureError.message);
  return data;
}

async function loadSetup(dbImpl, clientId, contactId) {
  const { rows } = await dbImpl.query(
    `SELECT cs.google_enabled, cs.google_conversion_action, cr.config_json,
            tc.gclid
     FROM capi_settings cs
     LEFT JOIN credentials cr ON cr.client_id = cs.client_id AND cr.platform = 'google'
     LEFT JOIN whatsapp_contacts wc ON wc.id = ? AND wc.client_id = cs.client_id
     LEFT JOIN tracking_clicks tc ON tc.id = wc.tracking_click_id
     WHERE cs.client_id = ?`,
    [contactId, clientId]
  );
  const row = rows[0];
  if (!row?.google_enabled || !row.google_conversion_action || !row.gclid) return null;
  let config = null;
  try { config = JSON.parse(row.config_json || '{}'); } catch { config = null; }
  if (!config?.customer_id || !config.client_id || !config.client_secret || !config.refresh_token) return null;
  const conversionAction = conversionActionResource(row.google_conversion_action, config.customer_id);
  if (!conversionAction) return null;
  return { config, conversionAction, gclid: row.gclid };
}

export async function fireGoogleSale({ clientId, contactId, conversionId, value, time = new Date() }, deps = {}) {
  const dbImpl = deps.db || db;
  const setup = await loadSetup(dbImpl, clientId, contactId);
  if (!setup) return { status: 'disabled' };
  const eventId = `g-sale-${conversionId}`;
  const { rows } = await dbImpl.query(
    `INSERT INTO conversion_events (client_id, contact_id, platform, event_name, event_id, action_source, value, test_mode)
     VALUES (?, ?, 'google', 'Purchase', ?, 'offline_click', ?, FALSE)
     ON CONFLICT (event_id) DO UPDATE SET status = 'pending', error = NULL, created_at = CURRENT_TIMESTAMP
     WHERE conversion_events.status = 'failed'
     RETURNING id`,
    [clientId, contactId, eventId, value]
  );
  if (rows.length === 0) return { status: 'duplicate' };
  const logId = rows[0].id;
  try {
    await uploadClickConversion(setup.config, buildClickConversion({
      gclid: setup.gclid, conversionAction: setup.conversionAction, time, value, orderId: eventId
    }), deps);
    await dbImpl.query(`UPDATE conversion_events SET status = 'sent' WHERE id = ?`, [logId]);
    return { status: 'sent' };
  } catch (error) {
    await dbImpl.query(`UPDATE conversion_events SET status = 'failed', error = ? WHERE id = ?`, [String(error.message).slice(0, 500), logId]);
    return { status: 'failed', error: error.message };
  }
}
