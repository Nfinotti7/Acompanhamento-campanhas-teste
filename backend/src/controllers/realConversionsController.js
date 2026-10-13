import db from '../config/db.js';
import { computeRoi } from '../utils/whatsappRoi.js';
import { resolveDateRange } from './campaignController.js';
import { moveToAutoStage } from '../services/crmStages.js';

function resolveClientId(req) {
  return req.user.role === 'admin'
    ? (req.query.clientId || req.body.clientId || req.user.clientId)
    : req.user.clientId;
}

export async function searchContacts(req, res) {
  try {
    const clientId = resolveClientId(req);
    const q = (req.query.q || '').trim();

    if (!clientId || !q) {
      return res.json({ contacts: [] });
    }

    const term = `%${q}%`;
    const { rows } = await db.query(
      `SELECT id, wa_id, profile_name, source, ad_headline, profile_pic_media_id
       FROM whatsapp_contacts
       WHERE client_id = ? AND (profile_name ILIKE ? OR wa_id ILIKE ?)
       ORDER BY last_message_at DESC NULLS LAST
       LIMIT 20`,
      [clientId, term, term]
    );

    return res.json({ contacts: rows });
  } catch (error) {
    console.error('Search contacts error:', error);
    return res.status(500).json({ error: 'Erro ao buscar contatos.' });
  }
}

export async function createConversion(req, res) {
  try {
    const clientId = resolveClientId(req);
    const { contactId, customerName, phone, amountSpent, matchedBy } = req.body;

    if (!clientId || !customerName || amountSpent == null) {
      return res.status(400).json({ error: 'customerName e amountSpent são obrigatórios.' });
    }

    if (!['phone', 'name', 'manual'].includes(matchedBy)) {
      return res.status(400).json({ error: 'matchedBy deve ser phone, name ou manual.' });
    }

    const { rows } = await db.query(
      `INSERT INTO real_conversions (client_id, contact_id, customer_name, phone, amount_spent, matched_by)
       VALUES (?, ?, ?, ?, ?, ?)
       RETURNING id`,
      [clientId, contactId || null, customerName, phone || null, Number(amountSpent), matchedBy]
    );

    if (contactId) {
      await moveToAutoStage(db, { clientId, contactId, event: 'venda' });
    }

    return res.status(201).json({ message: 'Conversão registrada com sucesso!', id: rows[0].id });
  } catch (error) {
    console.error('Create conversion error:', error);
    return res.status(500).json({ error: 'Erro ao registrar conversão.' });
  }
}

export async function updateConversion(req, res) {
  try {
    const clientId = resolveClientId(req);
    const { conversionId } = req.params;
    const { amountSpent } = req.body;

    if (!clientId) {
      return res.status(400).json({ error: 'ID do cliente é obrigatório.' });
    }
    if (amountSpent == null || Number.isNaN(Number(amountSpent)) || Number(amountSpent) < 0) {
      return res.status(400).json({ error: 'amountSpent deve ser um número válido maior ou igual a zero.' });
    }

    const { rows } = await db.query(
      `UPDATE real_conversions SET amount_spent = ? WHERE id = ? AND client_id = ? RETURNING id`,
      [Number(amountSpent), conversionId, clientId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Venda não encontrada.' });
    }

    return res.json({ message: 'Valor atualizado com sucesso!' });
  } catch (error) {
    console.error('Update conversion error:', error);
    return res.status(500).json({ error: 'Erro ao atualizar venda.' });
  }
}

export async function deleteConversion(req, res) {
  try {
    const clientId = resolveClientId(req);
    const { conversionId } = req.params;

    if (!clientId) {
      return res.status(400).json({ error: 'ID do cliente é obrigatório.' });
    }

    const { rows } = await db.query(
      `DELETE FROM real_conversions WHERE id = ? AND client_id = ? RETURNING id`,
      [conversionId, clientId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Venda não encontrada.' });
    }

    return res.json({ message: 'Venda removida com sucesso!' });
  } catch (error) {
    console.error('Delete conversion error:', error);
    return res.status(500).json({ error: 'Erro ao remover venda.' });
  }
}

export async function getRoi(req, res) {
  try {
    const clientId = resolveClientId(req);
    if (!clientId) {
      return res.status(400).json({ error: 'ID do cliente é obrigatório.' });
    }

    const { startStr, endStr } = resolveDateRange({ range: req.query.range });

    const { rows: spendRows } = await db.query(
      `SELECT COALESCE(SUM(spend), 0) as total_spend
       FROM daily_metrics
       WHERE client_id = ? AND platform = 'meta' AND date >= ? AND date <= ?`,
      [clientId, startStr, endStr]
    );

    const { rows: conversionRows } = await db.query(
      `SELECT contact_id, amount_spent
       FROM real_conversions
       WHERE client_id = ? AND created_at::date >= ? AND created_at::date <= ?`,
      [clientId, startStr, endStr]
    );

    const roi = computeRoi({
      adSpend: spendRows[0].total_spend,
      conversions: conversionRows.map((c) => ({ contactId: c.contact_id, amountSpent: c.amount_spent }))
    });

    return res.json({ roi });
  } catch (error) {
    console.error('Get WhatsApp ROI error:', error);
    return res.status(500).json({ error: 'Erro ao calcular ROI.' });
  }
}
