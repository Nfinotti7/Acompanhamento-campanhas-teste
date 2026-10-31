// Manda uma mensagem de texto (ou um anexo) pra um contato, pelo canal que o cliente usa
// (Baileys ou Cloud API), e grava no histórico da conversa. Usado pela resposta manual do
// painel e pelo robô da fila (Na Mesa).
import db from '../config/db.js';
import { sendWhatsAppMessage, uploadCloudMedia, sendWhatsAppMedia } from './metaWhatsAppApi.js';
import { sendViaBaileys } from './baileysClient.js';
import { randomBytes } from 'node:crypto';
import { broadcast } from './sseHub.js';

export class SendError extends Error {
  constructor(message, httpStatus) {
    super(message);
    this.httpStatus = httpStatus;
  }
}

// Mesmo formato dos ids que o próprio WhatsApp Web gera.
export function newBotMessageId() {
  return '3EB0' + randomBytes(9).toString('hex').toUpperCase();
}

async function loadContactAndSettings(dbImpl, clientId, contactId) {
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
  return { contact, settings };
}

// sentBy: 'staff' (resposta da equipe pelo Caixa) ou o robô ('bot_reserva').
export async function sendToContact({ clientId, contactId, body, sentBy = 'staff' }, deps = {}) {
  const dbImpl = deps.db || db;
  const viaBaileys = deps.sendViaBaileys || sendViaBaileys;
  const viaCloud = deps.sendWhatsAppMessage || sendWhatsAppMessage;
  const broadcastFn = deps.broadcast || broadcast;

  const { contact, settings } = await loadContactAndSettings(dbImpl, clientId, contactId);

  let waMessageId = null;
  if (settings.connection_type === 'baileys' && sentBy !== 'staff') {
    // Robô: o id é gerado aqui e a linha é gravada ANTES de enviar. O Baileys devolve a
    // própria mensagem enviada (messages.upsert) como "saída"; com a linha já gravada,
    // o ingest reconhece o eco e não confunde o robô com um atendente (botPause.js).
    waMessageId = newBotMessageId();
    await dbImpl.query(
      `INSERT INTO whatsapp_messages (client_id, contact_id, direction, body, wa_message_id, sent_by, sent_at, status)
       VALUES (?, ?, 'outbound', ?, ?, ?, CURRENT_TIMESTAMP, 'pending')
       ON CONFLICT (wa_message_id) DO NOTHING`,
      [clientId, contactId, body, waMessageId, sentBy]
    );
    try {
      await viaBaileys(clientId, contact.wa_id, body, { messageId: waMessageId });
    } catch (error) {
      await dbImpl.query(`UPDATE whatsapp_messages SET status = 'failed' WHERE wa_message_id = ?`, [waMessageId]);
      throw error;
    }
    await dbImpl.query(
      `UPDATE whatsapp_messages SET status = 'sent' WHERE wa_message_id = ? AND status = 'pending'`,
      [waMessageId]
    );
  } else {
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
    // linha -- com o mesmo wa_message_id. Nesse caso só completa o status e quem enviou.
    await dbImpl.query(
      `INSERT INTO whatsapp_messages (client_id, contact_id, direction, body, wa_message_id, sent_by, sent_at, status)
       VALUES (?, ?, 'outbound', ?, ?, ?, CURRENT_TIMESTAMP, 'sent')
       ON CONFLICT (wa_message_id) DO UPDATE SET status = COALESCE(whatsapp_messages.status, excluded.status),
         sent_by = COALESCE(whatsapp_messages.sent_by, excluded.sent_by)`,
      [clientId, contactId, body, waMessageId, sentBy]
    );
  }

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

// Mesmo limite da mídia recebida (whatsappIngest.js): o arquivo fica no Postgres.
export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

// Só JPEG/PNG vão como foto e só MP4/3GP como vídeo (o que o WhatsApp aceita nesses
// tipos); o resto (PDF, WEBP, HEIC...) vai como documento, que aceita qualquer arquivo.
export function attachmentType(mimeType) {
  const mime = (mimeType || '').toLowerCase().split(';')[0].trim();
  if (mime === 'image/jpeg' || mime === 'image/png') return 'image';
  if (mime === 'video/mp4' || mime === 'video/3gpp') return 'video';
  if (['audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/amr'].includes(mime)) return 'audio';
  return 'document';
}

// Corpo gravado na conversa: a legenda, ou o mesmo rótulo da mídia recebida sem legenda
// (baileysMapper.js), que a tela esconde quando mostra a mídia.
function attachmentLabel(mediaType, filename) {
  if (mediaType === 'image') return '📷 Imagem';
  if (mediaType === 'video') return '🎞️ Vídeo';
  if (mediaType === 'audio') return '🎵 Áudio';
  return `📎 ${filename || 'Documento'}`;
}

// Anexo da equipe (cardápio, foto, PDF). O arquivo é gravado em whatsapp_media antes de
// enviar, e no Baileys a linha da mensagem também: o eco cai no ON CONFLICT e não baixa
// o arquivo de novo. Áudio não aceita legenda; ela vai numa mensagem de texto depois.
export async function sendMediaToContact({ clientId, contactId, data, mimeType, filename, caption = '', sentBy = 'staff' }, deps = {}) {
  const dbImpl = deps.db || db;
  const viaBaileys = deps.sendViaBaileys || sendViaBaileys;
  const uploadCloud = deps.uploadCloudMedia || uploadCloudMedia;
  const viaCloudMedia = deps.sendWhatsAppMedia || sendWhatsAppMedia;
  const broadcastFn = deps.broadcast || broadcast;

  if (!data || data.length === 0) throw new SendError('Arquivo vazio.', 400);
  if (data.length > MAX_ATTACHMENT_BYTES) throw new SendError('Arquivo grande demais (máximo 15 MB).', 413);

  const { contact, settings } = await loadContactAndSettings(dbImpl, clientId, contactId);
  const mime = mimeType || 'application/octet-stream';
  const mediaType = attachmentType(mime);
  const text = (caption || '').trim();
  const mediaCaption = mediaType === 'audio' ? '' : text;
  const body = mediaCaption || attachmentLabel(mediaType, filename);

  const { rows: mediaRows } = await dbImpl.query(
    `INSERT INTO whatsapp_media (client_id, contact_id, mime_type, data, size_bytes)
     VALUES (?, ?, ?, ?, ?)
     RETURNING id`,
    [clientId, contactId, mime, data, data.length]
  );
  const mediaId = mediaRows[0].id;

  let waMessageId;
  if (settings.connection_type === 'baileys') {
    waMessageId = newBotMessageId();
    await dbImpl.query(
      `INSERT INTO whatsapp_messages (client_id, contact_id, direction, body, wa_message_id, sent_by, sent_at, status, media_id, media_type, media_filename)
       VALUES (?, ?, 'outbound', ?, ?, ?, CURRENT_TIMESTAMP, 'pending', ?, ?, ?)
       ON CONFLICT (wa_message_id) DO NOTHING`,
      [clientId, contactId, body, waMessageId, sentBy, mediaId, mediaType, filename || null]
    );
    try {
      await viaBaileys(clientId, contact.wa_id, mediaCaption, {
        messageId: waMessageId,
        media: { mediaId, mediaType, mimeType: mime, filename: filename || null }
      });
    } catch (error) {
      await dbImpl.query(`UPDATE whatsapp_messages SET status = 'failed' WHERE wa_message_id = ?`, [waMessageId]);
      throw error;
    }
    await dbImpl.query(
      `UPDATE whatsapp_messages SET status = 'sent' WHERE wa_message_id = ? AND status = 'pending'`,
      [waMessageId]
    );
  } else {
    const cloudMediaId = await uploadCloud({
      phoneNumberId: settings.phone_number_id,
      accessToken: settings.access_token,
      data,
      mimeType: mime,
      filename
    });
    const sendResult = await viaCloudMedia({
      phoneNumberId: settings.phone_number_id,
      accessToken: settings.access_token,
      to: contact.wa_id,
      mediaType,
      mediaId: cloudMediaId,
      caption: mediaCaption,
      filename
    });
    waMessageId = sendResult?.messages?.[0]?.id || null;
    await dbImpl.query(
      `INSERT INTO whatsapp_messages (client_id, contact_id, direction, body, wa_message_id, sent_by, sent_at, status, media_id, media_type, media_filename)
       VALUES (?, ?, 'outbound', ?, ?, ?, CURRENT_TIMESTAMP, 'sent', ?, ?, ?)`,
      [clientId, contactId, body, waMessageId, sentBy, mediaId, mediaType, filename || null]
    );
  }

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

  if (mediaType === 'audio' && text) {
    await sendToContact({ clientId, contactId, body: text, sentBy }, deps);
  }

  return waMessageId;
}
