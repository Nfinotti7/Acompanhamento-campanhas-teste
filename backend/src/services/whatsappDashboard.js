import { ORIGINS } from './whatsappOrigin.js';

function toDayString(day) {
  return day instanceof Date ? day.toISOString().slice(0, 10) : String(day).slice(0, 10);
}

function eachDay(startStr, endStr) {
  const days = [];
  const cursor = new Date(`${startStr}T00:00:00.000Z`);
  const end = new Date(`${endStr}T00:00:00.000Z`);
  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

// Conversas novas por dia, uma coluna por origem -- dias sem conversa aparecem com zero
// (senão o gráfico "pula" o dia e parece que não existiu).
export function buildDailyOriginSeries(rows, startStr, endStr) {
  const byDay = new Map(eachDay(startStr, endStr).map((day) => [day, Object.fromEntries(ORIGINS.map((o) => [o, 0]))]));
  for (const row of rows) {
    const bucket = byDay.get(toDayString(row.day));
    if (bucket && row.origin in bucket) bucket[row.origin] += Number(row.count);
  }
  return [...byDay.entries()].map(([day, counts]) => ({ day, ...counts }));
}

export function buildDailySalesSeries(rows, startStr, endStr) {
  const byDay = new Map(eachDay(startStr, endStr).map((day) => [day, { sales: 0, revenue: 0 }]));
  for (const row of rows) {
    const bucket = byDay.get(toDayString(row.day));
    if (bucket) {
      bucket.sales += Number(row.sales);
      bucket.revenue += Number(row.revenue);
    }
  }
  return [...byDay.entries()].map(([day, values]) => ({ day, ...values }));
}

export function summarizeCampaigns(rows) {
  return rows
    .map((r) => {
      const spend = Number(r.spend) || 0;
      const revenue = Number(r.revenue) || 0;
      const conversations = Number(r.conversations) || 0;
      return {
        campaignId: r.campaign_id,
        campaignName: r.campaign_name || `Campanha ${r.campaign_id}`,
        conversations,
        sales: Number(r.sales) || 0,
        revenue,
        spend,
        roas: spend > 0 ? revenue / spend : null,
        costPerConversation: spend > 0 && conversations > 0 ? spend / conversations : null
      };
    })
    .sort((a, b) => b.conversations - a.conversations);
}
