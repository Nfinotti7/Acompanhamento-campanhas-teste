import db from '../config/db.js';
import { parseWhatsAppWebhook } from '../utils/whatsappWebhookParser.js';

const VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'further_whatsapp_verify_2026';

export function verifyWebhook(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
}

export async function receiveWebhook(req, res) {
  // A Meta reenvia agressivamente em caso de resposta não-2xx — responde logo e processa depois.
  res.sendStatus(200);

  try {
    const events = parseWhatsAppWebhook(req.body);

    for (const event of events) {
      const { rows: settingsRows } = await db.query(
        'SELECT client_id FROM whatsapp_settings WHERE phone_number_id = ?',
        [event.phoneNumberId]
      );
      const clientId = settingsRows[0]?.client_id;
      if (!clientId) continue; // numero ainda nao cadastrado a nenhum cliente

      const { rows: contactRows } = await db.query(
        `INSERT INTO whatsapp_contacts (client_id, wa_id, profile_name, ctwa_clid, ad_id, ad_headline, ad_body, source, last_message_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (client_id, wa_id) DO UPDATE SET
           profile_name = COALESCE(excluded.profile_name, whatsapp_contacts.profile_name),
           ctwa_clid = COALESCE(whatsapp_contacts.ctwa_clid, excluded.ctwa_clid),
           ad_id = COALESCE(whatsapp_contacts.ad_id, excluded.ad_id),
           ad_headline = COALESCE(whatsapp_contacts.ad_headline, excluded.ad_headline),
           ad_body = COALESCE(whatsapp_contacts.ad_body, excluded.ad_body),
           source = CASE WHEN whatsapp_contacts.source = 'ad' THEN 'ad' ELSE excluded.source END,
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

      await db.query(
        `INSERT INTO whatsapp_messages (client_id, contact_id, direction, body, wa_message_id, sent_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (wa_message_id) DO NOTHING`,
        [clientId, contactId, event.direction, event.body, event.waMessageId, event.sentAt]
      );
    }
  } catch (error) {
    console.error('WhatsApp webhook processing error:', error);
  }
}
