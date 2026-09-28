import db from '../config/db.js';
import { sendWhatsAppMessage } from '../services/metaWhatsAppApi.js';

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

    const { rows } = await db.query(
      `SELECT id, wa_id, profile_name, source, ad_headline, last_message_at,
              (SELECT MIN(sent_at) FROM whatsapp_messages WHERE contact_id = whatsapp_contacts.id AND direction = 'inbound') as first_inbound_at,
              (SELECT MIN(sent_at) FROM whatsapp_messages WHERE contact_id = whatsapp_contacts.id AND direction = 'outbound') as first_outbound_at
       FROM whatsapp_contacts
       WHERE client_id = ?
       ORDER BY last_message_at DESC NULLS LAST
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
      'SELECT id, direction, body, sent_at FROM whatsapp_messages WHERE contact_id = ? AND client_id = ? ORDER BY sent_at ASC',
      [contactId, clientId]
    );

    return res.json({ messages: rows });
  } catch (error) {
    console.error('Get messages error:', error);
    return res.status(500).json({ error: 'Erro ao buscar mensagens.' });
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

    const { rows: contactRows } = await db.query(
      'SELECT wa_id FROM whatsapp_contacts WHERE id = ? AND client_id = ?',
      [contactId, clientId]
    );
    const contact = contactRows[0];
    if (!contact) {
      return res.status(404).json({ error: 'Contato não encontrado.' });
    }

    const { rows: settingsRows } = await db.query(
      'SELECT phone_number_id, access_token FROM whatsapp_settings WHERE client_id = ?',
      [clientId]
    );
    const settings = settingsRows[0];
    if (!settings) {
      return res.status(400).json({ error: 'WhatsApp não configurado para este cliente.' });
    }

    const sendResult = await sendWhatsAppMessage({
      phoneNumberId: settings.phone_number_id,
      accessToken: settings.access_token,
      to: contact.wa_id,
      body
    });

    const waMessageId = sendResult?.messages?.[0]?.id || null;

    await db.query(
      `INSERT INTO whatsapp_messages (client_id, contact_id, direction, body, wa_message_id, sent_at)
       VALUES (?, ?, 'outbound', ?, ?, CURRENT_TIMESTAMP)`,
      [clientId, contactId, body, waMessageId]
    );

    return res.json({ message: 'Mensagem enviada.' });
  } catch (error) {
    console.error('Reply to conversation error:', error);
    return res.status(500).json({ error: 'Erro ao enviar mensagem.' });
  }
}
