// Envia eventos de conversão pra Meta (Conversions API) e registra cada um em
// conversion_events -- a tela "Links e Conversões" mostra esse registro.
//
// Regras (decididas com o usuário):
// - Evento de etapa (Lead, Schedule...): uma vez por contato. event_id fixo por
//   contato+evento + UNIQUE no banco: entrar de novo na etapa não reenvia.
// - Purchase: uma por venda lançada, com o valor dela.
// - Nada é enviado se o cliente não ligou a CAPI (pixel + "ativo") ou não tem token Meta.
import db from '../config/db.js';
import { buildCapiEvent, sendCapiEvent } from './metaCapi.js';

async function loadCapiConfig(dbImpl, clientId) {
  const { rows } = await dbImpl.query(
    `SELECT cs.pixel_id, cs.test_event_code, cs.enabled, cr.config_json,
       (SELECT waba_id FROM whatsapp_settings ws WHERE ws.client_id = cs.client_id) AS waba_id
     FROM capi_settings cs
     LEFT JOIN credentials cr ON cr.client_id = cs.client_id AND cr.platform = 'meta'
     WHERE cs.client_id = ?`,
    [clientId]
  );
  const row = rows[0];
  if (!row?.enabled || !row.pixel_id) return null;
  let accessToken = null;
  try {
    accessToken = JSON.parse(row.config_json || '{}').access_token || null;
  } catch {
    accessToken = null;
  }
  if (!accessToken) return null;
  return {
    pixelId: row.pixel_id,
    accessToken,
    testEventCode: row.test_event_code || null,
    // 'baileys' é o valor de preenchimento do modo não-oficial, não uma WABA de verdade.
    wabaId: row.waba_id && row.waba_id !== 'baileys' ? row.waba_id : null
  };
}

async function loadContact(dbImpl, clientId, contactId) {
  const { rows } = await dbImpl.query(
    `SELECT wc.id, wc.wa_id, wc.ctwa_clid, tc.fbclid, tc.created_at AS clicked_at
     FROM whatsapp_contacts wc
     LEFT JOIN tracking_clicks tc ON tc.id = wc.tracking_click_id
     WHERE wc.id = ? AND wc.client_id = ?`,
    [contactId, clientId]
  );
  return rows[0] || null;
}

export async function fireEvent({ clientId, contactId, eventName, eventId, value = null, eventTime = new Date() }, deps = {}) {
  const dbImpl = deps.db || db;
  const send = deps.send || sendCapiEvent;

  const config = await loadCapiConfig(dbImpl, clientId);
  if (!config) return { status: 'disabled' };
  const contact = await loadContact(dbImpl, clientId, contactId);
  if (!contact) return { status: 'no_contact' };

  const event = buildCapiEvent({ eventName, eventId, eventTime, contact, wabaId: config.wabaId, clientId, value });

  // Reserva o event_id antes de enviar: se já existe, esse evento já foi (ou está sendo)
  // enviado pra esse contato. Exceção: se a tentativa anterior falhou (pixel errado,
  // token vencido...), tenta de novo -- senão o evento se perdia pra sempre.
  const { rows } = await dbImpl.query(
    `INSERT INTO conversion_events (client_id, contact_id, platform, event_name, event_id, action_source, value, test_mode)
     VALUES (?, ?, 'meta', ?, ?, ?, ?, ?)
     ON CONFLICT (event_id) DO UPDATE SET status = 'pending', error = NULL, created_at = CURRENT_TIMESTAMP,
       action_source = excluded.action_source, test_mode = excluded.test_mode
     WHERE conversion_events.status = 'failed'
     RETURNING id`,
    [clientId, contactId, eventName, eventId, event.action_source, value, Boolean(config.testEventCode)]
  );
  if (rows.length === 0) return { status: 'duplicate' };
  const logId = rows[0].id;

  try {
    await send({ pixelId: config.pixelId, accessToken: config.accessToken, event, testEventCode: config.testEventCode });
    await dbImpl.query(`UPDATE conversion_events SET status = 'sent' WHERE id = ?`, [logId]);
    return { status: 'sent' };
  } catch (error) {
    await dbImpl.query(`UPDATE conversion_events SET status = 'failed', error = ? WHERE id = ?`, [String(error.message).slice(0, 500), logId]);
    return { status: 'failed', error: error.message };
  }
}

// Contato entrou numa etapa: envia o evento Meta ligado a ela, se houver.
export async function fireStageEvent({ clientId, contactId }, deps = {}) {
  const dbImpl = deps.db || db;
  const { rows } = await dbImpl.query(
    `SELECT s.meta_event FROM whatsapp_contacts wc
     JOIN crm_stages s ON s.id = wc.stage_id
     WHERE wc.id = ? AND wc.client_id = ?`,
    [contactId, clientId]
  );
  const eventName = rows[0]?.meta_event;
  if (!eventName) return { status: 'no_event' };
  return fireEvent({ clientId, contactId, eventName, eventId: `c${contactId}-${eventName}` }, deps);
}

export async function fireSaleEvent({ clientId, contactId, conversionId, value }, deps = {}) {
  return fireEvent({ clientId, contactId, eventName: 'Purchase', eventId: `sale-${conversionId}`, value }, deps);
}

// Pra chamar sem segurar a resposta da requisição/webhook.
export function inBackground(promise) {
  promise.catch((error) => console.error('Erro ao enviar evento de conversão:', error.message));
}
