// Conversa do robô de reserva. Só age com quem mandou o código RESERVA (mensagem pronta
// do anúncio), com quem já está numa conversa de reserva, ou com CANCELAR de quem tem
// reserva marcada. O resto do WhatsApp do restaurante segue pro atendimento humano.
// Quando um atendente responde, o robô pausa naquele contato (botPause.js).
import db from '../config/db.js';
import { broadcast } from './sseHub.js';
import { sendToContact } from './whatsappSender.js';
import { sendTyping } from './baileysClient.js';
import { isBotPaused, pauseBot } from './botPause.js';
import { firstName, renderMessage, parsePartySize } from './waitlistText.js';
import { isUniqueViolation } from './waitlistQueue.js';
import {
  availableSlots, slotsForDay, tablesForDay, maxParty, toInstant, dayOf, addDays
} from './reservationSlots.js';
import {
  DEFAULT_RESERVATION_MESSAGES, isReservationCommand, isCancelCommand, isYes, parseDay, parseTimeChoice,
  formatDayLabel, formatTime, formatOptions
} from './reservationText.js';
import {
  loadReservationSettings, createReservation, listReservations, upcomingReservationsForContact,
  setReservationStatus, SlotTakenError
} from './reservationStore.js';

export const EXPIRE_MS = 60 * 60e3;
const MAX_ATTEMPTS = 2;
const SUGGEST_DAYS = 7;
const RESERVATION_STEPS = ['ad_fallback', 'size', 'day', 'time', 'name', 'confirm'];

function resolveDeps(deps) {
  return {
    db: deps.db || db,
    now: deps.now ? deps.now() : new Date(),
    send: deps.send || sendToContact,
    typing: deps.typing || ((clientId, waId) => sendTyping(clientId, waId, 2000 + Math.floor(Math.random() * 2000))),
    broadcast: deps.broadcast || broadcast,
    loadSettings: deps.loadSettings || loadReservationSettings,
    isBotPaused: deps.isBotPaused || isBotPaused,
    pauseBot: deps.pauseBot || pauseBot,
    listReservations: deps.listReservations || listReservations,
    upcomingReservations: deps.upcomingReservations || upcomingReservationsForContact,
    createReservation: deps.createReservation || createReservation,
    setReservationStatus: deps.setReservationStatus || setReservationStatus
  };
}

function hhmmInBrasilia(date) {
  return new Date(new Date(date).getTime() - 3 * 3600e3).toISOString().slice(11, 16);
}

function reservationLabel(r, today) {
  return `${formatDayLabel(dayOf(new Date(r.starts_at)), today)}, ${formatTime(hhmmInBrasilia(r.starts_at))}`;
}

