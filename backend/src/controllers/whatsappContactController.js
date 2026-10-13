import db from '../config/db.js';
import { isValidManualStage } from '../services/whatsappStage.js';

function resolveClientId(req) {
  return req.user.role === 'admin'
    ? (req.query.clientId || req.body.clientId || req.user.clientId)
    : req.user.clientId;
}

export async function setContactNotes(req, res) {
  try {
    const clientId = resolveClientId(req);
    const { contactId } = req.params;
    const { notes } = req.body;

    if (!clientId) {
      return res.status(400).json({ error: 'ID do cliente é obrigatório.' });
    }

    const { rows } = await db.query(
      `UPDATE whatsapp_contacts SET notes = ? WHERE id = ? AND client_id = ? RETURNING id`,
      [notes || null, contactId, clientId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Contato não encontrado.' });
    }

    return res.json({ message: 'Anotação salva com sucesso!' });
  } catch (error) {
    console.error('Set contact notes error:', error);
    return res.status(500).json({ error: 'Erro ao salvar anotação.' });
  }
}

export async function getContactTimeline(req, res) {
  try {
    const clientId = resolveClientId(req);
    const { contactId } = req.params;

    if (!clientId) {
      return res.status(400).json({ error: 'ID do cliente é obrigatório.' });
    }

    const { rows: contactRows } = await db.query(
      `SELECT id, appointment_at FROM whatsapp_contacts WHERE id = ? AND client_id = ?`,
      [contactId, clientId]
    );
    if (contactRows.length === 0) {
      return res.status(404).json({ error: 'Contato não encontrado.' });
    }
    const contact = contactRows[0];

    const { rows: messageRows } = await db.query(
      `SELECT direction, body, sent_at FROM whatsapp_messages WHERE contact_id = ? ORDER BY sent_at DESC`,
      [contactId]
    );
    const { rows: saleRows } = await db.query(
      `SELECT id, amount_spent, created_at FROM real_conversions WHERE contact_id = ? ORDER BY created_at DESC`,
      [contactId]
    );

    const events = [
      ...messageRows.map((m) => ({ type: 'message', occurredAt: m.sent_at, direction: m.direction, body: m.body })),
      ...saleRows.map((s) => ({ type: 'sale', id: s.id, occurredAt: s.created_at, amountSpent: s.amount_spent }))
    ];
    if (contact.appointment_at) {
      events.push({ type: 'appointment', occurredAt: contact.appointment_at });
    }

    events.sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt));

    return res.json({ events });
  } catch (error) {
    console.error('Get contact timeline error:', error);
    return res.status(500).json({ error: 'Erro ao buscar histórico.' });
  }
}

export async function deleteContact(req, res) {
  try {
    const clientId = resolveClientId(req);
    const { contactId } = req.params;

    if (!clientId) {
      return res.status(400).json({ error: 'ID do cliente é obrigatório.' });
    }

    const { rows } = await db.query(
      `DELETE FROM whatsapp_contacts WHERE id = ? AND client_id = ? RETURNING id`,
      [contactId, clientId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Contato não encontrado.' });
    }

    return res.json({ message: 'Contato removido com sucesso!' });
  } catch (error) {
    console.error('Delete contact error:', error);
    return res.status(500).json({ error: 'Erro ao remover contato.' });
  }
}

export async function setContactStage(req, res) {
  try {
    const clientId = resolveClientId(req);
    const { contactId } = req.params;
    const { stage } = req.body;

    if (!clientId) {
      return res.status(400).json({ error: 'ID do cliente é obrigatório.' });
    }
    if (!isValidManualStage(stage)) {
      return res.status(400).json({ error: 'stage deve ser uma etapa válida do funil, ou null para voltar ao automático.' });
    }

    const manualStage = stage || null;
    const { rows } = await db.query(
      `UPDATE whatsapp_contacts
       SET manual_stage = ?, manual_stage_set_at = ?
       WHERE id = ? AND client_id = ?
       RETURNING id`,
      [manualStage, manualStage ? new Date().toISOString() : null, contactId, clientId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Contato não encontrado.' });
    }

    return res.json({ message: 'Etapa atualizada com sucesso!' });
  } catch (error) {
    console.error('Set contact stage error:', error);
    return res.status(500).json({ error: 'Erro ao atualizar etapa.' });
  }
}
