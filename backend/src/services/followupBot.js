// Lembrete de reserva (com confirmação de presença) e pedido de avaliação depois da visita.
// Só escreve pra quem já conversou com o restaurante e fez reserva -- nunca disparo em
// massa. Mesmo cuidado do robô de reserva: grava antes de enviar (whatsappSender.js), não
// diz que é robô e passa pra equipe quando a nota é baixa.
import db from '../config/db.js';
import { broadcast } from './sseHub.js';
import { sendToContact } from './whatsappSender.js';
import { isBotPaused, pauseBot } from './botPause.js';
import { firstName, renderMessage } from './waitlistText.js';
import { dayOf } from './reservationSlots.js';
import { formatDayLabel, formatTime } from './reservationText.js';
import { loadReservationSettings } from './reservationStore.js';
import {
  DEFAULT_FOLLOWUP_MESSAGES, isReminderDue, isReviewDue, isConfirmReply, parseRating, pluralPeople,
  RATING_WINDOW_MS
} from './followupText.js';

function resolveDeps(deps) {
  return {
    db: deps.db || db,
    now: deps.now ? deps.now() : new Date(),
    send: deps.send || sendToContact,
    broadcast: deps.broadcast || broadcast,
    loadSettings: deps.loadSettings || loadReservationSettings,
    isBotPaused: deps.isBotPaused || isBotPaused,
    pauseBot: deps.pauseBot || pauseBot
  };
}

function hhmmInBrasilia(date) {
  return new Date(new Date(date).getTime() - 3 * 3600e3).toISOString().slice(11, 16);
}

function messageText(followup, key, vars) {
  return renderMessage(followup.messages?.[key]?.trim() || DEFAULT_FOLLOWUP_MESSAGES[key], vars);
}

// Reservas com contato, de clientes com reservas ligadas e WhatsApp pelo Baileys (a API
// oficial só deixa escrever primeiro com modelo aprovado, que ainda não existe aqui).
const BASE_SELECT = `
  SELECT r.*, wc.wa_id, wc.profile_name, cl.name AS restaurant_name
  FROM reservations r
  JOIN whatsapp_contacts wc ON wc.id = r.contact_id
  JOIN clients cl ON cl.id = r.client_id
  JOIN whatsapp_settings ws ON ws.client_id = r.client_id AND ws.connection_type = 'baileys'
  WHERE cl.reservations_enabled = true AND r.contact_id IS NOT NULL`;

async function settingsCache(d) {
  const cache = new Map();
  return async (clientId) => {
    if (!cache.has(clientId)) cache.set(clientId, d.loadSettings(d.db, clientId));
    return cache.get(clientId);
  };
}

// Lembrete: uma vez por reserva, N horas antes. A linha é "reservada" (reminder_sent_at)
// antes do envio: dois processos rodando juntos não mandam duas vezes.
export async function runReminders(deps = {}) {
  const d = resolveDeps(deps);
  const settingsFor = await settingsCache(d);
  const { rows } = await d.db.query(
    `${BASE_SELECT} AND r.status = 'confirmed' AND r.reminder_sent_at IS NULL
       AND r.starts_at > ? AND r.starts_at < ?`,
    [d.now, new Date(d.now.getTime() + 30 * 3600e3)]
  );
  let sent = 0;
  for (const r of rows) {
    const settings = await settingsFor(r.client_id);
    const f = settings.followup;
    if (!f.reminder_enabled) continue;
    if (!isReminderDue({ startsAt: r.starts_at, createdAt: r.created_at, now: d.now, hoursBefore: f.reminder_hours_before })) continue;
    const { rows: claimed } = await d.db.query(
      `UPDATE reservations SET reminder_sent_at = ? WHERE id = ? AND reminder_sent_at IS NULL RETURNING id`,
      [d.now, r.id]
    );
    if (claimed.length === 0) continue;
    const body = messageText(f, 'reminder', {
      nome: firstName(r.name || r.profile_name),
      restaurante: r.restaurant_name || '',
      dia: formatDayLabel(dayOf(new Date(r.starts_at)), dayOf(d.now)),
      hora: formatTime(hhmmInBrasilia(r.starts_at)),
      pessoas: pluralPeople(r.party_size)
    });
    try {
      await d.send({ clientId: r.client_id, contactId: r.contact_id, sentBy: 'bot_lembrete', body });
      sent += 1;
    } catch (error) {
      // Não conseguiu enviar (WhatsApp desconectado): libera pra tentar de novo no próximo ciclo.
      await d.db.query(`UPDATE reservations SET reminder_sent_at = NULL WHERE id = ?`, [r.id]);
      console.error(`Lembrete: falha ao enviar da reserva ${r.id}:`, error.message);
    }
  }
  return sent;
}

