import db from '../config/db.js';

export function captureLead(req, res) {
  try {
    const {
      client_id,
      name,
      email,
      phone,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      gclid,
      fbclid,
      conversion_value = 0,
      custom_data
    } = req.body;

    // Use default client_id 1 if not passed in public endpoint payload
    const targetClientId = client_id || 1;

    if (!email && !phone && !name) {
      return res.status(400).json({ error: 'Forneça ao menos e-mail, telefone ou nome para registrar a captura.' });
    }

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';

    const stmt = db.prepare(`
      INSERT INTO leads (client_id, name, email, phone, source, medium, campaign, content, gclid, fbclid, ip, conversion_value, custom_data, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    const result = stmt.run(
      targetClientId,
      name || null,
      email || null,
      phone || null,
      utm_source || 'direct',
      utm_medium || null,
      utm_campaign || null,
      utm_content || null,
      gclid || null,
      fbclid || null,
      ip,
      Number(conversion_value),
      custom_data ? JSON.stringify(custom_data) : null
    );

    // Also record an attribution event
    if (email) {
      const attrStmt = db.prepare(`
        INSERT INTO attribution_events (client_id, event_name, page_url, utm_source, utm_medium, utm_campaign, gclid, fbclid, lead_email, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);
      attrStmt.run(
        targetClientId,
        'lead_captured',
        req.headers['referer'] || 'webhook',
        utm_source || 'direct',
        utm_medium || null,
        utm_campaign || null,
        gclid || null,
        fbclid || null,
        email
      );
    }

    return res.status(201).json({
      success: true,
      message: 'Lead capturado com sucesso para a lista de remarketing!',
      leadId: result.lastInsertRowid
    });
  } catch (error) {
    console.error('Capture lead error:', error);
    return res.status(500).json({ error: 'Erro ao registrar captura de lead.' });
  }
}

export function listLeads(req, res) {
  try {
    let clientId = req.query.clientId ? Number(req.query.clientId) : req.user.clientId;
    if (req.user.role !== 'admin' && clientId !== req.user.clientId) {
      clientId = req.user.clientId;
    }

    const { search, source } = req.query;

    let whereClauses = [];
    let params = [];

    if (clientId) {
      whereClauses.push('l.client_id = ?');
      params.push(clientId);
    }

    if (source && source !== 'all') {
      whereClauses.push('l.source = ?');
      params.push(source);
    }

    if (search) {
      whereClauses.push('(l.name LIKE ? OR l.email LIKE ? OR l.phone LIKE ? OR l.campaign LIKE ?)');
      const term = `%${search}%`;
      params.push(term, term, term, term);
    }

    const whereSql = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    const query = `
      SELECT l.*, c.name as client_name 
      FROM leads l
      JOIN clients c ON l.client_id = c.id
      ${whereSql}
      ORDER BY l.created_at DESC
      LIMIT 200
    `;

    const leads = db.prepare(query).all(...params);

    return res.json({ leads });
  } catch (error) {
    console.error('List leads error:', error);
    return res.status(500).json({ error: 'Erro ao listar capturas.' });
  }
}

export function exportRemarketingCSV(req, res) {
  try {
    let clientId = req.query.clientId ? Number(req.query.clientId) : req.user.clientId;
    if (req.user.role !== 'admin' && clientId !== req.user.clientId) {
      clientId = req.user.clientId;
    }

    const platform = req.query.platform || 'all'; // google, meta, or all

    let whereClauses = [];
    let params = [];

    if (clientId) {
      whereClauses.push('client_id = ?');
      params.push(clientId);
    }

    if (platform === 'google') {
      whereClauses.push('(source = "google" OR gclid IS NOT NULL)');
    } else if (platform === 'meta') {
      whereClauses.push('(source = "meta" OR fbclid IS NOT NULL)');
    }

    const whereSql = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    const leads = db.prepare(`SELECT name, email, phone, source, campaign, gclid, fbclid, created_at FROM leads ${whereSql} ORDER BY created_at DESC`).all(...params);

    // Build CSV content
    let csvLines = ['Email,Phone,FirstName,LastName,Source,Campaign,GCLID,FBCLID,CreatedAt'];

    leads.forEach(l => {
      const parts = (l.name || '').split(' ');
      const firstName = parts[0] || '';
      const lastName = parts.slice(1).join(' ') || '';
      const email = l.email || '';
      const phone = l.phone || '';
      const source = l.source || '';
      const campaign = `"${(l.campaign || '').replace(/"/g, '""')}"`;
      const gclid = l.gclid || '';
      const fbclid = l.fbclid || '';
      const created = l.created_at || '';

      csvLines.push(`${email},${phone},${firstName},${lastName},${source},${campaign},${gclid},${fbclid},${created}`);
    });

    const csvData = csvLines.join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="lista_remarketing_${platform}_${Date.now()}.csv"`);
    return res.send(csvData);
  } catch (error) {
    console.error('Export CSV error:', error);
    return res.status(500).json({ error: 'Erro ao gerar arquivo de remarketing.' });
  }
}
