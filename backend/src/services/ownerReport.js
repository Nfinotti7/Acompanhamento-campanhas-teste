// Resumo semanal no WhatsApp do dono: conversas, reservas, comparecimento, investimento e
// avaliação, toda segunda de manhã. É o relatório que mostra o resultado em reais sem o
// dono precisar abrir o painel.
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
  const { rows: [spend] } = await dbImpl.query(
    `SELECT COALESCE(SUM(spend), 0) AS total FROM daily_metrics WHERE client_id = ? AND date BETWEEN ? AND ?`,
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
  const { rows: [sales] } = await dbImpl.query(
    `SELECT COUNT(*) AS count, COALESCE(SUM(amount_spent), 0) AS revenue
     FROM real_conversions WHERE client_id = ? AND ${localDay('created_at')} BETWEEN ?::date AND ?::date`,
    [clientId, from, to]
  );
  const response = await loadResponseTimes(dbImpl, clientId, from, to, now);
  const n = (v) => Number(v) || 0;
  return {
    response, sales: n(sales?.count), revenue: n(sales?.revenue),
    conversations: n(contacts?.total), fromAds: n(contacts?.from_ads),
    reservations: n(res?.total), people: n(res?.people), arrived: n(res?.arrived), noShow: n(res?.no_show),
    cancelled: n(res?.cancelled), unmarked: n(res?.unmarked), confirmedByClient: n(res?.confirmed_by_client),
    ratings: n(res?.ratings), avgRating: res?.avg_rating === null || res?.avg_rating === undefined ? null : Number(res.avg_rating),
    spend: n(spend?.total),
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

export function buildOwnerReport({ restaurant, range, stats: s }) {
  const lines = [`📊 *Resumo da semana — ${restaurant}*`, `${ddmm(range.from)} a ${ddmm(range.to)}`, ''];
  lines.push(`💬 Conversas novas: *${s.conversations}*${s.fromAds ? ` (${s.fromAds} vindas de anúncio)` : ''}`);
  if (s.reservations > 0 || s.cancelled > 0) {
    lines.push(`📅 Reservas: *${s.reservations}*${s.people ? ` (${s.people} pessoas)` : ''}`);
    const marked = s.arrived + s.noShow;
    if (s.arrived) lines.push(`   ✅ Compareceram: ${s.arrived}`);
    if (s.noShow) lines.push(`   ❌ Não vieram: ${s.noShow}`);
    if (s.unmarked) lines.push(`   ❔ Sem marcação no Balcão: ${s.unmarked}`);
    if (s.cancelled) lines.push(`   🚫 Canceladas: ${s.cancelled}`);
    if (marked >= 3) lines.push(`   Comparecimento: *${Math.round((s.arrived / marked) * 100)}%*`);
    if (s.confirmedByClient) lines.push(`   📲 Confirmaram presença pelo lembrete: ${s.confirmedByClient}`);
  } else {
    lines.push('📅 Reservas: nenhuma na semana');
  }
  if (s.response?.answered > 0 && s.response.medianMinutes !== null) {
    const fast = s.response.within5Pct !== null ? `, ${Math.round(s.response.within5Pct * 100)}% em até 5 min` : '';
    lines.push(`⏱️ Primeira resposta: típico ${formatMinutes(s.response.medianMinutes)}${fast}`);
  }
  if (s.response?.unanswered > 0) {
    lines.push(`   ⚠️ ${s.response.unanswered} ${s.response.unanswered === 1 ? 'conversa ficou' : 'conversas ficaram'} sem resposta`);
  }
  if (s.spend > 0) {
    const perReservation = s.reservations > 0 ? ` → *${brl.format(s.spend / s.reservations)}* por reserva` : '';
    lines.push(`💰 Investido em anúncios: ${brl.format(s.spend)}${perReservation}`);
  }
  if (s.revenue > 0) {
    const roas = s.spend > 0 ? ` (retorno de *${dec1.format(s.revenue / s.spend)}x* o investimento)` : '';
    lines.push(`💵 Faturamento das vendas lançadas: *${brl.format(s.revenue)}*${roas}`);
  }
  if (s.ratings > 0 && s.avgRating !== null) {
    lines.push(`⭐ Avaliação média pós-visita: *${dec1.format(s.avgRating)}* (${s.ratings} ${s.ratings === 1 ? 'resposta' : 'respostas'})`);
  }
  if (s.topCampaign) lines.push(`🏆 Campanha que mais trouxe reservas: ${s.topCampaign.name} (${s.topCampaign.count})`);
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
    const { delivered } = await sendReport(d, { clientId: client.id, restaurant: client.name, phones, range });
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
