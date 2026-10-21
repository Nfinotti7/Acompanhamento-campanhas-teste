import db from '../config/db.js';
import { broadcast } from './sseHub.js';
import { moveToAutoStage } from './crmStages.js';
import { extractTrackingCode, classifyClickSource } from './trackingLink.js';
import { handleInboundForWaitlist } from './waitlistBot.js';
import { pauseBot } from './botPause.js';
import { handleInboundForReservation } from './reservationBot.js';

// Acima disso não guarda o arquivo (fica só o rótulo na conversa) -- a mídia vai pro
// Postgres, e vídeos grandes encheriam o banco rápido.
export const MAX_MEDIA_BYTES = 15 * 1024 * 1024;

// Mensagem de saída até esse tempo depois da última recebida é resposta automática
// (saudação/ausência do WhatsApp Business), não atendente: não pausa o robô de reserva.
export const AUTO_REPLY_WINDOW_MS = 10 * 1000;

async function storeMedia(dbImpl, clientId, contactId, messageId, media) {
  let data;
  try {
    data = await media.download();
  } catch (error) {
    console.error(`Falha ao baixar mídia da mensagem ${messageId}:`, error.message);
    return;
  }
  if (!data || data.length === 0 || data.length > MAX_MEDIA_BYTES) return;

  const { rows } = await dbImpl.query(
    `INSERT INTO whatsapp_media (client_id, contact_id, mime_type, data, size_bytes)
     VALUES (?, ?, ?, ?, ?)
     RETURNING id`,
    [clientId, contactId, media.mimeType || 'application/octet-stream', data, data.length]
  );
  await dbImpl.query(
    `UPDATE whatsapp_messages SET media_id = ? WHERE id = ?`,
    [rows[0].id, messageId]
  );
}

// Mensagem com "(cód. XXXXX)" do Link Rastreável: liga o clique ao contato e, se o
// contato ainda não tem origem rastreada (primeiro toque), usa a do clique.
export async function matchTrackingClick(dbImpl, { clientId, contactId, body }) {
  const code = extractTrackingCode(body);
  if (!code) return null;
  const { rows } = await dbImpl.query(
    `UPDATE tracking_clicks SET contact_id = ?, matched_at = CURRENT_TIMESTAMP
     WHERE client_id = ? AND code = ? AND contact_id IS NULL
     RETURNING id, utm_source, fbclid, gclid`,
    [contactId, clientId, code]
  );
  const click = rows[0];
  if (!click) return null;
  await dbImpl.query(
    `UPDATE whatsapp_contacts SET source = ?, tracking_method = 'link', tracking_click_id = ?
     WHERE id = ? AND tracking_method IS NULL`,
    [classifyClickSource(click), click.id, contactId]
  );
  return click.id;
}