export async function handleInboundForReservation(
  { clientId, contactId, waId, profileName, body, fromAd = false, isNewContact = false, restaurantName = '' },
  deps = {}
) {
  const d = resolveDeps(deps);
  const q = d.db;
  const text = body || '';
  const today = dayOf(d.now);

  const settings = await d.loadSettings(q, clientId);
  if (!settings.bot_enabled) return 'ignored';
  if (await d.isBotPaused(q, { contactId, now: d.now })) return 'paused';

  const { rows } = await q.query(
    `SELECT * FROM reservation_conversations WHERE client_id = ? AND contact_id = ? AND status = 'active'`,
    [clientId, contactId]
  );
  let conv = rows[0] || null;
  if (conv && d.now.getTime() - new Date(conv.updated_at).getTime() > EXPIRE_MS) {
    await finish(conv, 'expired');
    conv = null;
  }

  // Confere a pausa de novo depois do "digitando": se o atendente respondeu nesse
  // meio-tempo, o robô não fala. Falha de envio só vai pro log.
  async function reply(key, vars = {}) {
    try {
      await d.typing(clientId, waId);
      if (await d.isBotPaused(q, { contactId, now: d.now })) return;
      const template = settings.messages?.[key] || DEFAULT_RESERVATION_MESSAGES[key];
      await d.send({
        clientId,
        contactId,
        sentBy: 'bot_reserva',
        body: renderMessage(template, {
          nome: firstName(profileName),
          restaurante: restaurantName,
          tolerancia: settings.hold_minutes,
          ...vars
        })
      });
    } catch (error) {
      console.error(`Reservas: falha ao responder "${key}" pro contato ${contactId}:`, error.message);
    }
  }

  async function start(step, data = {}) {
    try {
      const { rows: created } = await q.query(
        `INSERT INTO reservation_conversations (client_id, contact_id, status, step, data)
         VALUES (?, ?, 'active', ?, ?::jsonb) RETURNING *`,
        [clientId, contactId, step, JSON.stringify(data)]
      );
      return created[0];
    } catch (error) {
      // Duas mensagens quase juntas: o índice único deixa só uma conversa começar.
      if (isUniqueViolation(error)) return null;
      throw error;
    }
  }

  async function save(c, step, data, attempts = 0) {
    Object.assign(c, { step, data, attempts });
    await q.query(
      `UPDATE reservation_conversations SET step = ?, data = ?::jsonb, attempts = ?, updated_at = now() WHERE id = ?`,
      [step, JSON.stringify(data), attempts, c.id]
    );
  }

  async function finish(c, status) {
    c.status = status;
    await q.query(`UPDATE reservation_conversations SET status = ?, updated_at = now() WHERE id = ?`, [status, c.id]);
  }

  async function handoff(c) {
    await reply('handoff');
    if (c) await finish(c, 'handed_off');
    await d.pauseBot(q, { clientId, contactId, now: d.now });
    d.broadcast(clientId, 'reservation', { contactId: Number(contactId), needsAttention: true });
    return 'handoff';
  }

  // Não entendeu: repete a pergunta uma vez; na segunda, passa pra equipe.
  async function retry(c, key, vars = {}) {
    if ((c.attempts || 0) + 1 >= MAX_ATTEMPTS) return handoff(c);
    await save(c, c.step, c.data, (c.attempts || 0) + 1);
    await reply(key, vars);
    return `asked_${c.step}_again`;
  }

  async function occupying(day) {
    const from = new Date(toInstant(day, '00:00').getTime() - settings.duration_minutes * 60e3);
    const to = new Date(toInstant(day, '00:00').getTime() + 24 * 3600e3 + settings.duration_minutes * 60e3);
    const list = await d.listReservations(q, { clientId, from, to });
    return list.filter((r) => ['confirmed', 'arrived'].includes(r.status));
  }

  async function slotsFor(day, partySize) {
    return availableSlots({ settings, day, partySize, reservations: await occupying(day), now: d.now });
  }

  async function askSize(c) {
    if (c) await save(c, 'size', {});
    await reply('askSize');
    return 'asked_size';
  }

  async function startCancel(upcoming) {
    if (upcoming.length === 1) {
      const c = await start('cancel_confirm', { target: upcoming[0].id });
      if (!c) return 'ignored';
      await reply('cancelConfirm', { dia: formatDayLabel(dayOf(new Date(upcoming[0].starts_at)), today), hora: formatTime(hhmmInBrasilia(upcoming[0].starts_at)) });
      return 'cancel_asked';
    }
    const c = await start('cancel_pick', { targets: upcoming.map((r) => r.id) });
    if (!c) return 'ignored';
    const opcoes = upcoming.map((r, i) => `${i + 1}) ${reservationLabel(r, today)}`).join('  ');
    await reply('cancelPick', { opcoes });
    return 'cancel_asked';
  }

  if (!conv) {
    if (isReservationCommand(text)) {
      const c = await start('size');
      if (!c) return 'ignored';
      return askSize(null);
    }
    if (isCancelCommand(text)) {
      const upcoming = await d.upcomingReservations(q, { clientId, contactId, now: d.now });
      if (upcoming.length > 0) return startCancel(upcoming);
      return 'ignored';
    }
    if (settings.ad_fallback && fromAd && isNewContact) {
      const c = await start('ad_fallback');
      if (!c) return 'ignored';
      await reply('adFallbackAsk');
      return 'asked_fallback';
    }
    return 'ignored';
  }

  const data = conv.data || {};

  if (RESERVATION_STEPS.includes(conv.step)) {
    if (isReservationCommand(text) && conv.step !== 'ad_fallback') return askSize(conv);
    if (isCancelCommand(text)) {
      await finish(conv, 'done');
      await reply('aborted');
      return 'aborted';
    }
  }

  switch (conv.step) {
    case 'ad_fallback': {
      const t = text.trim();
      if (t === '1' || isReservationCommand(text) || isYes(text)) return askSize(conv);
      await finish(conv, 'done');
      return 'to_staff';
    }

    case 'size': {
      const size = parsePartySize(text);
      if (!size) return retry(conv, 'askSizeAgain');
      if (size > maxParty(settings)) return handoff(conv);
      await save(conv, 'day', { size });
      await reply('askDay');
      return 'asked_day';
    }

    case 'day': {
      const day = parseDay(text, today);
      if (!day) return retry(conv, 'askDayAgain');
      const dia = formatDayLabel(day, today);
      const open = day >= today && day <= addDays(today, settings.max_advance_days)
        && slotsForDay(settings, day).length > 0 && tablesForDay(settings, day).length > 0;
      if (!open) {
        await reply('dayUnavailable', { dia });
        return 'day_unavailable';
      }
      const slots = await slotsFor(day, data.size);
      if (slots.length > 0) {
        const options = slots.map((s) => s.time);
        await save(conv, 'time', { ...data, day, options });
        await reply('askTime', { dia, opcoes: formatOptions(options) });
        return 'asked_time';
      }
      for (let i = 1; i <= SUGGEST_DAYS; i++) {
        const next = addDays(day, i);
        const nextSlots = await slotsFor(next, data.size);
        if (nextSlots.length > 0) {
          const options = nextSlots.map((s) => s.time);
          await save(conv, 'time', { ...data, day: next, options });
          await reply('noSlotsSuggest', { dia, pessoas: data.size, proximoDia: formatDayLabel(next, today), opcoes: formatOptions(options) });
          return 'asked_time';
        }
      }
      await reply('noSlots', { dia, pessoas: data.size });
      return handoff(conv);
    }

    case 'time': {
      const time = parseTimeChoice(text, data.options || []);
      if (!time) return retry(conv, 'askTimeAgain', { opcoes: formatOptions(data.options || []) });
      if (profileName) {
        await save(conv, 'name', { ...data, time, candidate: profileName });
        await reply('askName');
      } else {
        await save(conv, 'name', { ...data, time });
        await reply('askNameEmpty');
      }
      return 'asked_name';
    }

    case 'name': {
      if (/^n[aã]o\b/i.test(text.trim())) {
        await save(conv, 'name', { ...data, candidate: null });
        await reply('askNameEmpty');
        return 'asked_name';
      }
      let name = null;
      if (data.candidate && isYes(text)) name = data.candidate;
      else {
        const t = text.trim();
        if (t.length >= 2 && t.length <= 60 && !/\d/.test(t) && !isYes(t)) name = t;
      }
      if (!name) return retry(conv, 'askNameEmpty');
      await save(conv, 'confirm', { ...data, name });
      await reply('confirm', confirmVars({ ...data, name }));
      return 'asked_confirm';
    }

    case 'confirm': {
      if (!isYes(text)) {
        if (/^n[aã]o\b/i.test(text.trim())) {
          await finish(conv, 'done');
          await reply('aborted');
          return 'aborted';
        }
        return retry(conv, 'confirm', confirmVars(data));
      }
      try {
        await d.createReservation(q, {
          clientId, contactId, name: data.name, phone: waId, partySize: data.size,
          startsAt: toInstant(data.day, data.time), source: 'whatsapp'
        });
      } catch (error) {
        if (!(error instanceof SlotTakenError)) throw error;
        const slots = await slotsFor(data.day, data.size);
        if (slots.length === 0) {
          await reply('noSlots', { dia: formatDayLabel(data.day, today), pessoas: data.size });
          return handoff(conv);
        }
        const options = slots.map((s) => s.time);
        await save(conv, 'time', { ...data, options });
        await reply('slotTaken', { dia: formatDayLabel(data.day, today), opcoes: formatOptions(options) });
        return 'slot_taken';
      }
      await finish(conv, 'done');
      await reply('confirmed', confirmVars(data));
      return 'confirmed';
    }

    case 'cancel_pick': {
      const n = Number(text.trim().replace(/[).]$/, ''));
      const targets = data.targets || [];
      if (!Number.isInteger(n) || n < 1 || n > targets.length) return retry(conv, 'cancelPick', { opcoes: '' });
      const upcoming = await d.upcomingReservations(q, { clientId, contactId, now: d.now });
      const target = upcoming.find((r) => r.id === targets[n - 1]);
      if (!target) {
        await finish(conv, 'done');
        return 'ignored';
      }
      await save(conv, 'cancel_confirm', { target: target.id });
      await reply('cancelConfirm', { dia: formatDayLabel(dayOf(new Date(target.starts_at)), today), hora: formatTime(hhmmInBrasilia(target.starts_at)) });
      return 'cancel_asked';
    }

    case 'cancel_confirm': {
      await finish(conv, 'done');
      if (!isYes(text)) return 'cancel_kept';
      const cancelled = await d.setReservationStatus(q, { clientId, id: data.target, status: 'cancelled', cancelledBy: 'client' });
      if (!cancelled) return 'ignored';
      await reply('cancelled');
      return 'cancelled';
    }

    default:
      await finish(conv, 'done');
      return 'ignored';
  }

  function confirmVars(x) {
    return { dia: formatDayLabel(x.day, today), hora: formatTime(x.time), pessoas: x.size, nomeReserva: x.name };
  }
}
