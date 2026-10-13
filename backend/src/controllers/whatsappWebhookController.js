import db from '../config/db.js';
import { parseWhatsAppWebhook } from '../utils/whatsappWebhookParser.js';
import { ingestWhatsAppEvent } from '../services/whatsappIngest.js';
import { downloadCloudMedia } from '../services/metaWhatsAppApi.js';
import { isValidMetaSignature } from '../utils/metaSignature.js';

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
  // Sem META_APP_SECRET configurado não dá pra saber se a chamada veio mesmo da Meta --
  // recusa tudo (fail closed) em vez de aceitar qualquer POST.
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) {
    console.error('Webhook WhatsApp recusado: META_APP_SECRET não configurado no ambiente.');
    return res.sendStatus(503);
  }
  if (!isValidMetaSignature(req.rawBody, req.get('X-Hub-Signature-256'), appSecret)) {
    console.error('Webhook WhatsApp recusado: assinatura X-Hub-Signature-256 inválida.');
    return res.sendStatus(401);
  }

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
