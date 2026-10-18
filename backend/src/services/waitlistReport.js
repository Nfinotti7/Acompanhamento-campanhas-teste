// Relatório do dia do Na Mesa: quem passou pela fila, quantos sentaram, espera.
// A fila na tela só mostra as últimas 12h; o relatório guarda RETENTION_DAYS dias de
// serviço e o que for mais antigo é apagado (purgeOldEntries).
//
// "Dia de serviço" começa às 05:00 de Brasília: um jantar que passa da meia-noite
// continua no relatório do dia em que começou. Brasília é UTC-3 fixo (sem horário de verão).
export const RETENTION_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const SERVICE_DAY_OFFSET_MS = 8 * 60 * 60 * 1000; // 05:00 BRT = 08:00 UTC

const time = (v) => new Date(v).getTime();

export function serviceDayOf(date) {
  return new Date(time(date) - SERVICE_DAY_OFFSET_MS).toISOString().slice(0, 10);
}

export function serviceDayRange(day) {
  const start = new Date(Date.parse(`${day}T00:00:00Z`) + SERVICE_DAY_OFFSET_MS);
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

// Hoje e os dias anteriores dentro da retenção, mais recente primeiro.
export function recentServiceDays(now = new Date(), count = RETENTION_DAYS) {
  const today = serviceDayRange(serviceDayOf(now)).start.getTime();
  return Array.from({ length: count }, (_, i) => serviceDayOf(new Date(today - i * DAY_MS)));
}

const minutesBetween = (a, b) => Math.round((time(b) - time(a)) / 60000);

export function buildReport(entries) {
  const rows = [...entries]
    .sort((a, b) => time(a.joined_at) - time(b.joined_at) || a.id - b.id)
    .map((e) => ({
      id: e.id,
      name: e.name || null,
      phone: e.phone || null,
      party_size: e.party_size ?? null,
      source: e.source,
      // Quem nunca disse quantas pessoas eram não chegou a entrar na fila.
      status: e.party_size == null && e.status !== 'seated' ? 'not_answered' : e.status,
      joined_at: e.joined_at,
      called_at: e.called_at || null,
      finished_at: e.finished_at || null,
      wait_minutes: e.status === 'seated' && e.finished_at ? minutesBetween(e.joined_at, e.finished_at) : null
    }));

  const groups = rows.filter((r) => r.status !== 'not_answered');
  const seated = rows.filter((r) => r.status === 'seated');
  const waits = seated.map((r) => r.wait_minutes).filter((m) => m !== null);
  const people = (list) => list.reduce((sum, r) => sum + (r.party_size || 0), 0);
  return {
    summary: {
      groups: groups.length,
      people: people(groups),
      seatedGroups: seated.length,
      seatedPeople: people(seated),
      noShow: rows.filter((r) => r.status === 'no_show').length,
      left: rows.filter((r) => r.status === 'left').length,
      removed: rows.filter((r) => r.status === 'removed').length,
      notAnswered: rows.length - groups.length,
      avgWaitMinutes: waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : null,
      maxWaitMinutes: waits.length ? Math.max(...waits) : null
    },
    entries: rows
  };
}

export async function loadReport(dbImpl, { clientId, day, now = new Date() }) {
  const days = recentServiceDays(now);
  const selected = days.includes(day) ? day : days[0];
  const oldest = serviceDayRange(days[days.length - 1]).start;
  const { rows } = await dbImpl.query(
    `SELECT * FROM waitlist_entries WHERE client_id = ? AND joined_at >= ? ORDER BY joined_at ASC, id ASC`,
    [clientId, oldest]
  );
  const byDay = new Map(days.map((d) => [d, []]));
  for (const e of rows) byDay.get(serviceDayOf(e.joined_at))?.push(e);
  return {
    day: selected,
    retentionDays: RETENTION_DAYS,
    days: days.map((d) => ({ day: d, groups: buildReport(byDay.get(d)).summary.groups })),
    ...buildReport(byDay.get(selected))
  };
}

// Apaga as entradas de antes do dia de serviço mais antigo da retenção (todos os
// restaurantes). Entrada ativa tão antiga já não aparece na fila (janela de 12h).
export async function purgeOldEntries(dbImpl, now = new Date()) {
  const days = recentServiceDays(now);
  const cutoff = serviceDayRange(days[days.length - 1]).start;
  const { rows } = await dbImpl.query('DELETE FROM waitlist_entries WHERE joined_at < ? RETURNING id', [cutoff]);
  return rows.length;
}
