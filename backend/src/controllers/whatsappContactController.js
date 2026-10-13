import db from '../config/db.js';
import { classifyOrigin } from '../services/whatsappOrigin.js';
import { resolveAd } from '../services/metaAdResolver.js';

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

const ATTRIBUTION_SQL = `
  SELECT wc.source, wc.tracking_method, wc.ad_id, wc.ad_headline, wc.ad_body, wc.ad_source_url,
         wc.first_seen_at, c.ad_name, c.adset_name, c.campaign_name, c.account_name,
         tl.name AS link_name, tc.utm_source, tc.utm_medium, tc.utm_campaign, tc.utm_content, tc.utm_term,
         tc.fbclid, tc.gclid, tc.created_at AS clicked_at,
         (SELECT body FROM whatsapp_messages m
           WHERE m.contact_id = wc.id AND m.direction = 'inbound'
           ORDER BY m.sent_at ASC LIMIT 1) AS initial_message
  FROM whatsapp_contacts wc
  LEFT JOIN meta_ad_cache c ON c.ad_id = wc.ad_id
  LEFT JOIN tracking_clicks tc ON tc.id = wc.tracking_click_id
  LEFT JOIN tracking_links tl ON tl.id = tc.link_id
  WHERE wc.id = ? AND wc.client_id = ?`;

export async function getContactAttribution(req, res) {
  try {
    const clientId = resolveClientId(req);
    const { contactId } = req.params;
    if (!clientId) {
      return res.status(400).json({ error: 'ID do cliente é obrigatório.' });
    }

    let { rows } = await db.query(ATTRIBUTION_SQL, [contactId, clientId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Contato não encontrado.' });
    }

    // Anúncio ainda não resolvido (falha anterior, ou chegou antes do cache existir):
    // tenta agora, uma vez, antes de responder.
    if (rows[0].ad_id && !rows[0].campaign_name) {
      await resolveAd({ adId: rows[0].ad_id, clientId });
      ({ rows } = await db.query(ATTRIBUTION_SQL, [contactId, clientId]));
    }

    const r = rows[0];
    return res.json({
      origin: classifyOrigin({ source: r.source }),
      trackingMethod: r.tracking_method,
      accountName: r.account_name,
      campaignName: r.campaign_name,
      adsetName: r.adset_name,
      adName: r.ad_name,
      adId: r.ad_id,
      adHeadline: r.ad_headline,
      adBody: r.ad_body,
      adSourceUrl: r.ad_source_url,
      initialMessage: r.initial_message,
      firstSeenAt: r.first_seen_at,
      link: r.link_name ? {
        name: r.link_name,
        clickedAt: r.clicked_at,
        utmSource: r.utm_source,
        utmMedium: r.utm_medium,
        utmCampaign: r.utm_campaign,
        utmContent: r.utm_content,
        utmTerm: r.utm_term,
        hasFbclid: Boolean(r.fbclid),
        hasGclid: Boolean(r.gclid)
      } : null
    });
  } catch (error) {
    console.error('Get contact attribution error:', error);
    return res.status(500).json({ error: 'Erro ao buscar origem do contato.' });
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
