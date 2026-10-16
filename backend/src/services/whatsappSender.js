// Manda uma mensagem de texto pra um contato, pelo canal que o cliente usa (Baileys
// ou Cloud API), e grava no histórico da conversa. Usado pela resposta manual do
// painel e pelo robô da fila (Na Mesa).
import db from '../config/db.js';
import { sendWhatsAppMessage } from './metaWhatsAppApi.js';
import { sendViaBaileys } from './baileysClient.js';
import { broadcast } from './sseHub.js';

export class SendError extends Error {
  constructor(message, httpStatus) {
    super(message);
    this.httpStatus = httpStatus;
  }
}

export async function sendToContact({ clientId, contactId, body }, deps = {}) {
  const dbImpl = deps.db || db;
  const viaBaileys = deps.sendViaBaileys || sendViaBaileys;
  const viaCloud = deps.sendWhatsAppMessage || sendWhatsAppMessage;
  const broadcastFn = deps.broadcast || broadcast;

  const { rows: contactRows } = await dbImpl.query(
    'SELECT wa_id FROM whatsapp_contacts WHERE id = ? AND client_id = ?',
    [contactId, clientId]
  );
  const contact = contactRows[0];
  if (!contact) throw new SendError('Contato não encontrado.', 404);

  const { rows: settingsRows } = await dbImpl.query(
    'SELECT phone_number_id, access_token, connection_type FROM whatsapp_settings WHERE client_id = ?',
    [clientId]
  );
  const settings = settingsRows[0];
  if (!settings) throw new SendError('WhatsApp não configurado para este cliente.', 400);

  let waMessageId = null;
  if (settings.connection_type === 'baileys') {
    waMessageId = await viaBaileys(clientId, contact.wa_id, body);
  } else {
    const sendResult = await viaCloud({
      phoneNumberId: settings.phone_number_id,
      accessToken: settings.access_token,
      to: contact.wa_id,
      body
    });
    waMessageId = sendResult?.messages?.[0]?.id || null;
  }

  // O Baileys às vezes registra a própria mensagem enviada (messages.upsert) antes desta
  // linha -- com o mesmo wa_message_id. Nesse caso só completa o status.
  await dbImpl.query(
    `INSERT INTO whatsapp_messages (client_id, contact_id, direction, body, wa_message_id, sent_at, status)
     VALUES (?, ?, 'outbound', ?, ?, CURRENT_TIMESTAMP, 'sent')
     ON CONFLICT (wa_message_id) DO UPDATE SET status = COALESCE(whatsapp_messages.status, excluded.status)`,
    [clientId, contactId, body, waMessageId]
  );

  // Responder sobe a conversa pro topo da lista e conta como "lida" pela equipe.
  await dbImpl.query(
    `UPDATE whatsapp_contacts
     SET last_message_at = CURRENT_TIMESTAMP, last_read_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [contactId]
  );

  broadcastFn(clientId, 'message', {
    contactId: Number(contactId),
    direction: 'outbound',
    body,
    sentAt: new Date().toISOString()
  });

  return waMessageId;
}
