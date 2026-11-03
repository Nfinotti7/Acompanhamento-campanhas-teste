// Lista de espera de vaga: dia lotado → o robô oferece "AVISAR"; quando uma reserva é
// cancelada (ou a equipe libera mesa), o primeiro da fila recebe os horários que abriram e
// a conversa de reserva continua do passo "escolher horário" (reservationBot.js).
import db from '../config/db.js';
import { sendToContact } from './whatsappSender.js';
import { isBotPaused } from './botPause.js';
import { firstName, renderMessage } from './waitlistText.js';
import { availableSlots, dayOf, toInstant } from './reservationSlots.js';
import { DEFAULT_RESERVATION_MESSAGES, formatDayLabel, formatOptions } from './reservationText.js';
import { loadReservationSettings, listReservations } from './reservationStore.js';
import { isUniqueViolation } from './waitlistQueue.js';

// Quem recebeu a oferta tem esse tempo pra responder antes da vez passar pro próximo.
export const OFFER_HOLD_MS = 30 * 60e3;
const QUIET = { from: 8, to: 22 };

function resolveDeps(deps) {
  return {
    db: deps.db || db,
    now: deps.now ? deps.now() : new Date(),
    send: deps.send || sendToContact,
    loadSettings: deps.loadSettings || loadReservationSettings,
    listReservations: deps.listReservations || listReservations,
    isBotPaused: deps.isBotPaused || isBotPaused
  };
}

function inServiceHours(now) {
  const h = new Date(now.getTime() - 3 * 3600e3).getUTCHours();
  return h >= QUIET.from && h < QUIET.to;
}

export async function addWaiter(dbImpl, { clientId, contactId, day, partySize, name }) {
  await dbImpl.query(
    `INSERT INTO reservation_waiters (client_id, contact_id, day, party_size, name)
     VALUES (?, ?, ?::date, ?, ?)
     ON CONFLICT (client_id, contact_id, day) WHERE status IN ('waiting', 'notified')
     DO UPDATE SET party_size = excluded.party_size, name = COALESCE(excluded.name, reservation_waiters.name), status = 'waiting', notified_at = NULL`,
    [clientId, contactId, day, partySize, name || null]
  );
}

// Fecha o que não vale mais: dia que passou, ou quem já reservou aquele dia.
async function closeStale(d, clientId) {
  await d.db.query(
    `UPDATE reservation_waiters SET status = 'expired'
     WHERE client_id = ? AND status IN ('waiting', 'notified') AND day < ?::date`,
    [clientId, dayOf(d.now)]
  );
  await d.db.query(
    `UPDATE reservation_waiters w SET status = 'booked'
     WHERE w.client_id = ? AND w.status IN ('waiting', 'notified') AND EXISTS (
       SELECT 1 FROM reservations r
       WHERE r.contact_id = w.contact_id AND r.client_id = w.client_id AND r.status IN ('confirmed', 'arrived')
         AND (r.starts_at AT TIME ZONE 'America/Sao_Paulo')::date = w.day)`,
    [clientId]
  );
}

