import db from '../config/db.js';

export async function trackEvent(req, res) {
  try {
    const {
      client_id = 1,
      event_name,
      page_url,
      utm_source,
      utm_medium,
      utm_campaign,
      gclid,
      fbclid,
      lead_email
    } = req.body;

    if (!event_name) {
      return res.status(400).json({ error: 'event_name é obrigatório.' });
    }

    await db.query(
      `INSERT INTO attribution_events (client_id, event_name, page_url, utm_source, utm_medium, utm_campaign, gclid, fbclid, lead_email, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        client_id,
        event_name,
        page_url || null,
        utm_source || 'direct',
        utm_medium || null,
        utm_campaign || null,
        gclid || null,
        fbclid || null,
        lead_email || null
      ]
    );

    return res.json({ success: true, message: 'Evento de rastreamento gravado.' });
  } catch (error) {
    console.error('Track event error:', error);
    return res.status(500).json({ error: 'Erro ao gravar evento de rastreamento.' });
  }
}

export async function getAttributionReport(req, res) {
  try {
    let clientId = req.query.clientId ? Number(req.query.clientId) : req.user.clientId;
    if (req.user.role !== 'admin' && clientId !== req.user.clientId) {
      clientId = req.user.clientId;
    }

    let whereClauses = [];
    let params = [];

    if (clientId) {
      whereClauses.push('client_id = ?');
      params.push(clientId);
    }

    const whereSql = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    // 1. Source Attribution Count
    const { rows: sources } = await db.query(`
      SELECT COALESCE(utm_source, 'direto/organico') as source, COUNT(*) as event_count
      FROM attribution_events
      ${whereSql}
      GROUP BY source
      ORDER BY event_count DESC
    `, params);

    // 2. Campaign Attribution Count
    const { rows: campaigns } = await db.query(`
      SELECT COALESCE(utm_campaign, 'sem_campanha') as campaign, utm_source as source, COUNT(*) as total_events
      FROM attribution_events
      ${whereSql}
      GROUP BY campaign, utm_source
      ORDER BY total_events DESC
      LIMIT 10
    `, params);

    // 3. Event Funnel (page_view -> lead_form_submit -> purchase)
    const { rows: funnel } = await db.query(`
      SELECT event_name, COUNT(*) as count
      FROM attribution_events
      ${whereSql}
      GROUP BY event_name
      ORDER BY count DESC
    `, params);

    return res.json({
      sources,
      campaigns,
      funnel
    });
  } catch (error) {
    console.error('Attribution report error:', error);
    return res.status(500).json({ error: 'Erro ao gerar relatório de atribuição.' });
  }
}
