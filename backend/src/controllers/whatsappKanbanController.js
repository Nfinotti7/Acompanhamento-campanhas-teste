import db from '../config/db.js';
import { computeStage } from '../services/whatsappStage.js';

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

    const { rows: settingsRows } = await db.query(
      'SELECT remarketing_days FROM whatsapp_settings WHERE client_id = ?',
      [clientId]
    );
    const remarketingDays = settingsRows[0]?.remarketing_days ?? 3;

    const { rows } = await db.query(
      `SELECT
         wc.id, wc.wa_id, wc.profile_name, wc.source, wc.ad_headline,
         wc.appointment_at, wc.first_seen_at, wc.manual_stage,
         EXISTS(SELECT 1 FROM real_conversions rc WHERE rc.contact_id = wc.id) AS has_conversion,
         EXISTS(SELECT 1 FROM whatsapp_messages wm WHERE wm.contact_id = wc.id AND wm.direction = 'outbound') AS has_outbound,
         (SELECT MAX(sent_at) FROM whatsapp_messages wm2 WHERE wm2.contact_id = wc.id) AS last_message_at
       FROM whatsapp_contacts wc
       WHERE wc.client_id = ?
       ORDER BY wc.id DESC`,
      [clientId]
    );

    const now = new Date();
    const contacts = rows.map((r) => ({
      id: r.id,
      wa_id: r.wa_id,
      profile_name: r.profile_name,
      source: r.source,
      ad_headline: r.ad_headline,
      appointment_at: r.appointment_at,
      manual_stage: r.manual_stage,
      stage: r.manual_stage || computeStage({
        hasConversion: r.has_conversion,
        appointmentAt: r.appointment_at,
        hasOutbound: r.has_outbound,
        lastActivityAt: r.last_message_at || r.first_seen_at,
        remarketingDays,
        now
      })
    }));

    return res.json({ contacts });
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
      `UPDATE whatsapp_contacts SET appointment_at = ? WHERE id = ? AND client_id = ? RETURNING id`,
      [parsedAppointment, contactId, clientId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Contato não encontrado.' });
    }

    return res.json({ message: 'Agendamento salvo com sucesso!' });
  } catch (error) {
    console.error('Set WhatsApp appointment error:', error);
    return res.status(500).json({ error: 'Erro ao salvar agendamento.' });
  }
}
