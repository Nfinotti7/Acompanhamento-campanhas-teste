// Meta Conversions API: monta e envia os eventos de conversão (Lead, Schedule,
// Purchase...) de uma conversa de WhatsApp pro Pixel/conjunto de dados do cliente.
import crypto from 'node:crypto';

const API_VERSION = 'v19.0';

// Eventos que dá pra ligar numa etapa do funil. Purchase não entra: é enviada a cada
// venda lançada, com o valor dela (senão a mesma venda contaria duas vezes).
export const STAGE_META_EVENTS = ['Lead', 'Contact', 'Schedule', 'CompleteRegistration', 'SubmitApplication'];

export function isValidStageMetaEvent(value) {
  return value === null || value === undefined || STAGE_META_EVENTS.includes(value);
}

export function sha256(value) {
  return crypto.createHash('sha256').update(String(value).trim().toLowerCase()).digest('hex');
}

// fbc no formato da Meta: fb.1.<quando o clique aconteceu, em ms>.<fbclid>
export function buildFbc(fbclid, clickedAt) {
  if (!fbclid) return null;
  return `fb.1.${new Date(clickedAt).getTime()}.${fbclid}`;
}

// contact: { id, wa_id, ctwa_clid, fbclid, clicked_at }
// - Veio de anúncio Clique para WhatsApp (tem ctwa_clid) e o cliente tem WABA: evento de
//   "business_messaging", que a Meta casa direto com o clique no anúncio.
// - Senão: evento "chat" casado pelo telefone (hash) e, se veio pelo Link Rastreável de um
//   anúncio Meta, pelo fbclid.
export function buildCapiEvent({ eventName, eventId, eventTime, contact, wabaId, clientId, value }) {
  const userData = {
    ph: [sha256(String(contact.wa_id).replace(/\D/g, ''))],
    country: [sha256('br')],
    external_id: [sha256(`${clientId}:${contact.id}`)]
  };
  const event = {
    event_name: eventName,
    event_time: Math.floor(new Date(eventTime).getTime() / 1000),
    event_id: eventId,
    user_data: userData
  };

  if (contact.ctwa_clid && wabaId) {
    event.action_source = 'business_messaging';
    event.messaging_channel = 'whatsapp';
    userData.ctwa_clid = contact.ctwa_clid;
    userData.whatsapp_business_account_id = wabaId;
  } else {
    event.action_source = 'chat';
    const fbc = buildFbc(contact.fbclid, contact.clicked_at);
    if (fbc) userData.fbc = fbc;
  }

  if (value != null) {
    event.custom_data = { value: Number(value), currency: 'BRL' };
  }
  return event;
}

export async function sendCapiEvent({ pixelId, accessToken, event, testEventCode, fetchImpl = fetch }) {
  const body = { data: [event] };
  if (testEventCode) body.test_event_code = testEventCode;
  const res = await fetchImpl(`https://graph.facebook.com/${API_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.error) {
    throw new Error(json?.error?.error_user_msg || json?.error?.message || `HTTP ${res.status}`);
  }
  return json;
}
