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
