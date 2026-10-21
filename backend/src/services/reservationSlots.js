// Disponibilidade das reservas: horários do dia e mesa livre por tamanho. Tudo puro,
// sem banco. Brasília tratado como UTC-3 fixo (mesma regra do relatório do Na Mesa).

const OFFSET_MS = 3 * 3600e3;
const DAY_MS = 24 * 3600e3;

export const DEFAULT_RESERVATION_SETTINGS = {
  tables: [],
  hours: { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] }, // 0 = domingo
  exceptions: [],
  duration_minutes: 120,
  slot_minutes: 30,
  hold_minutes: 15,
  min_advance_minutes: 120,
  max_advance_days: 30,
  max_party: null,
  ad_fallback: false,
  bot_enabled: true,
  messages: {}
};

export function toInstant(day, hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.parse(`${day}T00:00:00Z`) + (h * 60 + m) * 60e3 + OFFSET_MS);
}

export function dayOf(date) {
  return new Date(date.getTime() - OFFSET_MS).toISOString().slice(0, 10);
}

export function weekdayOf(day) {
  return new Date(`${day}T12:00:00Z`).getUTCDay();
}

export function addDays(day, n) {
  return new Date(Date.parse(`${day}T12:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

function minutesOf(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function hhmmOf(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function tablesForDay(settings, day) {
  const exception = (settings.exceptions || []).find((e) => e.date === day);
  if (exception?.closed) return [];
  if (exception?.tables) return exception.tables;
  return settings.tables || [];
}

export function slotsForDay(settings, day) {
  const shifts = settings.hours?.[weekdayOf(day)] || [];
  const step = settings.slot_minutes || 30;
  const slots = new Set();
  for (const { start, lastBooking } of shifts) {
    for (let t = minutesOf(start); t <= minutesOf(lastBooking); t += step) slots.add(t);
  }
  return [...slots].sort((a, b) => a - b).map(hhmmOf);
}

function overlaps(r, startMs, endMs) {
  return new Date(r.starts_at).getTime() < endMs && new Date(r.ends_at).getTime() > startMs;
}

function freeBySize({ tables, reservations, startsAt, durationMinutes }) {
  const startMs = startsAt.getTime();
  const endMs = startMs + durationMinutes * 60e3;
  const busy = reservations.filter((r) => overlaps(r, startMs, endMs));
  const free = {};
  for (const { seats, count } of tables) {
    free[seats] = (free[seats] || 0) + count;
  }
  for (const r of busy) {
    if (r.table_seats in free) free[r.table_seats] -= 1;
  }
  return free;
}

export function pickTableSize({ tables, reservations, startsAt, durationMinutes, partySize }) {
  const free = freeBySize({ tables, reservations, startsAt, durationMinutes });
  const sizes = Object.keys(free).map(Number).filter((s) => s >= partySize).sort((a, b) => a - b);
  return sizes.find((s) => free[s] > 0) ?? null;
}

export function maxParty(settings) {
  if (settings.max_party) return settings.max_party;
  return Math.max(0, ...(settings.tables || []).map((t) => t.seats));
}

export function availableSlots({ settings, day, partySize, reservations, now }) {
  if (partySize > maxParty(settings)) return [];
  const today = dayOf(now);
  if (day < today || day > addDays(today, settings.max_advance_days)) return [];
  const earliest = now.getTime() + settings.min_advance_minutes * 60e3;
  const tables = tablesForDay(settings, day);
  const result = [];
  for (const time of slotsForDay(settings, day)) {
    const startsAt = toInstant(day, time);
    if (startsAt.getTime() < earliest) continue;
    const tableSeats = pickTableSize({ tables, reservations, startsAt, durationMinutes: settings.duration_minutes, partySize });
    if (tableSeats !== null) result.push({ time, startsAt, tableSeats });
  }
  return result;
}

export function occupancyForDay({ settings, day, reservations }) {
  const tables = tablesForDay(settings, day);
  return slotsForDay(settings, day).map((time) => ({
    time,
    free: freeBySize({ tables, reservations, startsAt: toInstant(day, time), durationMinutes: settings.duration_minutes })
  }));
}
