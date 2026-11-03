// Resumo semanal no WhatsApp do dono, toda segunda de manhã: conversas, visualizações e
// cliques dos anúncios, custo por conversa, o que as pessoas procuraram (cardápio,
// localização...) e, quando há, reservas. Não é só de reserva: o anúncio também traz gente
// pra ver cardápio, localização e passar no restaurante.
import db from '../config/db.js';
import { sendViaBaileys } from './baileysClient.js';
import { loadReservationSettings } from './reservationStore.js';
import { addDays, dayOf, weekdayOf } from './reservationSlots.js';
import { parseOwnerPhones } from './followupText.js';
import { loadResponseTimes } from './campaignInsights.js';

const localDay = (column) => `((${column} AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo')::date`;
// Reservas guardam starts_at em TIMESTAMPTZ: o fuso certo é direto.
const localDayTz = (column) => `(${column} AT TIME ZONE 'America/Sao_Paulo')::date`;

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dec1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function ddmm(day) {
  const [, m, d] = day.split('-');
  return `${d}/${m}`;
}

// Janela da semana que acabou: segunda a domingo anteriores à segunda de "today".
export function lastWeekRange(today) {
  return { from: addDays(today, -7), to: addDays(today, -1), key: today };
}

// Segunda-feira, depois das 9h em Brasília.
export function isReportTime(now) {
  const local = new Date(now.getTime() - 3 * 3600e3);
  return weekdayOf(dayOf(now)) === 1 && local.getUTCHours() >= 9;
}

export async function collectStats(dbImpl, clientId, { from, to }, now = new Date()) {
  const { rows: [contacts] } = await dbImpl.query(
    `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE source IN ('ad', 'google_ads')) AS from_ads
     FROM whatsapp_contacts
     WHERE client_id = ? AND ${localDay('first_seen_at')} BETWEEN ?::date AND ?::date`,
    [clientId, from, to]
  );
  const { rows: [res] } = await dbImpl.query(
    `SELECT COUNT(*) FILTER (WHERE status <> 'cancelled') AS total,
            COALESCE(SUM(party_size) FILTER (WHERE status <> 'cancelled'), 0) AS people,
            COUNT(*) FILTER (WHERE status = 'arrived') AS arrived,
            COUNT(*) FILTER (WHERE status = 'no_show') AS no_show,
            COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
            COUNT(*) FILTER (WHERE status = 'confirmed' AND starts_at < ?) AS unmarked,
            COUNT(*) FILTER (WHERE status <> 'cancelled' AND client_confirmed_at IS NOT NULL) AS confirmed_by_client,
            COUNT(rating) AS ratings, AVG(rating) AS avg_rating
     FROM reservations
     WHERE client_id = ? AND ${localDayTz('starts_at')} BETWEEN ?::date AND ?::date`,
    [now, clientId, from, to]
  );
  const { rows: [ads] } = await dbImpl.query(
    `SELECT COALESCE(SUM(spend), 0) AS spend, COALESCE(SUM(impressions), 0) AS impressions, COALESCE(SUM(clicks), 0) AS clicks
     FROM daily_metrics WHERE client_id = ? AND date BETWEEN ? AND ?`,
    [clientId, from, to]
  );
  const { rows: top } = await dbImpl.query(
    `SELECT c.campaign_name, COUNT(*) AS count
     FROM reservations r
     JOIN whatsapp_contacts wc ON wc.id = r.contact_id
     JOIN meta_ad_cache c ON c.ad_id = wc.ad_id
     WHERE r.client_id = ? AND r.status <> 'cancelled' AND c.campaign_name IS NOT NULL
       AND ${localDayTz('r.starts_at')} BETWEEN ?::date AND ?::date
     GROUP BY c.campaign_name ORDER BY count DESC, c.campaign_name LIMIT 1`,
    [clientId, from, to]
  );
  // O que as pessoas procuraram: cada assunto conta uma vez por pessoa (respostas automáticas).
  const { rows: topicRows } = await dbImpl.query(
    `SELECT topic, COUNT(DISTINCT contact_id) AS count FROM info_replies
     WHERE client_id = ? AND topic <> 'after_hours' AND ${localDayTz('sent_at')} BETWEEN ?::date AND ?::date
     GROUP BY topic`,
    [clientId, from, to]
  );
  const { rows: topConv } = await dbImpl.query(
    `SELECT c.campaign_name, COUNT(*) AS count
     FROM whatsapp_contacts wc
     JOIN meta_ad_cache c ON c.ad_id = wc.ad_id
     WHERE wc.client_id = ? AND c.campaign_name IS NOT NULL
       AND ${localDay('wc.first_seen_at')} BETWEEN ?::date AND ?::date
     GROUP BY c.campaign_name ORDER BY count DESC, c.campaign_name LIMIT 1`,
    [clientId, from, to]
  );
  const response = await loadResponseTimes(dbImpl, clientId, from, to, now);
  const n = (v) => Number(v) || 0;
  const topics = { menu: 0, prices: 0, hours: 0, location: 0, questions: 0 };
  for (const r of topicRows) {
    if (['menu', 'prices', 'hours', 'location'].includes(r.topic)) topics[r.topic] += n(r.count);
    else topics.questions += n(r.count); // 'other' e as perguntas frequentes do restaurante
  }
  return {
    response, topics,
    impressions: n(ads?.impressions), clicks: n(ads?.clicks),
    topCampaignConversations: topConv[0] ? { name: topConv[0].campaign_name, count: n(topConv[0].count) } : null,
    conversations: n(contacts?.total), fromAds: n(contacts?.from_ads),
    reservations: n(res?.total), people: n(res?.people), arrived: n(res?.arrived), noShow: n(res?.no_show),
    cancelled: n(res?.cancelled), unmarked: n(res?.unmarked), confirmedByClient: n(res?.confirmed_by_client),
    ratings: n(res?.ratings), avgRating: res?.avg_rating === null || res?.avg_rating === undefined ? null : Number(res.avg_rating),
    spend: n(ads?.spend),
    topCampaign: top[0] ? { name: top[0].campaign_name, count: n(top[0].count) } : null
  };
}

