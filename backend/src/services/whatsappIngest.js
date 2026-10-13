import db from '../config/db.js';

// Grava contato + mensagem pro client_id já resolvido. Compartilhado pelo webhook
// oficial da Cloud API (whatsappWebhookController.js) e pela conexão Baileys
// (baileysClient.js) -- os dois so precisam descobrir o client_id de jeitos
// diferentes antes de chamar isso.
export async function ingestWhatsAppEvent(clientId, event, deps = {}) {
  const dbImpl = deps.db || db;

  const { rows: contactRows } = await dbImpl.query(
    `INSERT INTO whatsapp_contacts (client_id, wa_id, profile_name, ctwa_clid, ad_id, ad_headline, ad_body, source, last_message_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (client_id, wa_id) DO UPDATE SET
       profile_name = COALESCE(excluded.profile_name, whatsapp_contacts.profile_name),
       ctwa_clid = COALESCE(whatsapp_contacts.ctwa_clid, excluded.ctwa_clid),
       ad_id = COALESCE(whatsapp_contacts.ad_id, excluded.ad_id),
       ad_headline = COALESCE(whatsapp_contacts.ad_headline, excluded.ad_headline),
       ad_body = COALESCE(whatsapp_contacts.ad_body, excluded.ad_body),
       source = CASE WHEN whatsapp_contacts.source = 'ad' THEN 'ad' ELSE excluded.source END,
       manual_stage = NULL,
       manual_stage_set_at = NULL,
       last_message_at = excluded.last_message_at
     RETURNING id`,
    [
      clientId,
      event.waId,
      event.profileName,
      event.ctwaClid,
      event.adId,
      event.adHeadline,
      event.adBody,
      event.ctwaClid ? 'ad' : 'organic',
      event.sentAt
    ]
  );
  const contactId = contactRows[0].id;

  await dbImpl.query(
    `INSERT INTO whatsapp_messages (client_id, contact_id, direction, body, wa_message_id, sent_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (wa_message_id) DO NOTHING`,
    [clientId, contactId, event.direction, event.body, event.waMessageId, event.sentAt]
  );

  return contactId;
}
