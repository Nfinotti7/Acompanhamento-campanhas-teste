import db from '../config/db.js';
import { sendToContact, SendError } from '../services/whatsappSender.js';
import { pauseBot } from '../services/botPause.js';
import { RelayError } from '../services/processRelay.js';

function resolveClientId(req) {
  return req.user.role === 'admin'
    ? (req.query.clientId || req.body.clientId || req.user.clientId)
    : req.user.clientId;
}

export async function listConversations(req, res) {
  try {
    const clientId = resolveClientId(req);
    if (!clientId) {
      return res.status(400).json({ error: 'ID do cliente é obrigatório.' });
    }

    // Não lidas = mensagens recebidas depois da última vez que alguém da equipe abriu a
    // conversa (last_read_at). created_at é gravado em UTC sem fuso, por isso a conversão.
    const { rows } = await db.query(
      `SELECT wc.id, wc.wa_id, wc.profile_name, wc.source, wc.ad_headline, wc.last_message_at, wc.profile_pic_media_id,
              wc.bot_paused_until,
              EXISTS (SELECT 1 FROM reservation_conversations rc WHERE rc.contact_id = wc.id AND rc.status = 'active') AS bot_active,
              (SELECT MIN(sent_at) FROM whatsapp_messages WHERE contact_id = wc.id AND direction = 'inbound') as first_inbound_at,
              (SELECT MIN(sent_at) FROM whatsapp_messages WHERE contact_id = wc.id AND direction = 'outbound') as first_outbound_at,
              (SELECT COUNT(*) FROM whatsapp_messages m
                WHERE m.contact_id = wc.id AND m.direction = 'inbound'
                  AND (wc.last_read_at IS NULL OR m.created_at > (wc.last_read_at AT TIME ZONE 'UTC'))) AS unread_count,
              lm.body AS last_body, lm.direction AS last_direction, lm.media_type AS last_media_type,
              lm.status AS last_status, lm.sent_at AS last_sent_at
       FROM whatsapp_contacts wc
       LEFT JOIN LATERAL (
         SELECT body, direction, media_type, status, sent_at FROM whatsapp_messages m
         WHERE m.contact_id = wc.id ORDER BY m.sent_at DESC, m.id DESC LIMIT 1
       ) lm ON true
       WHERE wc.client_id = ?
       ORDER BY wc.last_message_at DESC NULLS LAST
       LIMIT 100`,
      [clientId]
    );

    const conversations = rows.map((r) => ({
      ...r,
      responseTimeSeconds: r.first_inbound_at && r.first_outbound_at && new Date(r.first_outbound_at) > new Date(r.first_inbound_at)
        ? Math.round((new Date(r.first_outbound_at) - new Date(r.first_inbound_at)) / 1000)
        : null
    }));

    return res.json({ conversations });
  } catch (error) {
    console.error('List conversations error:', error);
    return res.status(500).json({ error: 'Erro ao listar conversas.' });
  }
}

export async function getMessages(req, res) {
  try {
    const clientId = resolveClientId(req);
    const { contactId } = req.params;

    const { rows } = await db.query(
      'SELECT id, direction, body, sent_at, media_id, media_type, media_filename, status FROM whatsapp_messages WHERE contact_id = ? AND client_id = ? ORDER BY sent_at ASC, id ASC',
      [contactId, clientId]
    );

    return res.json({ messages: rows });
  } catch (error) {
    console.error('Get messages error:', error);
    return res.status(500).json({ error: 'Erro ao buscar mensagens.' });
  }
}

// Zera as não lidas da conversa (caixa de entrada compartilhada: vale pra toda a equipe).
export async function markConversationRead(req, res) {
  try {
    const clientId = resolveClientId(req);
    const { contactId } = req.params;
    const { rows } = await db.query(
      `UPDATE whatsapp_contacts SET last_read_at = CURRENT_TIMESTAMP WHERE id = ? AND client_id = ? RETURNING id`,
      [contactId, clientId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Contato não encontrado.' });
    }
    return res.json({ ok: true });
  } catch (error) {
    console.error('Mark conversation read error:', error);
    return res.status(500).json({ error: 'Erro ao marcar conversa como lida.' });
  }
}

export async function replyToConversation(req, res) {
  try {
    const clientId = resolveClientId(req);
    const { contactId } = req.params;
    const { body } = req.body;

    if (!body) {
      return res.status(400).json({ error: 'Mensagem não pode ser vazia.' });
    }

    await sendToContact({ clientId, contactId, body, sentBy: 'staff' });
    // Atendente assumiu a conversa: o robô de reserva para (na Cloud API não há eco da
    // mensagem enviada, então o ingest não veria). Só onde reserva está ligada.
    const { rows } = await db.query(`SELECT reservations_enabled FROM clients WHERE id = ?`, [clientId]);
    if (rows[0]?.reservations_enabled) await pauseBot(db, { clientId, contactId });
    return res.json({ message: 'Mensagem enviada.' });
  } catch (error) {
    if (error instanceof SendError) {
      return res.status(error.httpStatus).json({ error: error.message });
    }
    console.error('Reply to conversation error:', error);
    // Veio do processo dono pela ponte: a mensagem já é legível (ex: "confira se saiu").
    if (error instanceof RelayError) return res.status(503).json({ error: error.message });
    return res.status(500).json({ error: 'Erro ao enviar mensagem.' });
  }
}