// Oferece a vaga ao primeiro da fila de cada dia, se algum horário abriu. Devolve quantas
// ofertas saíram. Chamada no cancelamento e a cada ciclo do agendador.
export async function offerVacancies(clientId, deps = {}) {
  const d = resolveDeps(deps);
  const settings = await d.loadSettings(d.db, clientId);
  if (!settings.followup?.vacancy_enabled || !settings.bot_enabled) return 0;
  await closeStale(d, clientId);
  if (!inServiceHours(d.now)) return 0;

  const { rows: waiters } = await d.db.query(
    `SELECT w.*, w.day::text AS day_text, wc.profile_name, cl.name AS restaurant_name
     FROM reservation_waiters w
     JOIN whatsapp_contacts wc ON wc.id = w.contact_id
     JOIN clients cl ON cl.id = w.client_id
     WHERE w.client_id = ? AND w.status IN ('waiting', 'notified')
     ORDER BY w.day ASC, w.created_at ASC`,
    [clientId]
  );
  const holdSince = d.now.getTime() - OFFER_HOLD_MS;
  const busyDays = new Set(
    waiters.filter((w) => w.status === 'notified' && new Date(w.notified_at).getTime() > holdSince).map((w) => w.day_text)
  );
  let offered = 0;
  for (const w of waiters) {
    const day = w.day_text;
    if (w.status === 'notified') {
      // Não respondeu a tempo: sai da frente (a vez vai pro próximo da fila).
      if (new Date(w.notified_at).getTime() <= holdSince) {
        await d.db.query(`UPDATE reservation_waiters SET status = 'expired' WHERE id = ?`, [w.id]);
      }
      continue;
    }
    if (busyDays.has(day)) continue; // outra pessoa está com a oferta desse dia
    if (await d.isBotPaused(d.db, { contactId: w.contact_id, now: d.now })) continue;

    const from = new Date(toInstant(day, '00:00').getTime() - settings.duration_minutes * 60e3);
    const to = new Date(toInstant(day, '00:00').getTime() + 24 * 3600e3 + settings.duration_minutes * 60e3);
    const occupying = (await d.listReservations(d.db, { clientId, from, to })).filter((r) => ['confirmed', 'arrived'].includes(r.status));
    const slots = availableSlots({ settings, day, partySize: w.party_size, reservations: occupying, now: d.now });
    if (slots.length === 0) continue;
    const options = slots.map((s) => s.time);

    // A conversa de reserva continua daqui: escolher o horário. Se a pessoa já está numa
    // conversa (índice único), espera a próxima rodada.
    try {
      await d.db.query(
        `INSERT INTO reservation_conversations (client_id, contact_id, status, step, data)
         VALUES (?, ?, 'active', 'time', ?::jsonb)`,
        [clientId, w.contact_id, JSON.stringify({ size: w.party_size, day, options })]
      );
    } catch (error) {
      if (isUniqueViolation(error)) continue;
      throw error;
    }
    const { rows: claimed } = await d.db.query(
      `UPDATE reservation_waiters SET status = 'notified', notified_at = ? WHERE id = ? AND status = 'waiting' RETURNING id`,
      [d.now, w.id]
    );
    if (claimed.length === 0) continue;
    busyDays.add(day);
    const text = renderMessage(settings.messages?.waitOpened || DEFAULT_RESERVATION_MESSAGES.waitOpened, {
      nome: firstName(w.name || w.profile_name),
      restaurante: w.restaurant_name || '',
      dia: formatDayLabel(day, dayOf(d.now)),
      pessoas: w.party_size,
      opcoes: formatOptions(options)
    });
    try {
      await d.send({ clientId, contactId: w.contact_id, sentBy: 'bot_reserva', body: text });
      offered += 1;
    } catch (error) {
      // Não saiu: volta pra fila e libera a conversa.
      await d.db.query(`UPDATE reservation_waiters SET status = 'waiting', notified_at = NULL WHERE id = ?`, [w.id]);
      await d.db.query(`UPDATE reservation_conversations SET status = 'expired' WHERE client_id = ? AND contact_id = ? AND status = 'active'`, [clientId, w.contact_id]);
      busyDays.delete(day);
      console.error(`Lista de espera: falha ao avisar o contato ${w.contact_id}:`, error.message);
    }
  }
  return offered;
}

// Ciclo do agendador: todos os clientes com alguém esperando.
export async function runVacancySweep(deps = {}) {
  const d = resolveDeps(deps);
  const { rows } = await d.db.query(
    `SELECT DISTINCT client_id FROM reservation_waiters WHERE status IN ('waiting', 'notified')`
  );
  let offered = 0;
  for (const { client_id: clientId } of rows) {
    try {
      offered += await offerVacancies(clientId, deps);
    } catch (error) {
      console.error(`Lista de espera: erro no cliente ${clientId}:`, error.message);
    }
  }
  return offered;
}