// Grava contato + mensagem pro client_id já resolvido. Compartilhado pelo webhook
// oficial da Cloud API (whatsappWebhookController.js) e pela conexão Baileys
// (baileysClient.js) -- os dois so precisam descobrir o client_id de jeitos
// diferentes antes de chamar isso.
export async function ingestWhatsAppEvent(clientId, event, deps = {}) {
  const dbImpl = deps.db || db;
  const broadcastFn = deps.broadcast || broadcast;
  // Pela Cloud API o ctwa_clid sempre vem; pelo Baileys o cartão do anúncio às vezes
  // traz só o id do anúncio. Qualquer um dos dois prova que veio de anúncio.
  const fromAd = Boolean(event.ctwaClid || event.adId);

  const { rows: contactRows } = await dbImpl.query(
    `INSERT INTO whatsapp_contacts (client_id, wa_id, profile_name, ctwa_clid, ad_id, ad_headline, ad_body, source, last_message_at, ad_source_url, ad_referral_json, tracking_method)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (client_id, wa_id) DO UPDATE SET
       profile_name = COALESCE(excluded.profile_name, whatsapp_contacts.profile_name),
       ctwa_clid = COALESCE(whatsapp_contacts.ctwa_clid, excluded.ctwa_clid),
       ad_id = COALESCE(whatsapp_contacts.ad_id, excluded.ad_id),
       ad_headline = COALESCE(whatsapp_contacts.ad_headline, excluded.ad_headline),
       ad_body = COALESCE(whatsapp_contacts.ad_body, excluded.ad_body),
       ad_source_url = COALESCE(whatsapp_contacts.ad_source_url, excluded.ad_source_url),
       ad_referral_json = COALESCE(whatsapp_contacts.ad_referral_json, excluded.ad_referral_json),
       tracking_method = COALESCE(whatsapp_contacts.tracking_method, excluded.tracking_method),
       source = CASE WHEN whatsapp_contacts.source = 'ad' THEN 'ad' ELSE excluded.source END,
       last_message_at = excluded.last_message_at
     RETURNING id, (xmax = 0) AS inserted`,
    [
      clientId,
      event.waId,
      event.profileName,
      event.ctwaClid,
      event.adId,
      event.adHeadline,
      event.adBody,
      fromAd ? 'ad' : 'organic',
      event.sentAt,
      event.adSourceUrl || null,
      event.referral ? JSON.stringify(event.referral) : null,
      fromAd ? 'ctwa' : null
    ]
  );
  const contactId = contactRows[0].id;

  // Cliente só do Na Mesa (sem dashboard) não tem funil nem Link Rastreável.
  const { rows: flagRows } = await dbImpl.query(
    `SELECT name, dashboard_enabled, waitlist_enabled, reservations_enabled FROM clients WHERE id = ?`,
    [clientId]
  );
  const flags = flagRows[0] || {};
  const usesCrm = flags.dashboard_enabled !== false;

  // Antes de entrar no funil: se veio pelo Link Rastreável, a origem já fica certa pro
  // evento Lead que a entrada no funil pode disparar.
  if (usesCrm && event.direction === 'inbound') {
    await matchTrackingClick(dbImpl, { clientId, contactId, body: event.body });
  }

  // Contato novo entra no funil (etapa de "novo lead"). Quem já está numa etapa fica lá:
  // mensagem comum não move card -- só agendamento e venda (ver crmStages.js).
  if (usesCrm) {
    await moveToAutoStage(dbImpl, { clientId, contactId, event: 'novo_lead' });
  }

  const { rows: messageRows } = await dbImpl.query(
    `INSERT INTO whatsapp_messages (client_id, contact_id, direction, body, wa_message_id, sent_at, media_type, media_filename)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (wa_message_id) DO NOTHING
     RETURNING id`,
    [clientId, contactId, event.direction, event.body, event.waMessageId, event.sentAt, event.mediaType || null, event.filename || null]
  );

  // Só baixa a mídia se a mensagem acabou de ser gravada -- se o WhatsApp reenviou a
  // mesma mensagem (ON CONFLICT DO NOTHING não devolve linha), já foi baixada antes.
  if (messageRows.length > 0 && event.media?.download) {
    await storeMedia(dbImpl, clientId, contactId, messageRows[0].id, event.media);
  }

  // Robô da fila (Na Mesa): só mensagem recebida e nova -- reenvio do WhatsApp
  // (ON CONFLICT não devolve linha) não pode gerar resposta duplicada. Em segundo
  // plano: um erro no robô não pode derrubar a gravação da mensagem.
  // Grupo/lista de transmissão não é cliente na porta: o id deles não é um telefone.
  const isPhone = /^\d{8,15}$/.test(String(event.waId || ''));
  if (event.direction === 'inbound' && isPhone && flags.waitlist_enabled && messageRows.length > 0) {
    const onInbound = deps.onInbound || handleInboundForWaitlist;
    Promise.resolve()
      .then(() => onInbound(
        { clientId, contactId, waId: event.waId, profileName: event.profileName, body: event.body },
        deps.db ? { db: dbImpl } : {}
      ))
      .catch((error) => console.error('Na Mesa: erro no robô da fila:', error.message));
  }

  // Robô de reserva: mesmas regras do robô da fila (recebida, nova, de telefone).
  if (event.direction === 'inbound' && isPhone && flags.reservations_enabled && messageRows.length > 0) {
    const onReservation = deps.onReservation || handleInboundForReservation;
    Promise.resolve()
      .then(() => onReservation(
        {
          clientId, contactId, waId: event.waId, profileName: event.profileName, body: event.body,
          fromAd, isNewContact: Boolean(contactRows[0].inserted), restaurantName: flags.name || ''
        },
        deps.db ? { db: dbImpl } : {}
      ))
      .catch((error) => console.error('Reservas: erro no robô de reserva:', error.message));
  }

  // Alguém da equipe respondeu direto pelo celular (Baileys entrega essa mensagem
  // também): igual no WhatsApp, responder conta como ter lido a conversa.
  if (event.direction === 'outbound') {
    await dbImpl.query(`UPDATE whatsapp_contacts SET last_read_at = CURRENT_TIMESTAMP WHERE id = ?`, [contactId]);
  }

  // Mensagem de saída que ainda não estava gravada é de um atendente (pelo celular ou
  // pelo Caixa, cujo eco às vezes chega antes da gravação): pausa o robô de reserva.
  // As do robô já foram gravadas antes do envio e caem no ON CONFLICT (whatsappSender.js).
  if (event.direction === 'outbound' && messageRows.length > 0 && flags.reservations_enabled) {
    try {
      // Saudação/ausência automática do WhatsApp Business sai segundos depois da mensagem
      // do cliente; gente não responde tão rápido. Essa não é atendente assumindo.
      const { rows: lastIn } = await dbImpl.query(
        `SELECT sent_at FROM whatsapp_messages WHERE contact_id = ? AND direction = 'inbound'
         ORDER BY sent_at DESC LIMIT 1`,
        [contactId]
      );
      const sinceInbound = lastIn[0] ? new Date(event.sentAt).getTime() - new Date(lastIn[0].sent_at).getTime() : Infinity;
      if (sinceInbound >= AUTO_REPLY_WINDOW_MS) await (deps.pauseBot || pauseBot)(dbImpl, { clientId, contactId });
    } catch (error) {
      console.error('Reservas: erro ao pausar o robô:', error.message);
    }
  }

  broadcastFn(clientId, 'message', {
    contactId,
    direction: event.direction,
    body: event.body,
    sentAt: event.sentAt
  });

  return contactId;
}
