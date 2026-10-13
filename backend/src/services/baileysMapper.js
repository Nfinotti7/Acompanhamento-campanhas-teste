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

const MEDIA_KEYS = {
  imageMessage: 'image',
  videoMessage: 'video',
  audioMessage: 'audio',
  documentMessage: 'document',
  stickerMessage: 'sticker'
};

function extractMedia(message) {
  for (const [key, type] of Object.entries(MEDIA_KEYS)) {
    if (message?.[key]) {
      return { mediaType: type, mimeType: message[key].mimetype || null, filename: message[key].fileName || null };
    }
  }
  return { mediaType: null, mimeType: null, filename: null };
}

// Quando a privacidade de "quem pode ver meu número" do remetente está restrita (ou,
// cada vez mais, por padrão em contas novas), o WhatsApp manda o remoteJid como um LID
// (ex: "123456789@lid") -- um id interno opaco, não o número de telefone. O Baileys
// expõe o número de verdade em remoteJidAlt nesse caso. Sem isso, o wa_id gravado não é
// um número de WhatsApp válido e qualquer resposta enviada pra ele falha silenciosamente.
function extractWaId(key) {
  const jid = key?.remoteJid;
  if (!jid) return null;
  if (jid.endsWith('@lid') && key.remoteJidAlt) {
    return key.remoteJidAlt.split('@')[0] || null;
  }
  return jid.split('@')[0] || null;
}

// Clique em anúncio "Clique para WhatsApp": a primeira mensagem do lead chega com o
// cartão do anúncio em contextInfo.externalAdReply (sourceId = id do anúncio, ctwaClid =
// id do clique) -- o mesmo dado que a Cloud API manda em "referral". Pode vir em qualquer
// tipo de mensagem (texto, imagem...), então procura em todas.
function extractAdReferral(message) {
  for (const value of Object.values(message || {})) {
    const ad = value?.contextInfo?.externalAdReply;
    if (!ad) continue;
    // Link de site compartilhado também gera externalAdReply; só conta se for anúncio.
    if (ad.sourceType !== 'ad' && !ad.ctwaClid) continue;
    // Mesmo formato do referral da Cloud API, pra aba Origem e o resto tratarem igual.
    return {
      source_type: ad.sourceType || 'ad',
      source_id: ad.sourceId || null,
      source_url: ad.sourceUrl || null,
      headline: ad.title || null,
      body: ad.body || null,
      media_type: ad.mediaType ?? null,
      thumbnail_url: ad.thumbnailUrl || null,
      ctwa_clid: ad.ctwaClid || null
    };
  }
  return null;
}

export function mapBaileysMessageToEvent(msg) {
  const sentAt = msg.messageTimestamp
    ? new Date(Number(msg.messageTimestamp) * 1000).toISOString()
    : new Date().toISOString();
  // Só a mensagem do lead traz o anúncio de onde ele veio.
  const referral = msg.key?.fromMe ? null : extractAdReferral(msg.message);

  return {
    waId: extractWaId(msg.key),
    profileName: msg.pushName || null,
    waMessageId: msg.key?.id || null,
    direction: msg.key?.fromMe ? 'outbound' : 'inbound',
    body: extractContent(msg.message) || '📩 Mensagem',
    ...extractMedia(msg.message),
    sentAt,
    ctwaClid: referral?.ctwa_clid || null,
    adId: referral?.source_id || null,
    adHeadline: referral?.headline || null,
    adBody: referral?.body || null,
    adSourceUrl: referral?.source_url || null,
    referral
  };
}

export function isUsableMessage(msg) {
  if (!msg.message) return false;
  if (!extractWaId(msg.key)) return false;
  const messageKeys = Object.keys(msg.message);
  if (messageKeys.length > 0 && messageKeys.every((k) => NON_CONTENT_KEYS.includes(k))) return false;
  return true;
}
