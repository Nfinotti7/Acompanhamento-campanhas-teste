// Leituras que cruzam anúncio, conversa e reserva: ranking de criativos (anúncio →
// reserva → compareceu), tempo de resposta e alertas de campanha. As contas ficam em
// funções puras (testadas); as consultas só juntam os números.
import db from '../config/db.js';
import { sendViaBaileys } from './baileysClient.js';
import { loadReservationSettings } from './reservationStore.js';
import { addDays, dayOf } from './reservationSlots.js';
import { parseOwnerPhones } from './followupText.js';

const localDay = (column) => `((${column} AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo')::date`;
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const n = (v) => Number(v) || 0;

// ---------- Ranking de criativos ----------

// Mínimos pra dar um veredito: sem volume, ranking vira palpite.
export const VERDICT_MIN_CONVERSATIONS = 10;
export const NO_SHOW_MIN_MARKED = 3;

function noShowRate(arrived, noShow) {
  const marked = arrived + noShow;
  return marked >= NO_SHOW_MIN_MARKED ? noShow / marked : null;
}

// adRows: uma linha por anúncio; spendByCampaign: Map(campaign_id → gasto no período).
export function buildCreativeRanking(adRows, spendByCampaign = new Map()) {
  const ads = adRows.map((r) => {
    const conversations = n(r.conversations);
    const reservations = n(r.reservations);
    return {
      adId: r.ad_id, adName: r.ad_name || r.ad_id, campaignId: r.campaign_id, campaignName: r.campaign_name || '—',
      conversations, reservations, arrived: n(r.arrived), noShow: n(r.no_show),
      reservationRate: conversations > 0 ? reservations / conversations : 0,
      noShowRate: noShowRate(n(r.arrived), n(r.no_show))
    };
  });
  const totalConv = ads.reduce((s, a) => s + a.conversations, 0);
  const totalRes = ads.reduce((s, a) => s + a.reservations, 0);
  const avgRate = totalConv > 0 ? totalRes / totalConv : 0;
  for (const a of ads) {
    a.verdict = null;
    if (a.conversations >= VERDICT_MIN_CONVERSATIONS && a.reservations === 0) a.verdict = 'pausar';
    else if (a.conversations >= 8 && a.reservations >= 2 && avgRate > 0 && a.reservationRate >= avgRate * 1.5) a.verdict = 'escalar';
  }
  ads.sort((x, y) => y.reservations - x.reservations || y.reservationRate - x.reservationRate || y.conversations - x.conversations);

  const byCampaign = new Map();
  for (const a of ads) {
    const c = byCampaign.get(a.campaignId) || { campaignId: a.campaignId, campaignName: a.campaignName, conversations: 0, reservations: 0, arrived: 0, noShow: 0 };
    c.conversations += a.conversations;
    c.reservations += a.reservations;
    c.arrived += a.arrived;
    c.noShow += a.noShow;
    byCampaign.set(a.campaignId, c);
  }
  const campaigns = [...byCampaign.values()].map((c) => {
    const spend = n(spendByCampaign.get(c.campaignId));
    return {
      ...c, spend,
      costPerConversation: c.conversations > 0 && spend > 0 ? spend / c.conversations : null,
      costPerReservation: c.reservations > 0 && spend > 0 ? spend / c.reservations : null,
      noShowRate: noShowRate(c.arrived, c.noShow)
    };
  }).sort((x, y) => y.reservations - x.reservations || y.conversations - x.conversations);
  return { ads, campaigns };
}

export async function loadCreativeRanking(dbImpl, clientId, startStr, endStr) {
  const { rows: adRows } = await dbImpl.query(
    `SELECT mac.ad_id, MAX(mac.ad_name) AS ad_name, MAX(mac.campaign_id) AS campaign_id, MAX(mac.campaign_name) AS campaign_name,
            COUNT(DISTINCT wc.id) AS conversations,
            COUNT(DISTINCT r.id) FILTER (WHERE r.status <> 'cancelled') AS reservations,
            COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'arrived') AS arrived,
            COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'no_show') AS no_show
     FROM whatsapp_contacts wc
     JOIN meta_ad_cache mac ON mac.ad_id = wc.ad_id
     LEFT JOIN reservations r ON r.contact_id = wc.id
     WHERE wc.client_id = ? AND ${localDay('wc.first_seen_at')} BETWEEN ?::date AND ?::date
     GROUP BY mac.ad_id`,
    [clientId, startStr, endStr]
  );
  const { rows: spendRows } = await dbImpl.query(
    `SELECT cp.campaign_id, COALESCE(SUM(dm.spend), 0) AS spend
     FROM daily_metrics dm JOIN campaigns cp ON cp.id = dm.campaign_id
     WHERE dm.client_id = ? AND cp.platform = 'meta' AND dm.date BETWEEN ? AND ?
     GROUP BY cp.campaign_id`,
    [clientId, startStr, endStr]
  );
  return buildCreativeRanking(adRows, new Map(spendRows.map((r) => [r.campaign_id, n(r.spend)])));
}

