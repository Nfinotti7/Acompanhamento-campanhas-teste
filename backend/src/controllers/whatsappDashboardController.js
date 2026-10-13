import db from '../config/db.js';
import { resolveDateRange } from './campaignController.js';
import { ORIGINS, ORIGIN_SQL } from '../services/whatsappOrigin.js';
import { buildDailyOriginSeries, buildDailySalesSeries, summarizeCampaigns } from '../services/whatsappDashboard.js';

function resolveClientId(req) {
  return req.user.role === 'admin'
    ? (req.query.clientId || req.user.clientId)
    : req.user.clientId;
}

// Timestamps são gravados em UTC sem fuso; o "dia" do restaurante é o de Brasília.
const localDay = (column) => `((${column} AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo')::date`;

export async function getWhatsappDashboard(req, res) {
  try {
    const clientId = resolveClientId(req);
    if (!clientId) {
      return res.status(400).json({ error: 'ID do cliente é obrigatório.' });
    }
    const { startStr, endStr } = resolveDateRange(req.query);
    const params = [clientId, startStr, endStr];
    const inPeriod = `wc.client_id = ? AND ${localDay('wc.first_seen_at')} BETWEEN ?::date AND ?::date`;

    const { rows: originRows } = await db.query(
      `SELECT ${localDay('wc.first_seen_at')} AS day, ${ORIGIN_SQL} AS origin, COUNT(*) AS count
       FROM whatsapp_contacts wc
       WHERE ${inPeriod}
       GROUP BY 1, 2`,
      params
    );

    // Funil: das conversas novas do período, quantas avançaram em cada etapa.
    const { rows: funnelRows } = await db.query(
      `SELECT
         COUNT(*) AS contacted,
         COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM whatsapp_messages m WHERE m.contact_id = wc.id AND m.direction = 'outbound')) AS answered,
         COUNT(*) FILTER (WHERE wc.appointment_at IS NOT NULL) AS scheduled,
         COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM real_conversions rc WHERE rc.contact_id = wc.id)) AS bought
       FROM whatsapp_contacts wc
       WHERE ${inPeriod}`,
      params
    );

    const { rows: salesRows } = await db.query(
      `SELECT ${localDay('rc.created_at')} AS day, COUNT(*) AS sales, COALESCE(SUM(rc.amount_spent), 0) AS revenue
       FROM real_conversions rc
       WHERE rc.client_id = ? AND ${localDay('rc.created_at')} BETWEEN ?::date AND ?::date
       GROUP BY 1`,
      params
    );

    // Por campanha: conversas novas do período que vieram de anúncio, as vendas desses
    // contatos (em qualquer data -- a venda pertence à campanha que trouxe o lead) e o
    // investimento da campanha no período, já sincronizado em daily_metrics.
    const { rows: campaignRows } = await db.query(
      `WITH leads AS (
         SELECT wc.id, mac.campaign_id, mac.campaign_name
         FROM whatsapp_contacts wc
         JOIN meta_ad_cache mac ON mac.ad_id = wc.ad_id
         WHERE ${inPeriod} AND mac.campaign_id IS NOT NULL
       )
       SELECT l.campaign_id, MAX(l.campaign_name) AS campaign_name,
              COUNT(DISTINCT l.id) AS conversations,
              COUNT(rc.id) AS sales,
              COALESCE(SUM(rc.amount_spent), 0) AS revenue,
              COALESCE((
                SELECT SUM(dm.spend) FROM daily_metrics dm
                JOIN campaigns cp ON cp.id = dm.campaign_id
                WHERE cp.platform = 'meta' AND cp.campaign_id = l.campaign_id
                  AND dm.date BETWEEN ? AND ?
              ), 0) AS spend
       FROM leads l
       LEFT JOIN real_conversions rc ON rc.contact_id = l.id
       GROUP BY l.campaign_id`,
      [...params, startStr, endStr]
    );

    const byOrigin = Object.fromEntries(ORIGINS.map((o) => [o, 0]));
    for (const row of originRows) byOrigin[row.origin] += Number(row.count);
    const total = Object.values(byOrigin).reduce((a, b) => a + b, 0);
    const tracked = total - byOrigin.nao_rastreada;

    const funnel = funnelRows[0];
    const totalSales = salesRows.reduce((sum, r) => sum + Number(r.sales), 0);
    const totalRevenue = salesRows.reduce((sum, r) => sum + Number(r.revenue), 0);

    return res.json({
      period: { start: startStr, end: endStr },
      conversations: {
        total,
        tracked,
        untracked: byOrigin.nao_rastreada,
        byOrigin,
        daily: buildDailyOriginSeries(originRows, startStr, endStr)
      },
      funnel: {
        contacted: Number(funnel.contacted),
        answered: Number(funnel.answered),
        scheduled: Number(funnel.scheduled),
        bought: Number(funnel.bought)
      },
      sales: {
        total: totalSales,
        revenue: totalRevenue,
        conversionRate: total > 0 ? Number(funnel.bought) / total : 0,
        daily: buildDailySalesSeries(salesRows, startStr, endStr)
      },
      campaigns: summarizeCampaigns(campaignRows)
    });
  } catch (error) {
    console.error('WhatsApp dashboard error:', error);
    return res.status(500).json({ error: 'Erro ao montar o dashboard de conversas.' });
  }
}
