// 'reaction' não é uma mensagem nova, é um emoji reagindo a outra mensagem já existente --
// não deve criar/atualizar contato nem aparecer na conversa (mesmo critério do Baileys).
function extractBody(m) {
  switch (m.type) {
    case 'text': return m.text?.body || null;
    case 'image': return m.image?.caption || '📷 Imagem';
    case 'video': return m.video?.caption || '🎞️ Vídeo';
    case 'audio': return m.audio?.voice ? '🎤 Mensagem de voz' : '🎵 Áudio';
    case 'document': return m.document?.caption || `📎 ${m.document?.filename || 'Documento'}`;
    case 'sticker': return '😊 Figurinha';
    case 'location': return '📍 Localização';
    case 'contacts': return '👤 Contato compartilhado';
    case 'button': return m.button?.text || '📩 Mensagem';
    case 'interactive': return m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || '📩 Mensagem';
    default: return '📩 Mensagem';
  }
}

const MEDIA_TYPES = ['image', 'video', 'audio', 'document', 'sticker'];

function extractMedia(m) {
  if (!MEDIA_TYPES.includes(m.type) || !m[m.type]?.id) {
    return { mediaType: null, mediaId: null, mimeType: null, filename: null };
  }
  const media = m[m.type];
  return { mediaType: m.type, mediaId: media.id, mimeType: media.mime_type || null, filename: media.filename || null };
}

export function parseWhatsAppWebhook(payload) {
  const events = [];
  const entries = payload?.entry || [];

  for (const entry of entries) {
    const changes = entry.changes || [];
    for (const change of changes) {
      const value = change.value || {};
      const phoneNumberId = value.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      const profileNameByWaId = {};
      for (const c of value.contacts || []) {
        profileNameByWaId[c.wa_id] = c.profile?.name || null;
      }

      for (const m of value.messages || []) {
        if (m.type === 'reaction') continue;
        const referral = m.referral || null;
        events.push({
          phoneNumberId,
          waId: m.from,
          profileName: profileNameByWaId[m.from] || null,
          waMessageId: m.id,
          direction: 'inbound',
          body: extractBody(m),
          sentAt: new Date(Number(m.timestamp) * 1000).toISOString(),
          ctwaClid: referral?.ctwa_clid || null,
          adId: referral?.source_id || null,
          adHeadline: referral?.headline || null,
          adBody: referral?.body || null,
          adSourceUrl: referral?.source_url || null,
          referral,
          ...extractMedia(m)
        });
      }
    }
  }

  return events;
}
