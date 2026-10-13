import db from '../config/db.js';
import { parseWhatsAppWebhook } from '../utils/whatsappWebhookParser.js';
import { ingestWhatsAppEvent } from '../services/whatsappIngest.js';
import { downloadCloudMedia } from '../services/metaWhatsAppApi.js';

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
        'SELECT client_id, access_token FROM whatsapp_settings WHERE phone_number_id = ?',
        [event.phoneNumberId]
      );
      const settings = settingsRows[0];
      if (!settings?.client_id) continue; // numero ainda nao cadastrado a nenhum cliente

      if (event.mediaId) {
        event.media = {
          mimeType: event.mimeType,
          download: () => downloadCloudMedia({ mediaId: event.mediaId, accessToken: settings.access_token })
        };
      }

      await ingestWhatsAppEvent(settings.client_id, event);
    }
  } catch (error) {
    console.error('WhatsApp webhook processing error:', error);
  }
}
