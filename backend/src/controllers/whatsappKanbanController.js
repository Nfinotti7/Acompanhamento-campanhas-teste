import db from '../config/db.js';
import { ensureStages, effectiveStageId, cardValue, moveToAutoStage } from '../services/crmStages.js';

function resolveClientId(req) {
  return req.user.role === 'admin'
    ? (req.query.clientId || req.body.clientId || req.user.clientId)
    : req.user.clientId;
}

export async function getKanban(req, res) {
  try {
    const clientId = resolveClientId(req);
    if (!clientId) {
      return res.status(400).json({ error: 'ID do cliente é obrigatório.' });
    }

    await ensureStages(db, clientId);
    const { rows: stages } = await db.query(
      `SELECT id, name, color, position, auto_event FROM crm_stages WHERE client_id = ? ORDER BY position, id`,
      [clientId]
    );

    const { rows } = await db.query(
      `SELECT
         wc.id, wc.wa_id, wc.profile_name, wc.source, wc.ad_headline, wc.notes,
         wc.appointment_at, wc.profile_pic_media_id, wc.stage_id, wc.deal_value, wc.responsible_id,
         tm.name AS responsible_name,
         (SELECT COALESCE(SUM(amount_spent), 0) FROM real_conversions rc WHERE rc.contact_id = wc.id) AS sales_total,
         COALESCE((SELECT array_agg(tag_id) FROM whatsapp_contact_tags t WHERE t.contact_id = wc.id), '{}') AS tag_ids
       FROM whatsapp_contacts wc
       LEFT JOIN crm_team_members tm ON tm.id = wc.responsible_id
       WHERE wc.client_id = ?
       ORDER BY wc.last_message_at DESC NULLS LAST, wc.id DESC`,
      [clientId]
    );

    const contacts = rows.map((r) => ({
      id: r.id,
      wa_id: r.wa_id,
      profile_name: r.profile_name,
      source: r.source,
      ad_headline: r.ad_headline,
      notes: r.notes,
      appointment_at: r.appointment_at,
      profile_pic_media_id: r.profile_pic_media_id,
      stage_id: effectiveStageId(r.stage_id, stages),
      deal_value: r.deal_value == null ? null : Number(r.deal_value),
      sales_total: Number(r.sales_total),
      value: cardValue({ dealValue: r.deal_value, salesTotal: r.sales_total }),
      responsible_id: r.responsible_id,
      responsible_name: r.responsible_name,
      tag_ids: r.tag_ids
    }));

    return res.json({ stages, contacts });
  } catch (error) {
    console.error('Get WhatsApp kanban error:', error);
    return res.status(500).json({ error: 'Erro ao montar o funil de WhatsApp.' });
  }
}

export async function getAgenda(req, res) {
  try {
    const clientId = resolveClientId(req);
    const { date } = req.query;
    if (!clientId || !date) {
      return res.status(400).json({ error: 'clientId e date são obrigatórios.' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'date deve estar no formato YYYY-MM-DD.' });
    }

    // Compara o dia no fuso do restaurante (America/Sao_Paulo), não no fuso do servidor/sessão —
    // appointment_at é um instante absoluto (TIMESTAMPTZ); sem isso, agendamentos no fim da noite
    // caem no dia errado da agenda.
    const { rows } = await db.query(
      `SELECT id, wa_id, profile_name, appointment_at
       FROM whatsapp_contacts
       WHERE client_id = ?
         AND (appointment_at AT TIME ZONE 'America/Sao_Paulo')::date = ?::date
       ORDER BY appointment_at ASC`,
      [clientId, date]
    );

    return res.json({ appointments: rows });
  } catch (error) {
    console.error('Get WhatsApp agenda error:', error);
    return res.status(500).json({ error: 'Erro ao buscar agenda.' });
  }
}

export async function setAppointment(req, res) {
  try {
    const clientId = resolveClientId(req);
    const { contactId } = req.params;
    const { appointmentAt } = req.body;

    if (!clientId) {
      return res.status(400).json({ error: 'ID do cliente é obrigatório.' });
    }

    let parsedAppointment = null;
    if (appointmentAt) {
      const parsed = new Date(appointmentAt);
      if (Number.isNaN(parsed.getTime())) {
        return res.status(400).json({ error: 'appointmentAt inválido.' });
      }
      parsedAppointment = parsed.toISOString();
    }

    const { rows } = await db.query(
      `UPDATE whatsapp_contacts
       SET appointment_at = ?
       WHERE id = ? AND client_id = ? RETURNING id`,
      [parsedAppointment, contactId, clientId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Contato não encontrado.' });
    }

    if (parsedAppointment) {
      await moveToAutoStage(db, { clientId, contactId, event: 'agendado' });
    }

    return res.json({ message: 'Agendamento salvo com sucesso!' });
  } catch (error) {
    console.error('Set WhatsApp appointment error:', error);
    return res.status(500).json({ error: 'Erro ao salvar agendamento.' });
  }
}
