// Histórico do WhatsApp: quando um aparelho é conectado (QR), o WhatsApp manda as conversas
// antigas do celular no evento 'messaging-history.set' do Baileys. Aqui elas viram contatos e
// mensagens do Balcão SEM nenhum efeito colateral: não entra no funil, não dispara Lead/CAPI,
// robô de reserva/fila, atendente IA, notificação nem download de mídia. Criado em 24/11/2026
// pra recuperar as conversas do Malibu depois que o banco antigo travou.
//
// Reimportar é seguro: mensagem repetida cai no ON CONFLICT (wa_message_id).

import { mapBaileysMessageToEvent, isUsableMessage } from './baileysMapper.js';

const isPhone = (waId) => /^\d{8,15}$/.test(String(waId || ''));

export async function importHistoryMessages(dbImpl, clientId, messages, deps = {}) {
  const map = deps.map || mapBaileysMessageToEvent;
  const usable = deps.isUsable || isUsableMessage;
  const events = [];
  for (const msg of messages || []) {
    try {
      if (!usable(msg)) continue;
      const event = map(msg);
      if (!isPhone(event.waId) || !event.waMessageId) continue;
      events.push(event);
    } catch {
      // Mensagem que o mapeador não entende: pula, não derruba o lote.
    }
  }
  // Mais antiga primeiro: o primeiro contato (com o cartão do anúncio, se houver) define a origem.
  events.sort((a, b) => new Date(a.sentAt) - new Date(b.sentAt));

  const contactIds = new Map();
  let inserted = 0;
  for (const event of events) {
    let contactId = contactIds.get(event.waId);
    const fromAd = Boolean(event.ctwaClid || event.adId);
    if (!contactId || fromAd || event.profileName) {
      const { rows } = await dbImpl.query(
        `INSERT INTO whatsapp_contacts (client_id, wa_id, profile_name, ctwa_clid, ad_id, ad_headline, ad_body, source, last_message_at, ad_source_url, ad_referral_json, tracking_method)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (client_id, wa_id) DO UPDATE SET
           profile_name = COALESCE(whatsapp_contacts.profile_name, excluded.profile_name),
           ctwa_clid = COALESCE(whatsapp_contacts.ctwa_clid, excluded.ctwa_clid),
           ad_id = COALESCE(whatsapp_contacts.ad_id, excluded.ad_id),
           ad_headline = COALESCE(whatsapp_contacts.ad_headline, excluded.ad_headline),
           ad_body = COALESCE(whatsapp_contacts.ad_body, excluded.ad_body),
           ad_source_url = COALESCE(whatsapp_contacts.ad_source_url, excluded.ad_source_url),
           ad_referral_json = COALESCE(whatsapp_contacts.ad_referral_json, excluded.ad_referral_json),
           tracking_method = COALESCE(whatsapp_contacts.tracking_method, excluded.tracking_method),
           source = CASE WHEN whatsapp_contacts.source = 'ad' OR excluded.source = 'ad' THEN 'ad' ELSE whatsapp_contacts.source END,
           last_message_at = GREATEST(whatsapp_contacts.last_message_at, excluded.last_message_at)
         RETURNING id`,
        [
          clientId, event.waId, event.profileName, event.ctwaClid, event.adId, event.adHeadline, event.adBody,
          fromAd ? 'ad' : 'organic', event.sentAt, event.adSourceUrl || null,
          event.referral ? JSON.stringify(event.referral) : null, fromAd ? 'ctwa' : null,
        ]
      );
      contactId = rows[0].id;
      contactIds.set(event.waId, contactId);
    }
    const { rows } = await dbImpl.query(
      `INSERT INTO whatsapp_messages (client_id, contact_id, direction, body, wa_message_id, sent_at, media_type, media_filename)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (wa_message_id) DO NOTHING
       RETURNING id`,
      [clientId, contactId, event.direction, event.body, event.waMessageId, event.sentAt, event.mediaType || null, event.filename || null]
    );
    inserted += rows.length;
  }
  return { messages: inserted, contacts: contactIds.size };
}

// A lista de contatos do histórico traz o nome de quem nunca mandou pushName nas mensagens.
export async function applyHistoryContactNames(dbImpl, clientId, contacts) {
  let updated = 0;
  for (const c of contacts || []) {
    // Só contato de telefone (grupo é @g.us; LID sem telefone não casa com wa_id).
    const jid = c.phoneNumber || (String(c.id || '').endsWith('@s.whatsapp.net') ? c.id : '');
    const waId = String(jid).split('@')[0].split(':')[0];
    const name = c.notify || c.verifiedName || c.name;
    if (!isPhone(waId) || !name) continue;
    const { rows } = await dbImpl.query(
      `UPDATE whatsapp_contacts SET profile_name = ? WHERE client_id = ? AND wa_id = ? AND profile_name IS NULL RETURNING id`,
      [name, clientId, waId]
    );
    updated += rows.length;
  }
  return updated;
}
