import db from '../config/db.js';
import { syncClient } from '../services/syncService.js';

export async function getMetricsSummary(req, res) {
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

    const { rows: summaryRows } = await db.query(summaryQuery, params);
    const totals = summaryRows[0];

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

    const { rows: dailyData } = await db.query(dailyQuery, params);

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

    const { rows: platformBreakdown } = await db.query(platformBreakdownQuery, platformParams);

    return res.json({
      summary: {
        spend: Number(Number(totals.total_spend).toFixed(2)),
        clicks: totals.total_clicks,
        impressions: totals.total_impressions,
        conversions: totals.total_conversions,
        conversion_value: Number(Number(totals.total_conversion_value).toFixed(2)),
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

export async function getCampaigns(req, res) {
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
      GROUP BY c.id, cl.name
      ORDER BY total_spend DESC
    `;

    const { rows: campaigns } = await db.query(query, params);

    const formatted = campaigns.map(c => {
      const totalSpend = Number(c.total_spend);
      const totalClicks = Number(c.total_clicks);
      const totalImpressions = Number(c.total_impressions);
      const totalConversions = Number(c.total_conversions);
      const totalConversionValue = Number(c.total_conversion_value);

      const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
      const cpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
      const cpa = totalConversions > 0 ? totalSpend / totalConversions : 0;
      const roas = totalSpend > 0 ? totalConversionValue / totalSpend : 0;

      return {
        ...c,
        total_spend: totalSpend,
        total_clicks: totalClicks,
        total_impressions: totalImpressions,
        total_conversions: totalConversions,
        total_conversion_value: totalConversionValue,
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

export async function syncCampaigns(req, res) {
  try {
    const { clientId } = req.body;

    let targets;
    if (clientId) {
      const { rows } = await db.query('SELECT id, name FROM clients WHERE id = ?', [clientId]);
      if (!rows[0]) {
        return res.status(404).json({ error: 'Cliente não encontrado.' });
      }
      targets = rows;
    } else {
      const { rows } = await db.query('SELECT id, name FROM clients WHERE active = 1');
      targets = rows;
    }

    const results = [];
    for (const client of targets) {
      const { google, meta } = await syncClient(client.id);
      results.push({ clientId: client.id, clientName: client.name, google, meta });
    }

    const hasErrors = results.some((r) => r.google.status === 'error' || r.meta.status === 'error');

    return res.json({
      message: hasErrors
        ? 'Sincronização concluída com alertas. Veja os detalhes por cliente/plataforma.'
        : 'Sincronização com Google Ads API e Meta Graph API realizada com sucesso!',
      results,
      lastSync: new Date().toISOString()
    });
  } catch (error) {
    console.error('Sync campaigns error:', error);
    return res.status(500).json({ error: 'Erro ao sincronizar campanhas.' });
  }
}