// ---------- Tempo de resposta ----------

export const UNANSWERED_AFTER_MS = 15 * 60e3;
export const FAST_REPLY_MS = 5 * 60e3;

// rows: { in_t, out_t } por conversa nova (primeira mensagem recebida / primeira resposta).
export function summarizeResponseTimes(rows, now = new Date()) {
  const minutes = [];
  let unanswered = 0;
  for (const r of rows) {
    const inT = new Date(r.in_t).getTime();
    if (r.out_t) minutes.push(Math.max(0, (new Date(r.out_t).getTime() - inT) / 60e3));
    else if (now.getTime() - inT > UNANSWERED_AFTER_MS) unanswered += 1;
  }
  minutes.sort((a, b) => a - b);
  const mid = Math.floor(minutes.length / 2);
  const median = minutes.length === 0 ? null : (minutes.length % 2 ? minutes[mid] : (minutes[mid - 1] + minutes[mid]) / 2);
  return {
    conversations: rows.length,
    answered: minutes.length,
    unanswered,
    medianMinutes: median,
    avgMinutes: minutes.length ? minutes.reduce((a, b) => a + b, 0) / minutes.length : null,
    within5Pct: minutes.length ? minutes.filter((m) => m <= FAST_REPLY_MS / 60e3).length / minutes.length : null
  };
}

export async function loadResponseTimes(dbImpl, clientId, startStr, endStr, now = new Date()) {
  const { rows } = await dbImpl.query(
    `SELECT fi.t AS in_t, fo.t AS out_t
     FROM whatsapp_contacts wc
     JOIN (SELECT contact_id, MIN(sent_at) AS t FROM whatsapp_messages WHERE client_id = ? AND direction = 'inbound' GROUP BY contact_id) fi
       ON fi.contact_id = wc.id
     LEFT JOIN LATERAL (
       SELECT MIN(m.sent_at) AS t FROM whatsapp_messages m
       WHERE m.contact_id = wc.id AND m.direction = 'outbound' AND m.sent_at >= fi.t
     ) fo ON true
     WHERE wc.client_id = ? AND ${localDay('wc.first_seen_at')} BETWEEN ?::date AND ?::date`,
    [clientId, clientId, startStr, endStr]
  );
  return summarizeResponseTimes(rows, now);
}

// ---------- Alertas de campanha ----------

export const ALERT_WINDOW_DAYS = 3;
export const ALERT_BASELINE_DAYS = 7;
export const ALERT_MIN_SPEND = 30; // R$ no período recente pra valer um alerta
export const CPL_RISE_FACTOR = 1.5;

// campaigns: [{ id, name, status, days: { 'YYYY-MM-DD': { spend, conversations } } }]
// today: dia (Brasília) em que o alerta é gerado; "recente" = os 3 dias antes de hoje,
// "base" = os 7 dias antes disso.
export function computeAlerts(campaigns, today) {
  const recent = Array.from({ length: ALERT_WINDOW_DAYS }, (_, i) => addDays(today, -(i + 1)));
  const baseline = Array.from({ length: ALERT_BASELINE_DAYS }, (_, i) => addDays(today, -(ALERT_WINDOW_DAYS + i + 1)));
  const sum = (c, days, key) => days.reduce((s, d) => s + n(c.days?.[d]?.[key]), 0);
  const alerts = [];
  for (const c of campaigns) {
    const rSpend = sum(c, recent, 'spend');
    const rConv = sum(c, recent, 'conversations');
    const bSpend = sum(c, baseline, 'spend');
    const bConv = sum(c, baseline, 'conversations');
    const active = !c.status || /^(ACTIVE|ENABLED)$/i.test(c.status);

    if (active && bSpend >= ALERT_MIN_SPEND && rSpend === 0) {
      alerts.push({ type: 'sem_entrega', campaign: c.name, message: `*${c.name}*: sem entrega nos últimos ${ALERT_WINDOW_DAYS} dias (vinha gastando ${brl.format(bSpend / ALERT_BASELINE_DAYS)}/dia). Conferir pagamento, reprovação ou limite.` });
      continue;
    }
    if (rSpend >= ALERT_MIN_SPEND && rConv === 0 && bConv > 0) {
      alerts.push({ type: 'sem_conversa', campaign: c.name, message: `*${c.name}*: gastou ${brl.format(rSpend)} em ${ALERT_WINDOW_DAYS} dias e não trouxe nenhuma conversa (antes vinha trazendo).` });
      continue;
    }
    if (rSpend >= ALERT_MIN_SPEND && rConv >= 1 && bConv >= 5 && bSpend > 0) {
      const cplNow = rSpend / rConv;
      const cplBefore = bSpend / bConv;
      if (cplNow >= cplBefore * CPL_RISE_FACTOR) {
        alerts.push({ type: 'cpl_subiu', campaign: c.name, message: `*${c.name}*: custo por conversa subiu ${Math.round((cplNow / cplBefore - 1) * 100)}% (${brl.format(cplBefore)} → ${brl.format(cplNow)}). Vale revisar criativo e público.` });
      }
    }
  }
  return alerts;
}

