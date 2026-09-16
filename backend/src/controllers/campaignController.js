import db from '../config/db.js';
import { syncClient } from '../services/syncService.js';

function withDerivedMetrics(row) {
  const spend = Number(row.spend) || 0;
  const clicks = Number(row.clicks) || 0;
  const impressions = Number(row.impressions) || 0;
  const reach = Number(row.reach) || 0;
  const conversions = Number(row.conversions) || 0;
  const conversionValue = Number(row.conversion_value) || 0;

  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const cpc = clicks > 0 ? spend / clicks : 0;
  const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
  const cpa = conversions > 0 ? spend / conversions : 0;
  const roas = spend > 0 ? conversionValue / spend : 0;
  const roi = spend > 0 ? ((conversionValue - spend) / spend) * 100 : 0;

  return {
    ...row,
    spend: Number(spend.toFixed(2)),
    clicks,
    impressions,
    reach,
    conversions,
    conversion_value: Number(conversionValue.toFixed(2)),
    ctr: Number(ctr.toFixed(2)),
    cpc: Number(cpc.toFixed(2)),
    cpm: Number(cpm.toFixed(2)),
    cpa: Number(cpa.toFixed(2)),
    roas: Number(roas.toFixed(2)),
    roi: Number(roi.toFixed(2))
  };
}

function resolveDateRange({ startDate, endDate, range = '30d' }) {
  if (startDate && endDate) return { startStr: startDate, endStr: endDate };

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

  return {
    startStr: start.toISOString().split('T')[0],
    endStr: end.toISOString().split('T')[0]
  };
}

export async function getMetricsSummary(req, res) {
  try {
    let clientId = req.query.clientId ? Number(req.query.clientId) : req.user.clientId;
    if (req.user.role !== 'admin' && clientId !== req.user.clientId) {
      clientId = req.user.clientId;
    }

    const { platform = 'all' } = req.query;
    const { startStr, endStr } = resolveDateRange(req.query);

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
        COALESCE(SUM(spend), 0) as spend,
        COALESCE(SUM(clicks), 0) as clicks,
        COALESCE(SUM(impressions), 0) as impressions,
        COALESCE(SUM(reach), 0) as reach,
        COALESCE(SUM(conversions), 0) as conversions,
        COALESCE(SUM(conversion_value), 0) as conversion_value
      FROM daily_metrics
      WHERE ${whereSql}
    `;

    const { rows: summaryRows } = await db.query(summaryQuery, params);
    const summary = withDerivedMetrics(summaryRows[0]);

    // 2. Dynamic Daily Chart Data (all metrics over time, for the metric-line selector)
    const dailyQuery = `
      SELECT
        date,
        SUM(spend) as spend,
        SUM(clicks) as clicks,
        SUM(impressions) as impressions,
        SUM(reach) as reach,
        SUM(conversions) as conversions,
        SUM(conversion_value) as conversion_value
      FROM daily_metrics
      WHERE ${whereSql}
      GROUP BY date
      ORDER BY date ASC
    `;

    const { rows: dailyRows } = await db.query(dailyQuery, params);
    const dailyData = dailyRows.map(withDerivedMetrics);

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
      summary,
      dailyData,
      platformBreakdown,
      dateRange: { start: startStr, end: endStr }
    });
  } catch (error) {
    console.error('Metrics summary error:', error);
    return res.status(500).json({ error: 'Erro ao calcular resumo de métricas.' });
  }
}

export async function getCampaignDaily(req, res) {
  try {
    const campaignId = Number(req.params.id);
    const { rows: campaignRows } = await db.query(
      'SELECT id, client_id, platform, campaign_name FROM campaigns WHERE id = ?',
      [campaignId]
    );
    const campaign = campaignRows[0];
    if (!campaign) {
      return res.status(404).json({ error: 'Campanha não encontrada.' });
    }

    if (req.user.role !== 'admin' && campaign.client_id !== req.user.clientId) {
      return res.status(403).json({ error: 'Acesso negado a esta campanha.' });
    }

    const { startStr, endStr } = resolveDateRange(req.query);

    const { rows: dailyRows } = await db.query(
      `SELECT date, spend, clicks, impressions, reach, conversions, conversion_value
       FROM daily_metrics
       WHERE campaign_id = ? AND date >= ? AND date <= ?
       ORDER BY date ASC`,
      [campaignId, startStr, endStr]
    );
    const dailyData = dailyRows.map(withDerivedMetrics);

    const totals = dailyRows.reduce(
      (acc, r) => ({
        spend: acc.spend + Number(r.spend || 0),
        clicks: acc.clicks + Number(r.clicks || 0),
        impressions: acc.impressions + Number(r.impressions || 0),
        reach: acc.reach + Number(r.reach || 0),
        conversions: acc.conversions + Number(r.conversions || 0),
        conversion_value: acc.conversion_value + Number(r.conversion_value || 0)
      }),
      { spend: 0, clicks: 0, impressions: 0, reach: 0, conversions: 0, conversion_value: 0 }
    );
    const summary = withDerivedMetrics(totals);

    return res.json({
      campaign: {
        id: campaign.id,
        campaignName: campaign.campaign_name,
        platform: campaign.platform
      },
      summary,
      dailyData,
      dateRange: { start: startStr, end: endStr }
    });
  } catch (error) {
    console.error('Campaign daily metrics error:', error);
    return res.status(500).json({ error: 'Erro ao calcular métricas da campanha.' });
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