// 0,4 → "menos de 1 min"; 7,2 → "7 min"; 75 → "1h15".
export function formatMinutes(m) {
  if (m < 1) return 'menos de 1 min';
  if (m < 60) return `${Math.round(m)} min`;
  const h = Math.floor(m / 60);
  const min = Math.round(m % 60);
  return min ? `${h}h${String(min).padStart(2, '0')}` : `${h}h`;
}

export const TOPIC_LABELS = [['menu', 'cardápio'], ['location', 'localização'], ['prices', 'preços'], ['hours', 'horário'], ['questions', 'outras dúvidas']];

// "cardápio (12), localização (8)", do mais procurado pro menos.
export function topicsText(topics = {}) {
  return TOPIC_LABELS
    .filter(([key]) => topics[key] > 0)
    .sort((x, y) => topics[y[0]] - topics[x[0]])
    .map(([key, label]) => `${label} (${topics[key]})`)
    .join(', ');
}

const int = new Intl.NumberFormat('pt-BR');

export function buildOwnerReport({ restaurant, range, stats: s }) {
  const lines = [`📊 *Resumo da semana — ${restaurant}*`, `${ddmm(range.from)} a ${ddmm(range.to)}`, ''];
  lines.push(`💬 Conversas novas: *${s.conversations}*${s.fromAds ? ` (${s.fromAds} vindas de anúncio)` : ''}`);
  if (s.impressions > 0) {
    lines.push(`👀 Anúncios vistos *${int.format(s.impressions)}* vezes, com *${int.format(s.clicks)}* cliques`);
  }
  if (s.spend > 0) {
    const perConversation = s.conversations > 0 ? ` → *${brl.format(s.spend / s.conversations)}* por conversa` : '';
    lines.push(`💰 Investido em anúncios: ${brl.format(s.spend)}${perConversation}`);
  }
  const wanted = topicsText(s.topics);
  if (wanted) lines.push(`🔎 O que mais procuraram: ${wanted}`);
  if (s.reservations > 0 || s.cancelled > 0) {
    lines.push(`📅 Reservas: *${s.reservations}*${s.people ? ` (${s.people} pessoas)` : ''}`);
    const marked = s.arrived + s.noShow;
    if (s.arrived) lines.push(`   ✅ Compareceram: ${s.arrived}`);
    if (s.noShow) lines.push(`   ❌ Não vieram: ${s.noShow}`);
    if (s.cancelled) lines.push(`   🚫 Canceladas: ${s.cancelled}`);
    if (marked >= 3) lines.push(`   Comparecimento: *${Math.round((s.arrived / marked) * 100)}%*`);
    if (s.confirmedByClient) lines.push(`   📲 Confirmaram presença pelo lembrete: ${s.confirmedByClient}`);
  }
  if (s.response?.answered > 0 && s.response.medianMinutes !== null) {
    const fast = s.response.within5Pct !== null ? `, ${Math.round(s.response.within5Pct * 100)}% em até 5 min` : '';
    lines.push(`⏱️ Primeira resposta: típico ${formatMinutes(s.response.medianMinutes)}${fast}`);
  }
  if (s.response?.unanswered > 0) {
    lines.push(`   ⚠️ ${s.response.unanswered} ${s.response.unanswered === 1 ? 'conversa ficou' : 'conversas ficaram'} sem resposta`);
  }
  if (s.ratings > 0 && s.avgRating !== null) {
    lines.push(`⭐ Avaliação média pós-visita: *${dec1.format(s.avgRating)}* (${s.ratings} ${s.ratings === 1 ? 'resposta' : 'respostas'})`);
  }
  if (s.topCampaignConversations) lines.push(`🏆 Campanha que mais trouxe conversas: ${s.topCampaignConversations.name} (${s.topCampaignConversations.count})`);
  lines.push('', 'Qualquer dúvida sobre os números, é só chamar a Further 🙂');
  return lines.join('\n');
}