export function buildAlertsMessage(restaurant, alerts) {
  return [`⚠️ *Alertas de campanha — ${restaurant}*`, '', ...alerts.map((a) => `• ${a.message}`), '', 'Enviado automaticamente pelo acompanhamento da Further.'].join('\n');
}

export async function loadCampaignAlertData(dbImpl, clientId, today) {
  const from = addDays(today, -(ALERT_WINDOW_DAYS + ALERT_BASELINE_DAYS));
  const to = addDays(today, -1);
  const { rows: spendRows } = await dbImpl.query(
    `SELECT cp.campaign_id, MAX(cp.campaign_name) AS name, MAX(cp.status) AS status, dm.date, COALESCE(SUM(dm.spend), 0) AS spend
     FROM daily_metrics dm JOIN campaigns cp ON cp.id = dm.campaign_id
     WHERE dm.client_id = ? AND cp.platform = 'meta' AND dm.date BETWEEN ? AND ?
     GROUP BY cp.campaign_id, dm.date`,
    [clientId, from, to]
  );
  const { rows: convRows } = await dbImpl.query(
    `SELECT mac.campaign_id, ${localDay('wc.first_seen_at')}::text AS day, COUNT(*) AS conversations
     FROM whatsapp_contacts wc JOIN meta_ad_cache mac ON mac.ad_id = wc.ad_id
     WHERE wc.client_id = ? AND mac.campaign_id IS NOT NULL AND ${localDay('wc.first_seen_at')} BETWEEN ?::date AND ?::date
     GROUP BY 1, 2`,
    [clientId, from, to]
  );
  const map = new Map();
  for (const r of spendRows) {
    const c = map.get(r.campaign_id) || { id: r.campaign_id, name: r.name, status: r.status, days: {} };
    c.days[r.date] = { ...(c.days[r.date] || {}), spend: n(r.spend) };
    map.set(r.campaign_id, c);
  }
  for (const r of convRows) {
    const c = map.get(r.campaign_id);
    if (!c) continue; // conversa de campanha sem gasto sincronizado: nada a comparar
    c.days[r.day] = { ...(c.days[r.day] || {}), conversations: n(r.conversations) };
  }
  return [...map.values()];
}

function resolveDeps(deps) {
  return {
    db: deps.db || db,
    now: deps.now ? deps.now() : new Date(),
    sendRaw: deps.sendRaw || sendViaBaileys,
    loadSettings: deps.loadSettings || loadReservationSettings
  };
}

// Todo dia depois das 9h: se algum alerta apareceu, manda pro(s) telefone(s) da agência.
// Uma mensagem por cliente por dia (owner_reports reserva antes de enviar).
export async function runCampaignAlerts(deps = {}) {
  const d = resolveDeps(deps);
  if (new Date(d.now.getTime() - 3 * 3600e3).getUTCHours() < 9) return 0;
  const today = dayOf(d.now);
  const { rows: clients } = await d.db.query(
    `SELECT cl.id, cl.name FROM clients cl
     JOIN whatsapp_settings ws ON ws.client_id = cl.id AND ws.connection_type = 'baileys'`
  );
  let sent = 0;
  for (const client of clients) {
    const settings = await d.loadSettings(d.db, client.id);
    const f = settings.followup;
    const phones = parseOwnerPhones(f.alert_phones);
    if (!f.alerts_enabled || phones.length === 0) continue;
    const alerts = computeAlerts(await loadCampaignAlertData(d.db, client.id, today), today);
    if (alerts.length === 0) continue;
    const { rows: claimed } = await d.db.query(
      `INSERT INTO owner_reports (client_id, kind, period_key) VALUES (?, 'alerts', ?) ON CONFLICT DO NOTHING RETURNING client_id`,
      [client.id, today]
    );
    if (claimed.length === 0) continue;
    const body = buildAlertsMessage(client.name, alerts);
    let delivered = 0;
    for (const phone of phones) {
      try {
        await d.sendRaw(client.id, phone, body);
        delivered += 1;
      } catch (error) {
        console.error(`Alertas de campanha: falha ao enviar (cliente ${client.id}):`, error.message);
      }
    }
    if (delivered === 0) {
      await d.db.query(`DELETE FROM owner_reports WHERE client_id = ? AND kind = 'alerts' AND period_key = ?`, [client.id, today]);
    } else {
      sent += 1;
    }
  }
  return sent;
}
