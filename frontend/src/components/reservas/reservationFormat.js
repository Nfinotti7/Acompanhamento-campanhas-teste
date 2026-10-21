// Formatação da tela Reservas. Brasília como UTC-3 fixo, igual ao backend
// (services/reservationSlots.js), pra tela e robô mostrarem o mesmo horário.

const OFFSET_MS = 3 * 3600e3;
const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

const STATUS = { confirmed: 'Confirmada', arrived: 'Chegou', no_show: 'Não veio', cancelled: 'Cancelada' };

export function statusLabel(status) {
  return STATUS[status] || status;
}

export function originLabel(r) {
  if (r.source === 'manual') return 'Telefone/balcão';
  if (r.contact_source === 'ad') return r.campaign_name ? `Anúncio · ${r.campaign_name}` : 'Anúncio';
  if (r.contact_source === 'google_ads') return 'Google';
  if (r.tracking_method === 'link') return 'Link';
  return '';
}

export function timeOf(iso) {
  return new Date(new Date(iso).getTime() - OFFSET_MS).toISOString().slice(11, 16);
}

export function todayBrasilia(now = new Date()) {
  return new Date(now.getTime() - OFFSET_MS).toISOString().slice(0, 10);
}

export function addDaysISO(day, n) {
  return new Date(Date.parse(`${day}T12:00:00Z`) + n * 24 * 3600e3).toISOString().slice(0, 10);
}

export function dayTitle(day, today) {
  const [, m, d] = day.split('-');
  const label = `${WEEKDAYS[new Date(`${day}T12:00:00Z`).getUTCDay()]}, ${d}/${m}`;
  if (day === today) return `Hoje · ${label}`;
  if (day === addDaysISO(today, 1)) return `Amanhã · ${label}`;
  return label;
}

export function groupByTime(reservations) {
  const groups = new Map();
  const sorted = [...reservations].sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at) || a.id - b.id);
  for (const r of sorted) {
    const time = timeOf(r.starts_at);
    if (!groups.has(time)) groups.set(time, []);
    groups.get(time).push(r);
  }
  return [...groups.entries()].map(([time, items]) => ({ time, items }));
}

// Confere o formulário de Configurar antes de salvar (o backend valida de novo).
export function validateSettingsForm({ tables = [], hours = {}, exceptions = [] }) {
  const seen = new Set();
  for (const t of tables) {
    const seats = Number(t.seats);
    if (!Number.isInteger(seats) || seats < 1 || seats > 30) return 'Preencha os lugares de cada mesa (1 a 30).';
    if (!Number.isInteger(Number(t.count)) || Number(t.count) < 0) return 'Quantidade de mesas inválida.';
    if (seen.has(seats)) return `Mesa de ${seats} lugares repetida: some as quantidades numa linha só.`;
    seen.add(seats);
  }
  for (const shifts of Object.values(hours)) {
    for (const s of shifts || []) {
      if (!s.start || !s.lastBooking || s.start > s.lastBooking) return 'Horário inválido: o último horário de reserva precisa ser depois do início.';
    }
  }
  for (const e of exceptions) {
    if (!e.date) return 'Toda exceção precisa de uma data.';
  }
  return null;
}