// Avaliação: depois do fim da reserva, só pra quem a equipe marcou "chegou" ou confirmou
// presença no lembrete e não foi marcada como "não veio". Uma vez por reserva, e no
// máximo uma por contato por vez (duas reservas no mesmo dia não geram duas perguntas).
export async function runReviewRequests(deps = {}) {
  const d = resolveDeps(deps);
  const settingsFor = await settingsCache(d);
  const { rows } = await d.db.query(
    `${BASE_SELECT} AND r.review_requested_at IS NULL
       AND (r.status = 'arrived' OR (r.status = 'confirmed' AND r.client_confirmed_at IS NOT NULL))
       AND r.ends_at < ? AND r.ends_at > ?
     ORDER BY r.ends_at ASC`,
    [d.now, new Date(d.now.getTime() - 24 * 3600e3)]
  );
  let sent = 0;
  const askedContacts = new Set();
  for (const r of rows) {
    const settings = await settingsFor(r.client_id);
    const f = settings.followup;
    if (!f.review_enabled) continue;
    if (!isReviewDue({ endsAt: r.ends_at, now: d.now })) continue;
    if (askedContacts.has(r.contact_id)) continue;
    // Equipe conversando com a pessoa agora: não atravessa com uma pergunta de nota.
    if (await d.isBotPaused(d.db, { contactId: r.contact_id, now: d.now })) continue;
    const { rows: claimed } = await d.db.query(
      `UPDATE reservations SET review_requested_at = ? WHERE id = ? AND review_requested_at IS NULL RETURNING id`,
      [d.now, r.id]
    );
    if (claimed.length === 0) continue;
    askedContacts.add(r.contact_id);
    const body = messageText(f, 'reviewAsk', { nome: firstName(r.name || r.profile_name), restaurante: r.restaurant_name || '' });
    try {
      await d.send({ clientId: r.client_id, contactId: r.contact_id, sentBy: 'bot_avaliacao', body });
      sent += 1;
    } catch (error) {
      await d.db.query(`UPDATE reservations SET review_requested_at = NULL WHERE id = ?`, [r.id]);
      console.error(`Avaliação: falha ao enviar da reserva ${r.id}:`, error.message);
    }
  }
  return sent;
}

// Uma mensagem por vez por contato (igual aos outros robôs).
const queues = new Map();

export function handleInboundForFollowup(args, deps = {}) {
  const key = `${args.clientId}:${args.contactId}`;
  const previous = queues.get(key) || Promise.resolve();
  const run = previous.catch(() => {}).then(() => handleOne(args, deps));
  queues.set(key, run);
  run.catch(() => {}).finally(() => { if (queues.get(key) === run) queues.delete(key); });
  return run;
}

// Responde ao lembrete (SIM) e à pergunta de nota. Devolve 'ignored' pra qualquer outra
// coisa, que segue pras respostas automáticas e pra equipe.
async function handleOne({ clientId, contactId, profileName, body, restaurantName = '' }, deps = {}) {
  const d = resolveDeps(deps);
  const q = d.db;
  const text = body || '';

  const rating = parseRating(text);
  const confirm = rating === null && isConfirmReply(text);
  if (rating === null && !confirm) return 'ignored';

  const settings = await d.loadSettings(q, clientId);
  const f = settings.followup;
  const vars = { nome: firstName(profileName), restaurante: restaurantName };

  async function reply(key, extra = {}) {
    if (await d.isBotPaused(q, { contactId, now: d.now })) return;
    try {
      await d.send({ clientId, contactId, sentBy: 'bot_avaliacao', body: messageText(f, key, { ...vars, ...extra }) });
    } catch (error) {
      console.error(`Lembrete/avaliação: falha ao responder "${key}" pro contato ${contactId}:`, error.message);
    }
  }

  if (rating !== null) {
    if (!f.review_enabled) return 'ignored';
    // A pergunta mais recente que ainda espera nota.
    const { rows } = await q.query(
      `SELECT id FROM reservations
       WHERE client_id = ? AND contact_id = ? AND review_requested_at IS NOT NULL AND rating IS NULL
         AND review_requested_at > ?
       ORDER BY review_requested_at DESC LIMIT 1`,
      [clientId, contactId, new Date(d.now.getTime() - RATING_WINDOW_MS)]
    );
    if (!rows[0]) return 'ignored';
    await q.query(`UPDATE reservations SET rating = ?, rated_at = ? WHERE id = ?`, [rating, d.now, rows[0].id]);
    d.broadcast(clientId, 'reservation', { id: rows[0].id, contactId: Number(contactId) });
    if (rating >= 4) {
      const link = (f.google_review_url || '').trim();
      await reply(link ? 'reviewHigh' : 'reviewHighNoLink', { link });
      return 'rated_high';
    }
    // Nota baixa vai pra um humano: avisa o Balcão (som) e para de responder sozinho.
    await reply('reviewLow');
    await d.pauseBot(q, { clientId, contactId, now: d.now });
    d.broadcast(clientId, 'reservation', { contactId: Number(contactId), needsAttention: true });
    return 'rated_low';
  }

  // SIM ao lembrete: só vale se a pessoa recebeu o lembrete e a reserva ainda não passou.
  const { rows } = await q.query(
    `SELECT id, starts_at FROM reservations
     WHERE client_id = ? AND contact_id = ? AND status = 'confirmed' AND reminder_sent_at IS NOT NULL
       AND client_confirmed_at IS NULL AND starts_at > ?
     ORDER BY starts_at ASC LIMIT 1`,
    [clientId, contactId, new Date(d.now.getTime() - 3600e3)]
  );
  if (!rows[0]) return 'ignored';
  await q.query(`UPDATE reservations SET client_confirmed_at = ? WHERE id = ?`, [d.now, rows[0].id]);
  d.broadcast(clientId, 'reservation', { id: rows[0].id, contactId: Number(contactId) });
  await reply('reminderThanks', { hora: formatTime(hhmmInBrasilia(rows[0].starts_at)) });
  return 'presence_confirmed';
}
