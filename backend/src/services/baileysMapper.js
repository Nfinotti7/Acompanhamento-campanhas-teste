// Converte uma mensagem crua da Baileys (WhatsApp Web) pro mesmo formato de evento
// que o parser do webhook oficial produz, pra poder reaproveitar ingestWhatsAppEvent.

// Tipos que não representam uma mensagem de verdade (reação a outra mensagem, eventos
// de protocolo como "mensagem apagada", enquete, distribuição de chave de grupo) --
// esses não devem criar/atualizar contato nem aparecer na conversa.
const NON_CONTENT_KEYS = ['reactionMessage', 'protocolMessage', 'pollUpdateMessage', 'senderKeyDistributionMessage'];

function extractContent(message) {
  if (message.conversation) return message.conversation;
  if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
  if (message.imageMessage) return message.imageMessage.caption || '📷 Imagem';
  if (message.videoMessage) return message.videoMessage.caption || '🎞️ Vídeo';
  if (message.audioMessage) return message.audioMessage.ptt ? '🎤 Mensagem de voz' : '🎵 Áudio';
  if (message.documentMessage) return message.documentMessage.caption || `📎 ${message.documentMessage.fileName || 'Documento'}`;
  if (message.stickerMessage) return '😊 Figurinha';
  if (message.locationMessage) return '📍 Localização';
  if (message.liveLocationMessage) return '📍 Localização em tempo real';
  if (message.contactMessage) return `👤 Contato: ${message.contactMessage.displayName || 'compartilhado'}`;
  if (message.contactsArrayMessage) return '👤 Contatos compartilhados';
  return null;
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
    body: extractContent(msg.message) || '📩 Mensagem',
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
  const messageKeys = Object.keys(msg.message);
  if (messageKeys.length > 0 && messageKeys.every((k) => NON_CONTENT_KEYS.includes(k))) return false;
  return true;
}