function resolveDeps(deps) {
  return {
    db: deps.db || db,
    now: deps.now ? deps.now() : new Date(),
    sendRaw: deps.sendRaw || sendViaBaileys,
    loadSettings: deps.loadSettings || loadReservationSettings
  };
}

async function sendReport(d, { clientId, restaurant, phones, range }) {
  const stats = await collectStats(d.db, clientId, range, d.now);
  const body = buildOwnerReport({ restaurant, range, stats });
  let delivered = 0;
  for (const phone of phones) {
    try {
      await d.sendRaw(clientId, phone, body);
      delivered += 1;
    } catch (error) {
      console.error(`Relatório do dono: falha ao enviar pro cliente ${clientId}:`, error.message);
    }
  }
  return { delivered, body };
}

// Roda a cada ciclo do agendador: na segunda depois das 9h, manda uma vez por cliente.
export async function runWeeklyReports(deps = {}) {
  const d = resolveDeps(deps);
  if (!isReportTime(d.now)) return 0;
  const range = lastWeekRange(dayOf(d.now));
  const { rows: clients } = await d.db.query(
    `SELECT cl.id, cl.name FROM clients cl
     JOIN whatsapp_settings ws ON ws.client_id = cl.id AND ws.connection_type = 'baileys'
     WHERE cl.reservations_enabled = true`
  );
  let sent = 0;
  for (const client of clients) {
    const settings = await d.loadSettings(d.db, client.id);
    const f = settings.followup;
    const phones = parseOwnerPhones(f.owner_phones);
    if (!f.report_enabled || phones.length === 0) continue;
    const { rows: claimed } = await d.db.query(
      `INSERT INTO owner_reports (client_id, kind, period_key) VALUES (?, 'weekly', ?)
       ON CONFLICT DO NOTHING RETURNING client_id`,
      [client.id, range.key]
    );
    if (claimed.length === 0) continue;
    let delivered = 0;
    try {
      ({ delivered } = await sendReport(d, { clientId: client.id, restaurant: client.name, phones, range }));
    } catch (error) {
      // Erro ao montar o resumo (consulta): não perde a semana, tenta de novo no próximo ciclo.
      console.error(`Relatório do dono: erro ao montar o resumo do cliente ${client.id}:`, error.message);
    }
    if (delivered === 0) {
      // Nada saiu (WhatsApp fora do ar): libera pra tentar no próximo ciclo.
      await d.db.query(`DELETE FROM owner_reports WHERE client_id = ? AND kind = 'weekly' AND period_key = ?`, [client.id, range.key]);
    } else {
      sent += 1;
    }
  }
  return sent;
}

// Botão "enviar agora" da tela de configuração: manda o resumo da última semana pros
// telefones salvos, sem mexer no controle de envio semanal.
export async function sendReportNow(clientId, restaurant, deps = {}) {
  const d = resolveDeps(deps);
  const settings = await d.loadSettings(d.db, clientId);
  const phones = parseOwnerPhones(settings.followup.owner_phones);
  if (phones.length === 0) return { delivered: 0, error: 'Cadastre ao menos um telefone do dono.' };
  const range = lastWeekRange(dayOf(d.now));
  const { delivered, body } = await sendReport(d, { clientId, restaurant, phones, range });
  return { delivered, body };
}
