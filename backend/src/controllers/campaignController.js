import db from '../config/db.js';

export function getMetricsSummary(req, res) {
  try {
    let clientId = req.query.clientId ? Number(req.query.clientId) : req.user.clientId;
    if (req.user.role !== 'admin' && clientId !== req.user.clientId) {
      clientId = req.user.clientId;
    }

    const { platform = 'all', startDate, endDate, range = '30d' } = req.query;

    // Calculate dates
    let startStr = startDate;
    let endStr = endDate;

    if (!startStr || !endStr) {
      const today = new Date();
      const end = new Date(today);
      const start = new Date(today);

      if (range === '7d') {
        start.setDate(today.getDate() - 7);
      } else if (range === '30d') {
        start.setDate(today.getDate() - 30);
      } else if (range === 'this_month') {
        start.setDate(1);
      } else if (range === 'today') {
        // keep start = today
      }

      startStr = start.toISOString().split('T')[0];
      endStr = end.toISOString().split('T')[0];
    }

    // Build query conditions
    let whereClauses = ['date >= ?', 'date <= ?'];
    let params = [startStr, endStr];

    if (clientId) {
      whereClauses.push('client_id = ?');
      params.push(clientId);
    }

    if (platform && platform !== 'all') {
      whereClauses.push('platform = ?');
      params.push(platform);
    }

    const whereSql = whereClauses.join(' AND ');

    // 1. Overall Aggregates
    const summaryQuery = `
      SELECT 
        COALESCE(SUM(spend), 0) as total_spend,
        COALESCE(SUM(clicks), 0) as total_clicks,
        COALESCE(SUM(impressions), 0) as total_impressions,
        COALESCE(SUM(conversions), 0) as total_conversions,
        COALESCE(SUM(conversion_value), 0) as total_conversion_value
      FROM daily_metrics
      WHERE ${whereSql}
    `;

    const totals = db.prepare(summaryQuery).get(...params);

    const ctr = totals.total_impressions > 0 ? (totals.total_clicks / totals.total_impressions) * 100 : 0;
    const cpc = totals.total_clicks > 0 ? totals.total_spend / totals.total_clicks : 0;
    const cpm = totals.total_impressions > 0 ? (totals.total_spend / totals.total_impressions) * 1000 : 0;
    const roas = totals.total_spend > 0 ? totals.total_conversion_value / totals.total_spend : 0;
    const cpa = totals.total_conversions > 0 ? totals.total_spend / totals.total_conversions : 0;

    // 2. Dynamic Daily Chart Data (Spend, Clicks, Conversions over time)
    const dailyQuery = `
      SELECT 
        date,
        SUM(spend) as spend,
        SUM(clicks) as clicks,
        SUM(impressions) as impressions,
        SUM(conversions) as conversions,
        SUM(conversion_value) as conversion_value
      FROM daily_metrics
      WHERE ${whereSql}
      GROUP BY date
      ORDER BY date ASC
    `;

    const dailyData = db.prepare(dailyQuery).all(...params);

    // 3. Platform Breakdown (Google vs Meta)
    let platformClauses = ['date >= ?', 'date <= ?'];
    let platformParams = [startStr, endStr];
    if (clientId) {
      platformClauses.push('client_id = ?');
      platformParams.push(clientId);
    }

    const platformBreakdownQuery = `
      SELECT 
        platform,
        SUM(spend) as spend,
        SUM(clicks) as clicks,
        SUM(conversions) as conversions,
        SUM(conversion_value) as conversion_value
      FROM daily_metrics
      WHERE ${platformClauses.join(' AND ')}
      GROUP BY platform
    `;

    const platformBreakdown = db.prepare(platformBreakdownQuery).all(...platformParams);

    return res.json({
      summary: {
        spend: Number(totals.total_spend.toFixed(2)),
        clicks: totals.total_clicks,
        impressions: totals.total_impressions,
        conversions: totals.total_conversions,
        conversion_value: Number(totals.total_conversion_value.toFixed(2)),
        ctr: Number(ctr.toFixed(2)),
        cpc: Number(cpc.toFixed(2)),
        cpm: Number(cpm.toFixed(2)),
        cpa: Number(cpa.toFixed(2)),
        roas: Number(roas.toFixed(2))
      },
      dailyData,
      platformBreakdown,
      dateRange: { start: startStr, end: endStr }
    });
  } catch (error) {
    console.error('Metrics summary error:', error);
    return res.status(500).json({ error: 'Erro ao calcular resumo de métricas.' });
  }
}

export function getCampaigns(req, res) {
  try {
    let clientId = req.query.clientId ? Number(req.query.clientId) : req.user.clientId;
    if (req.user.role !== 'admin' && clientId !== req.user.clientId) {
      clientId = req.user.clientId;
    }

    const { platform = 'all' } = req.query;

    let whereClauses = [];
    let params = [];

    if (clientId) {
      whereClauses.push('c.client_id = ?');
      params.push(clientId);
    }

    if (platform && platform !== 'all') {
      whereClauses.push('c.platform = ?');
      params.push(platform);
    }

    const whereSql = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    const query = `
      SELECT 
        c.*,
        cl.name as client_name,
        COALESCE(SUM(m.spend), 0) as total_spend,
        COALESCE(SUM(m.clicks), 0) as total_clicks,
        COALESCE(SUM(m.impressions), 0) as total_impressions,
        COALESCE(SUM(m.conversions), 0) as total_conversions,
        COALESCE(SUM(m.conversion_value), 0) as total_conversion_value
      FROM campaigns c
      JOIN clients cl ON c.client_id = cl.id
      LEFT JOIN daily_metrics m ON c.id = m.campaign_id
      ${whereSql}
      GROUP BY c.id
      ORDER BY total_spend DESC
    `;

    const campaigns = db.prepare(query).all(...params);

    const formatted = campaigns.map(c => {
      const ctr = c.total_impressions > 0 ? (c.total_clicks / c.total_impressions) * 100 : 0;
      const cpc = c.total_clicks > 0 ? c.total_spend / c.total_clicks : 0;
      const cpa = c.total_conversions > 0 ? c.total_spend / c.total_conversions : 0;
      const roas = c.total_spend > 0 ? c.total_conversion_value / c.total_spend : 0;

      return {
        ...c,
        ctr: Number(ctr.toFixed(2)),
        cpc: Number(cpc.toFixed(2)),
        cpa: Number(cpa.toFixed(2)),
        roas: Number(roas.toFixed(2))
      };
    });

    return res.json({ campaigns: formatted });
  } catch (error) {
    console.error('Get campaigns error:', error);
    return res.status(500).json({ error: 'Erro ao buscar campanhas.' });
  }
}

export function syncCampaigns(req, res) {
  try {
    const { clientId } = req.body;
    // Simulate real-time API sync logic
    return res.json({
      message: 'Sincronização com Google Ads API e Meta Graph API realizada com sucesso!',
      lastSync: new Date().toISOString()
    });
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao sincronizar campanhas.' });
  }
}
