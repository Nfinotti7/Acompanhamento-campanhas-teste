// Converte uma mensagem crua da Baileys (WhatsApp Web) pro mesmo formato de evento
// que o parser do webhook oficial produz, pra poder reaproveitar ingestWhatsAppEvent.

// Tipos que não representam uma mensagem de verdade (reação a outra mensagem, eventos
// de protocolo como "mensagem apagada", enquete, distribuição de chave de grupo) --
// esses não devem criar/atualizar contato nem aparecer na conversa.
// Também os avisos sem conteúdo próprio: álbum (as fotos chegam uma a uma depois), fixar
// mensagem, "manter na conversa" e mensagem só com metadados.
const NON_CONTENT_KEYS = ['reactionMessage', 'protocolMessage', 'pollUpdateMessage', 'senderKeyDistributionMessage',
  'albumMessage', 'pinInChatMessage', 'keepInChatMessage', 'messageContextInfo', 'encReactionMessage'];

export const UNKNOWN_MESSAGE_LABEL = '📩 Mensagem';

// O WhatsApp embrulha o conteúdo de verdade em outros tipos: conversa temporária,
// visualização única, documento com legenda, mensagem editada... Sem abrir o embrulho,
// tudo isso caía em "📩 Mensagem".
const WRAPPER_KEYS = ['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension',
  'documentWithCaptionMessage', 'editedMessage', 'deviceSentMessage', 'lottieStickerMessage',
  'associatedChildMessage', 'groupMentionedMessage', 'botInvokeMessage'];
const VIEW_ONCE_KEYS = ['viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension'];
const MESSAGE_EDIT = 14; // protocolMessage.type

function unwrap(message) {
  let current = message || {};
  let viewOnce = false;
  for (let depth = 0; depth < 5; depth++) {
    const key = WRAPPER_KEYS.find((k) => current[k]?.message);
    if (!key) break;
    if (VIEW_ONCE_KEYS.includes(key)) viewOnce = true;
    current = current[key].message;
  }
  return { content: current, viewOnce };
}

function editedContent(message) {
  const protocol = message.protocolMessage;
  return protocol?.type === MESSAGE_EDIT && protocol.editedMessage ? protocol.editedMessage : null;
}

function extractContent(message) {
  const edited = editedContent(message);
  if (edited) {
    const text = extractContent(unwrap(edited).content);
    return text ? `✏️ Editou: ${text}` : '✏️ Mensagem editada';
  }
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
  if (message.ptvMessage) return message.ptvMessage.caption || '🎥 Recado de vídeo';
  const poll = message.pollCreationMessage || message.pollCreationMessageV2 || message.pollCreationMessageV3;
  if (poll) return `📊 Enquete: ${poll.name || ''}`.trim();
  if (message.eventMessage) return `📅 Evento: ${message.eventMessage.name || ''}`.trim();
  if (message.groupInviteMessage) return `👥 Convite pro grupo ${message.groupInviteMessage.groupName || ''}`.trim();
  if (message.buttonsResponseMessage) return message.buttonsResponseMessage.selectedDisplayText || '🔘 Resposta de botão';
  if (message.templateButtonReplyMessage) return message.templateButtonReplyMessage.selectedDisplayText || '🔘 Resposta de botão';
  if (message.listResponseMessage) return message.listResponseMessage.title || '🔘 Resposta de lista';
  if (message.interactiveResponseMessage) return message.interactiveResponseMessage.body?.text || '🔘 Resposta de botão';
  if (message.productMessage) return '🛍️ Produto do catálogo';
  if (message.orderMessage) return '🛒 Pedido';
  return null;
}

const MEDIA_KEYS = {
  imageMessage: 'image',
  videoMessage: 'video',
  ptvMessage: 'video',
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
// Devolve { referral, unmatched }: unmatched é um cartão que veio mas não parece anúncio
// (guardado pra investigar conversa que devia ter sido rastreada e não foi).
function extractAdReferral(message) {
  let unmatched = null;
  for (const value of Object.values(message || {})) {
    const ad = value?.contextInfo?.externalAdReply;
    if (!ad) continue;
    // Mesmo formato do referral da Cloud API, pra aba Origem e o resto tratarem igual.
    const card = {
      source_type: ad.sourceType || null,
      source_id: ad.sourceId || null,
      source_url: ad.sourceUrl || null,
      headline: ad.title || null,
      body: ad.body || null,
      media_type: ad.mediaType ?? null,
      thumbnail_url: ad.thumbnailUrl || null,
      ctwa_clid: ad.ctwaClid || null
    };
    // Link de site compartilhado também gera externalAdReply; só conta se for anúncio.
    if (ad.sourceType === 'ad' || ad.ctwaClid) return { referral: { ...card, source_type: card.source_type || 'ad' }, unmatched: null };
    unmatched = unmatched || card;
  }
  return { referral: null, unmatched };
}

export function mapBaileysMessageToEvent(msg) {
  const sentAt = msg.messageTimestamp
    ? new Date(Number(msg.messageTimestamp) * 1000).toISOString()
    : new Date().toISOString();
  const { content, viewOnce } = unwrap(msg.message);
  // Só a mensagem do lead traz o anúncio de onde ele veio.
  const { referral, unmatched } = msg.key?.fromMe ? {} : extractAdReferral(content);
  // Visualização única não chega pra aparelho conectado (o WhatsApp Web também mostra
  // "abra no celular"), então nem tenta baixar.
  const viewOnceCaption = content.imageMessage?.caption || content.videoMessage?.caption;
  const body = viewOnce
    ? `👁️ Foto ou vídeo de visualização única (abra no celular)${viewOnceCaption ? `: ${viewOnceCaption}` : ''}`
    : extractContent(content) || UNKNOWN_MESSAGE_LABEL;
  const media = viewOnce ? { mediaType: null, mimeType: null, filename: null } : extractMedia(content);

  return {
    waId: extractWaId(msg.key),
    profileName: msg.pushName || null,
    waMessageId: msg.key?.id || null,
    direction: msg.key?.fromMe ? 'outbound' : 'inbound',
    body,
    ...media,
    sentAt,
    ctwaClid: referral?.ctwa_clid || null,
    adId: referral?.source_id || null,
    adHeadline: referral?.headline || null,
    adBody: referral?.body || null,
    adSourceUrl: referral?.source_url || null,
    referral: referral || null,
    unmatchedAdReply: unmatched || null
  };
}

export function isUsableMessage(msg) {
  if (!msg.message) return false;
  if (!extractWaId(msg.key)) return false;
  const { content } = unwrap(msg.message);
  if (editedContent(content)) return true;
  const messageKeys = Object.keys(content);
  if (messageKeys.length > 0 && messageKeys.every((k) => NON_CONTENT_KEYS.includes(k))) return false;
  return true;
}

// Tipos crus da mensagem (depois de abrir o embrulho), pro log quando cai no rótulo genérico.
export function messageTypes(msg) {
  return Object.keys(unwrap(msg.message).content);
}
