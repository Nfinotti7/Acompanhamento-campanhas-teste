// Converte uma mensagem crua da Baileys (WhatsApp Web) pro mesmo formato de evento
// que o parser do webhook oficial produz, pra poder reaproveitar ingestWhatsAppEvent.

function extractText(message) {
  return message?.conversation
    || message?.extendedTextMessage?.text
    || message?.imageMessage?.caption
    || message?.videoMessage?.caption
    || null;
}

function extractWaId(remoteJid) {
  if (!remoteJid) return null;
  return remoteJid.split('@')[0] || null;
}

export function mapBaileysMessageToEvent(msg) {
  const sentAt = msg.messageTimestamp
    ? new Date(Number(msg.messageTimestamp) * 1000).toISOString()
    : new Date().toISOString();

  return {
    waId: extractWaId(msg.key?.remoteJid),
    profileName: msg.pushName || null,
    waMessageId: msg.key?.id || null,
    direction: msg.key?.fromMe ? 'outbound' : 'inbound',
    body: extractText(msg.message),
    sentAt,
    // O protocolo do WhatsApp Web nao expoe de qual anuncio a conversa veio --
    // todo contato chegado via Baileys e organico.
    ctwaClid: null,
    adId: null,
    adHeadline: null,
    adBody: null
  };
}

export function isUsableMessage(msg) {
  if (!msg.message) return false;
  if (!extractWaId(msg.key?.remoteJid)) return false;
  if (!extractText(msg.message)) return false;
  return true;
}
