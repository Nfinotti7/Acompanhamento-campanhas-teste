// Gravação das reservas e da configuração de mesas/horários. A checagem de vaga e o
// INSERT rodam na mesma transação, com trava por cliente: duas pessoas confirmando a
// última mesa ao mesmo tempo não levam as duas.
import { broadcast } from './sseHub.js';
import { moveToAutoStage } from './crmStages.js';
import { DEFAULT_RESERVATION_SETTINGS, pickTableSize, tablesForDay, dayOf } from './reservationSlots.js';

// Chave do pg_advisory_xact_lock: LOCK_BASE + client_id (longe de qualquer outra trava).
export const LOCK_BASE = 900000;

// Configuração inválida (mensagem pronta pra mostrar na tela).
export class ReservationSettingsError extends Error {}

export class SlotTakenError extends Error {
  constructor() {
    super('Esse horário não tem mais mesa livre.');
  }
}


function resolveDeps(deps) {
  return {
    broadcast: deps.broadcast || broadcast,
    moveToAutoStage: deps.moveToAutoStage || moveToAutoStage
  };
}

export async function loadReservationSettings(dbImpl, clientId) {
  const { rows } = await dbImpl.query(`SELECT config FROM reservation_settings WHERE client_id = ?`, [clientId]);
  const config = rows[0]?.config || {};
  return {
    ...DEFAULT_RESERVATION_SETTINGS,
    ...config,
    hours: { ...DEFAULT_RESERVATION_SETTINGS.hours, ...(config.hours || {}) }
  };
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function validTables(tables) {
  return Array.isArray(tables) && tables.every((t) =>
    Number.isInteger(t.seats) && t.seats >= 1 && t.seats <= 30 && Number.isInteger(t.count) && t.count >= 0 && t.count <= 50);
}

function validateSettings(s) {
  if (!validTables(s.tables)) throw new ReservationSettingsError('Mesa inválida: use de 1 a 30 lugares e até 50 mesas por tamanho.');
  for (const shifts of Object.values(s.hours)) {
    for (const shift of shifts || []) {
      if (!HHMM.test(shift.start) || !HHMM.test(shift.lastBooking) || shift.start > shift.lastBooking) {
        throw new ReservationSettingsError('Horário inválido: o último horário de reserva precisa ser depois do início.');
      }
    }
  }
  for (const e of s.exceptions) {
    if (!DAY.test(e.date || '')) throw new ReservationSettingsError('Exceção sem data válida.');
    if (e.tables && !validTables(e.tables)) throw new ReservationSettingsError('Mesa inválida na exceção de ' + e.date + '.');
  }
  const ints = ['duration_minutes', 'slot_minutes', 'hold_minutes', 'min_advance_minutes', 'max_advance_days'];
  for (const key of ints) {
    if (!Number.isInteger(s[key]) || s[key] < 0) throw new ReservationSettingsError(`Valor inválido em ${key}.`);
  }
  if (s.slot_minutes < 5 || s.duration_minutes < 15) throw new ReservationSettingsError('Duração ou intervalo muito curtos.');
  if (s.max_party !== null && (!Number.isInteger(s.max_party) || s.max_party < 1)) throw new ReservationSettingsError('Limite de grupo inválido.');
}

export async function saveReservationSettings(dbImpl, clientId, patch) {
  const current = await loadReservationSettings(dbImpl, clientId);
  const next = { ...current, ...patch, hours: { ...current.hours, ...(patch.hours || {}) } };
  validateSettings(next);
  await dbImpl.query(
    `INSERT INTO reservation_settings (client_id, config, updated_at) VALUES (?, ?::jsonb, now())
     ON CONFLICT (client_id) DO UPDATE SET config = excluded.config, updated_at = now()`,
    [clientId, JSON.stringify(next)]
  );
  return next;
}

async function overlapping(q, { clientId, startsAt, endsAt, exceptId = null }) {
  const { rows } = await q.query(
    `SELECT id, table_seats, starts_at, ends_at FROM reservations
     WHERE client_id = ? AND status IN ('confirmed', 'arrived') AND starts_at < ? AND ends_at > ?
       AND (?::int IS NULL OR id <> ?::int)`,
    [clientId, endsAt, startsAt, exceptId, exceptId]
  );
  return rows;
}

// Mesa pro horário; com force (reserva manual acima do limite), a menor que comporta.
async function chooseSeats(q, { clientId, partySize, startsAt, force, exceptId }) {
  const settings = await loadReservationSettings(q, clientId);
  const endsAt = new Date(startsAt.getTime() + settings.duration_minutes * 60e3);
  const tables = tablesForDay(settings, dayOf(startsAt));
  const reservations = await overlapping(q, { clientId, startsAt, endsAt, exceptId });
  const seats = pickTableSize({ tables, reservations, startsAt, durationMinutes: settings.duration_minutes, partySize });
  if (seats !== null) return { seats, endsAt, overLimit: false };
  if (!force) throw new SlotTakenError();
  const fits = tables.map((t) => t.seats).filter((s) => s >= partySize).sort((a, b) => a - b);
  return { seats: fits[0] ?? partySize, endsAt, overLimit: true };
}

function lock(q, clientId) {
  return q.query(`SELECT pg_advisory_xact_lock(?)`, [LOCK_BASE + Number(clientId)]);
}

// appointment_at do contato = próxima reserva confirmada (a Agenda e o Funil leem dali).
export async function syncContactAppointment(dbImpl, contactId) {
  await dbImpl.query(
    `UPDATE whatsapp_contacts SET appointment_at = (
       SELECT MIN(starts_at) FROM reservations
       WHERE contact_id = ? AND status = 'confirmed' AND starts_at > now() - interval '2 hours'
     ) WHERE id = ?`,
    [contactId, contactId]
  );
}

export async function createReservation(dbImpl, { clientId, contactId = null, name, phone, partySize, startsAt, source, force = false }, deps = {}) {
  const d = resolveDeps(deps);
  const reservation = await dbImpl.withTransaction(async (q) => {
    await lock(q, clientId);
    const { seats, endsAt, overLimit } = await chooseSeats(q, { clientId, partySize, startsAt, force });
    const { rows } = await q.query(
      `INSERT INTO reservations (client_id, contact_id, name, phone, party_size, table_seats, starts_at, ends_at, source, over_limit, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed') RETURNING *`,
      [clientId, contactId, name || null, phone || null, partySize, seats, startsAt, endsAt, source, overLimit]
    );
    return rows[0];
  });
  if (contactId) {
    await syncContactAppointment(dbImpl, contactId);
    await d.moveToAutoStage(dbImpl, { clientId, contactId, event: 'agendado' });
  }
  d.broadcast(clientId, 'reservation', { id: reservation.id, contactId });
  return reservation;
}

export async function updateReservation(dbImpl, { clientId, id, partySize, startsAt, name, force = false }, deps = {}) {
  const d = resolveDeps(deps);
  const reservation = await dbImpl.withTransaction(async (q) => {
    await lock(q, clientId);
    const { rows } = await q.query(`SELECT * FROM reservations WHERE id = ? AND client_id = ?`, [id, clientId]);
    const current = rows[0];
    if (!current) return null;
    const size = partySize ?? current.party_size;
    const start = startsAt ?? new Date(current.starts_at);
    const { seats, endsAt, overLimit } = await chooseSeats(q, { clientId, partySize: size, startsAt: start, force, exceptId: id });
    const { rows: updated } = await q.query(
      `UPDATE reservations SET party_size = ?, table_seats = ?, starts_at = ?, ends_at = ?, name = ?, over_limit = ?, updated_at = now()
       WHERE id = ? RETURNING *`,
      [size, seats, start, endsAt, name ?? current.name, overLimit, id]
    );
    return updated[0];
  });
  if (!reservation) return null;
  if (reservation.contact_id) await syncContactAppointment(dbImpl, reservation.contact_id);
  d.broadcast(clientId, 'reservation', { id, contactId: reservation.contact_id });
  return reservation;
}

// De onde cada status pode vir. Chegou/não veio podem ser desfeitos (volta a confirmed).
const FROM = {
  cancelled: ['confirmed'],
  arrived: ['confirmed', 'no_show'],
  no_show: ['confirmed', 'arrived'],
  confirmed: ['arrived', 'no_show']
};

export async function setReservationStatus(dbImpl, { clientId, id, status, cancelledBy = null }, deps = {}) {
  const d = resolveDeps(deps);
  const from = FROM[status];
  if (!from) throw new Error(`Status inválido: ${status}`);
  const { rows } = await dbImpl.query(
    `UPDATE reservations SET status = ?, cancelled_by = ?, updated_at = now()
     WHERE id = ? AND client_id = ? AND status = ANY(?) RETURNING *`,
    [status, status === 'cancelled' ? cancelledBy : null, id, clientId, from]
  );
  const reservation = rows[0];
  if (!reservation) return null;
  if (reservation.contact_id) await syncContactAppointment(dbImpl, reservation.contact_id);
  d.broadcast(clientId, 'reservation', { id, contactId: reservation.contact_id });
  return reservation;
}

// Reservas que ocupam algum pedaço de [from, to), com a origem do contato (anúncio).
export async function listReservations(dbImpl, { clientId, from, to }) {
  const { rows } = await dbImpl.query(
    `SELECT r.*, wc.profile_name, wc.wa_id, wc.source AS contact_source, wc.tracking_method,
            c.campaign_name, c.ad_name
     FROM reservations r
     LEFT JOIN whatsapp_contacts wc ON wc.id = r.contact_id
     LEFT JOIN meta_ad_cache c ON c.ad_id = wc.ad_id
     WHERE r.client_id = ? AND r.starts_at < ? AND r.ends_at > ?
     ORDER BY r.starts_at ASC, r.id ASC`,
    [clientId, to, from]
  );
  return rows;
}

export async function upcomingReservationsForContact(dbImpl, { clientId, contactId, now = new Date() }) {
  const { rows } = await dbImpl.query(
    `SELECT * FROM reservations
     WHERE client_id = ? AND contact_id = ? AND status = 'confirmed' AND starts_at > ?
     ORDER BY starts_at ASC`,
    [clientId, contactId, now]
  );
  return rows;
}
