// Painel do dono (resumo + relatório mensal imprimível), comparativo entre unidades e
// checklist de implantação. Contas em funções puras; as consultas reaproveitam o que o
// resumo semanal já usa (ownerReport.collectStats).
import { addDays, dayOf } from './reservationSlots.js';
import { collectStats, topicsText } from './ownerReport.js';

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

// ---------- Períodos ----------

function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400e3) + 1;
}

function firstOfMonth(day, monthsBack = 0) {
  let year = Number(day.slice(0, 4));
  let month = Number(day.slice(5, 7)) - monthsBack;
  while (month < 1) { month += 12; year -= 1; }
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

// today: dia de hoje (Brasília). O período termina ontem (hoje ainda está acontecendo),
// exceto "month" (mês até hoje). O anterior tem o mesmo tamanho e termina na véspera.
export function periodRange(kind, today) {
  let from;
  let to;
  if (kind === 'month') {
    from = firstOfMonth(today);
    to = today;
  } else if (kind === 'last_month') {
    from = firstOfMonth(today, 1);
    to = addDays(firstOfMonth(today), -1);
  } else {
    to = addDays(today, -1);
    from = addDays(to, -6);
  }
  const length = daysBetween(from, to);
  const prevTo = addDays(from, -1);
  return { kind, from, to, previous: { from: addDays(prevTo, -(length - 1)), to: prevTo } };
}

export const PERIOD_KINDS = ['week', 'month', 'last_month'];

// ---------- Resumo ----------

function delta(now, before) {
  if (!before) return null;
  return (now - before) / before;
}

function pctText(d) {
  if (d === null) return '';
  const p = Math.round(Math.abs(d) * 100);
  if (p === 0) return ' (igual ao período anterior)';
  return ` (${d > 0 ? '+' : '−'}${p}% em relação ao período anterior)`;
}

export function derive(s) {
  const marked = s.arrived + s.noShow;
  return {
    attendance: marked >= 3 ? s.arrived / marked : null,
    costPerReservation: s.reservations > 0 && s.spend > 0 ? s.spend / s.reservations : null,
    costPerConversation: s.conversations > 0 && s.spend > 0 ? s.spend / s.conversations : null,
    costPerClick: s.clicks > 0 && s.spend > 0 ? s.spend / s.clicks : null,
    ctr: s.impressions > 0 ? s.clicks / s.impressions : null,
    reservationRate: s.conversations > 0 ? s.reservations / s.conversations : 0
  };
}

const int = new Intl.NumberFormat('pt-BR');

// Frases curtas pro dono ler em 10 segundos. O anúncio não serve só pra reserva: conversa,
// visualização e o que as pessoas procuraram vêm antes; reserva entra quando existe.
export function buildHeadline(cur, prev) {
  const lines = [];
  const d = derive(cur);
  lines.push(`${cur.conversations} ${cur.conversations === 1 ? 'pessoa chamou' : 'pessoas chamaram'} no WhatsApp${pctText(delta(cur.conversations, prev.conversations))}.`);
  if (cur.impressions > 0) {
    lines.push(`Os anúncios foram vistos ${int.format(cur.impressions)} vezes${pctText(delta(cur.impressions, prev.impressions))} e geraram ${int.format(cur.clicks)} cliques${d.ctr !== null ? ` (${(d.ctr * 100).toFixed(1).replace('.', ',')}% de quem viu clicou)` : ''}.`);
  }
  if (d.costPerConversation !== null) lines.push(`Cada conversa custou ${brl.format(d.costPerConversation)} em anúncio.`);
  const wanted = topicsText(cur.topics);
  if (wanted) lines.push(`O que mais procuraram: ${wanted}.`);
  if (cur.reservations > 0) {
    lines.push(`${cur.reservations} ${cur.reservations === 1 ? 'reserva' : 'reservas'} (${cur.people} pessoas)${pctText(delta(cur.reservations, prev.reservations))}.`);
    if (d.attendance !== null) lines.push(`${Math.round(d.attendance * 100)}% de quem tinha reserva compareceu.`);
  }
  if (cur.response?.unanswered > 0) {
    lines.push(`${cur.response.unanswered} ${cur.response.unanswered === 1 ? 'conversa ficou' : 'conversas ficaram'} sem resposta.`);
  }
  return lines;
}

export async function loadOwnerSummary(dbImpl, clientId, kind, now = new Date()) {
  const range = periodRange(kind, dayOf(now));
  const [current, previous] = await Promise.all([
    collectStats(dbImpl, clientId, range, now),
    collectStats(dbImpl, clientId, range.previous, now)
  ]);
  return {
    period: { kind, from: range.from, to: range.to },
    previousPeriod: range.previous,
    current: { ...current, ...derive(current) },
    previous: { ...previous, ...derive(previous) },
    headline: buildHeadline(current, previous)
  };
}

// ---------- Unidades ----------

export async function loadUnits(dbImpl, kind, now = new Date()) {
  const range = periodRange(kind, dayOf(now));
  const { rows: clients } = await dbImpl.query(
    `SELECT id, name, COALESCE(NULLIF(TRIM(group_name), ''), NULL) AS group_name FROM clients ORDER BY name ASC`
  );
  const units = [];
  for (const c of clients) {
    const stats = await collectStats(dbImpl, c.id, range, now);
    units.push({ clientId: c.id, name: c.name, group: c.group_name, ...stats, ...derive(stats) });
  }
  units.sort((a, b) => (a.group || '~').localeCompare(b.group || '~') || b.reservations - a.reservations || b.conversations - a.conversations);
  return { period: { kind, from: range.from, to: range.to }, units };
}

// ---------- Implantação ----------

// facts: { hasMeta, hasGoogle, campaigns, hasWhatsApp, reservationsEnabled, tables, hasHours,
// trackingLinks, capiEnabled, reviewUrl, ownerPhones, infoMenu }
export function buildOnboarding(f) {
  const steps = [
    { key: 'meta', title: 'Conectar o Meta Ads', done: f.hasMeta, hint: 'Chaves e APIs → aba Meta: token de acesso e conta de anúncio.', tab: 'credentials' },
    { key: 'google', title: 'Conectar o Google Ads', done: f.hasGoogle, optional: true, hint: 'Chaves e APIs → aba Google (ou importar o CSV enquanto a API não libera).', tab: 'credentials' },
    { key: 'campaigns', title: 'Campanhas sincronizadas', done: f.campaigns > 0, hint: 'Aparece sozinho depois da primeira sincronização com as chaves salvas.', tab: 'dashboard' },
    { key: 'whatsapp', title: 'WhatsApp conectado', done: f.hasWhatsApp, hint: 'Chaves e APIs → aba WhatsApp: escanear o QR code e definir o PIN da equipe.', tab: 'credentials' },
    { key: 'tracking', title: 'Link rastreável criado', done: f.trackingLinks > 0, hint: 'Links e Conversões → criar o link usado nos anúncios e nas bios.', tab: 'tracking-links' },
    { key: 'capi', title: 'Pixel e conversões da Meta', done: f.capiEnabled, optional: true, hint: 'Links e Conversões → ID do Pixel e ativar.', tab: 'tracking-links' },
    { key: 'reservations', title: 'Reservas ligadas, com mesas e horários', done: f.reservationsEnabled && f.tables > 0 && f.hasHours, optional: true, hint: 'Clientes → ligar "Reservas pelo WhatsApp"; depois, no Balcão: Reservas → Configurar.', tab: 'clients' },
    { key: 'menu', title: 'Respostas automáticas (cardápio, preços, horário, localização)', done: f.infoMenu, optional: true, hint: 'Balcão → Reservas → Configurar → Respostas automáticas.' },
    { key: 'review', title: 'Link de avaliação do Google', done: f.reviewUrl, optional: true, hint: 'Balcão → Reservas → Configurar → Lembrete, avaliação e resumo.' },
    { key: 'owner', title: 'WhatsApp do dono para o resumo semanal', done: f.ownerPhones, optional: true, hint: 'Balcão → Reservas → Configurar → Lembrete, avaliação e resumo.' }
  ];
  steps.forEach((s) => { s.done = Boolean(s.done); });
  const required = steps.filter((s) => !s.optional);
  return {
    steps,
    requiredDone: required.filter((s) => s.done).length,
    requiredTotal: required.length,
    done: steps.filter((s) => s.done).length,
    total: steps.length
  };
}

export async function loadOnboarding(dbImpl, clientId, loadSettings) {
  const count = async (sql, params = [clientId]) => Number((await dbImpl.query(sql, params)).rows[0]?.n) || 0;
  const [cred, campaigns, whats, links, capi, client] = await Promise.all([
    dbImpl.query(`SELECT platform FROM credentials WHERE client_id = ?`, [clientId]),
    count(`SELECT COUNT(*) AS n FROM campaigns WHERE client_id = ?`),
    count(`SELECT COUNT(*) AS n FROM whatsapp_settings WHERE client_id = ?`),
    count(`SELECT COUNT(*) AS n FROM tracking_links WHERE client_id = ?`),
    dbImpl.query(`SELECT enabled FROM capi_settings WHERE client_id = ?`, [clientId]),
    dbImpl.query(`SELECT reservations_enabled FROM clients WHERE id = ?`, [clientId])
  ]);
  const platforms = new Set(cred.rows.map((r) => r.platform));
  const settings = await loadSettings(dbImpl, clientId);
  return buildOnboarding({
    hasMeta: platforms.has('meta'),
    hasGoogle: platforms.has('google'),
    campaigns,
    hasWhatsApp: whats > 0,
    reservationsEnabled: Boolean(client.rows[0]?.reservations_enabled),
    tables: (settings.tables || []).reduce((sum, t) => sum + (Number(t.count) || 0), 0),
    hasHours: Object.values(settings.hours || {}).some((shifts) => shifts?.length > 0),
    trackingLinks: links,
    capiEnabled: Boolean(capi.rows[0]?.enabled),
    reviewUrl: Boolean(settings.followup?.google_review_url),
    ownerPhones: Boolean((settings.followup?.owner_phones || '').trim()),
    infoMenu: Boolean(settings.info?.enabled && (settings.info.menu || '').trim())
  });
}
