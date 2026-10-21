// Rotas das reservas (tela Reservas do Caixa e admin). Staff fica travado no próprio
// restaurante; admin escolhe pelo clientId.
import db from '../config/db.js';
import { sendToContact } from '../services/whatsappSender.js';
import { pauseBot, resumeBot } from '../services/botPause.js';
import { findOrCreateContactByPhone } from '../services/waitlistQueue.js';
import { normalizePhone, renderMessage } from '../services/waitlistText.js';
import { availableSlots, occupancyForDay, toInstant, dayOf } from '../services/reservationSlots.js';
import { DEFAULT_RESERVATION_MESSAGES, RESERVATION_MESSAGE_KEYS, formatDayLabel, formatTime } from '../services/reservationText.js';
import {
  loadReservationSettings, saveReservationSettings, listReservations, createReservation, updateReservation,
  setReservationStatus, SlotTakenError, ReservationSettingsError
} from '../services/reservationStore.js';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY_MS = 24 * 3600e3;

function resolveClientId(req) {
  return req.user.role === 'admin'
    ? (req.query.clientId || req.body.clientId || req.user.clientId)
    : req.user.clientId;
}

function hhmmInBrasilia(date) {
  return new Date(new Date(date).getTime() - 3 * 3600e3).toISOString().slice(11, 16);
}

export function createReservationHandlers(overrides = {}) {
  const d = {
    db,
    now: () => new Date(),
    loadSettings: loadReservationSettings,
    saveSettings: saveReservationSettings,
    listReservations,
    findOrCreateContact: findOrCreateContactByPhone,
    createReservation,
    updateReservation,
    setReservationStatus,
    send: sendToContact,
    pauseBot,
    resumeBot,
    ...overrides
  };

  async function clientFlags(clientId) {
    const { rows } = await d.db.query(`SELECT reservations_enabled, name FROM clients WHERE id = ?`, [clientId]);
    return rows[0] || {};
  }

  // requireEnabled: false só no GET /settings, que a tela usa pra saber se mostra o menu.
  function handler(fn, errorMessage, { requireEnabled = true } = {}) {
    return async (req, res) => {
      try {
        const clientId = resolveClientId(req);
        if (!clientId) return res.status(400).json({ error: 'ID do cliente é obrigatório.' });
        const flags = await clientFlags(clientId);
        if (requireEnabled && !flags.reservations_enabled) {
          return res.status(403).json({ error: 'Reservas não estão ativas para este restaurante.' });
        }
        return await fn(req, res, clientId, flags);
      } catch (error) {
        console.error(`${errorMessage}:`, error);
        return res.status(500).json({ error: `${errorMessage}.` });
      }
    };
  }

  async function reservationsAround(clientId, day, settings) {
    const pad = settings.duration_minutes * 60e3;
    const start = toInstant(day, '00:00').getTime();
    return d.listReservations(d.db, { clientId, from: new Date(start - pad), to: new Date(start + DAY_MS + pad) });
  }

  async function freeTimes(clientId, day, partySize, settings) {
    const all = await reservationsAround(clientId, day, settings);
    const occupying = all.filter((r) => ['confirmed', 'arrived'].includes(r.status));
    return availableSlots({ settings, day, partySize, reservations: occupying, now: d.now() }).map((s) => s.time);
  }

  function parsePartySize(value) {
    const n = Number(value);
    return Number.isInteger(n) && n >= 1 && n <= 30 ? n : null;
  }

  function statusAction(status) {
    return handler(async (req, res, clientId) => {
      const r = await d.setReservationStatus(d.db, { clientId, id: Number(req.params.id), status });
      if (!r) return res.status(409).json({ error: 'Essa reserva já mudou de status.' });
      return res.json({ reservation: r });
    }, 'Erro ao atualizar a reserva');
  }

  return {
    getSettings: handler(async (req, res, clientId, flags) => {
      const settings = await d.loadSettings(d.db, clientId);
      return res.json({
        enabled: Boolean(flags.reservations_enabled),
        settings,
        defaultMessages: DEFAULT_RESERVATION_MESSAGES,
        messageKeys: RESERVATION_MESSAGE_KEYS
      });
    }, 'Erro ao carregar a configuração de reservas', { requireEnabled: false }),

    saveSettings: handler(async (req, res, clientId) => {
      const { clientId: _ignored, ...patch } = req.body || {};
      try {
        const settings = await d.saveSettings(d.db, clientId, patch);
        return res.json({ settings });
      } catch (error) {
        if (error instanceof ReservationSettingsError) return res.status(400).json({ error: error.message });
        throw error;
      }
    }, 'Erro ao salvar a configuração de reservas'),

    getDay: handler(async (req, res, clientId) => {
      const day = DAY.test(req.query.day || '') ? req.query.day : dayOf(d.now());
      const settings = await d.loadSettings(d.db, clientId);
      const all = await reservationsAround(clientId, day, settings);
      const start = toInstant(day, '00:00').getTime();
      const reservations = all.filter((r) => {
        const t = new Date(r.starts_at).getTime();
        return t >= start && t < start + DAY_MS;
      });
      const occupying = all.filter((r) => ['confirmed', 'arrived'].includes(r.status));
      const occupancy = occupancyForDay({ settings, day, reservations: occupying });
      const overLimit = occupancy.some((o) => Object.values(o.free).some((n) => n < 0))
        || reservations.some((r) => r.over_limit && ['confirmed', 'arrived'].includes(r.status));
      return res.json({ day, reservations, occupancy, overLimit });
    }, 'Erro ao carregar as reservas'),

    availability: handler(async (req, res, clientId) => {
      const day = req.query.day;
      const partySize = parsePartySize(req.query.party);
      if (!DAY.test(day || '') || !partySize) return res.status(400).json({ error: 'Informe o dia e o número de pessoas.' });
      const settings = await d.loadSettings(d.db, clientId);
      return res.json({ slots: await freeTimes(clientId, day, partySize, settings) });
    }, 'Erro ao consultar horários'),

    create: handler(async (req, res, clientId) => {
      const { name, phone, day, time, force = false } = req.body || {};
      const partySize = parsePartySize(req.body?.partySize);
      if (!partySize) return res.status(400).json({ error: 'Número de pessoas inválido.' });
      if (!DAY.test(day || '') || !HHMM.test(time || '')) return res.status(400).json({ error: 'Informe o dia e o horário.' });
      const rawPhone = String(phone || '').trim();
      const waId = rawPhone ? normalizePhone(rawPhone) : null;
      if (rawPhone && !waId) return res.status(400).json({ error: 'Telefone inválido. Use DDD + número, ex: (11) 99999-8888.' });
      const contactId = await d.findOrCreateContact(d.db, { clientId, waId, name: name || null });
      try {
        const reservation = await d.createReservation(d.db, {
          clientId, contactId, name: name || null, phone: waId, partySize,
          startsAt: toInstant(day, time), source: 'manual', force: Boolean(force)
        });
        return res.status(201).json({ reservation });
      } catch (error) {
        if (!(error instanceof SlotTakenError)) throw error;
        const settings = await d.loadSettings(d.db, clientId);
        return res.status(409).json({ error: error.message, slots: await freeTimes(clientId, day, partySize, settings) });
      }
    }, 'Erro ao criar a reserva'),

    update: handler(async (req, res, clientId) => {
      const { name, day, time, force = false } = req.body || {};
      const partySize = req.body?.partySize === undefined ? undefined : parsePartySize(req.body.partySize);
      if (partySize === null) return res.status(400).json({ error: 'Número de pessoas inválido.' });
      if ((day || time) && (!DAY.test(day || '') || !HHMM.test(time || ''))) {
        return res.status(400).json({ error: 'Informe o dia e o horário.' });
      }
      try {
        const reservation = await d.updateReservation(d.db, {
          clientId, id: Number(req.params.id), partySize, name,
          startsAt: day ? toInstant(day, time) : undefined, force: Boolean(force)
        });
        if (!reservation) return res.status(404).json({ error: 'Reserva não encontrada.' });
        return res.json({ reservation });
      } catch (error) {
        if (!(error instanceof SlotTakenError)) throw error;
        return res.status(409).json({ error: error.message });
      }
    }, 'Erro ao editar a reserva'),

    arrived: statusAction('arrived'),
    noShow: statusAction('no_show'),
    confirm: statusAction('confirmed'),

    // Equipe cancelou: avisa a pessoa (texto editável), mas sem pausar o robô.
    cancel: handler(async (req, res, clientId) => {
      const notify = req.body?.notify !== false;
      const r = await d.setReservationStatus(d.db, { clientId, id: Number(req.params.id), status: 'cancelled', cancelledBy: 'staff' });
      if (!r) return res.status(409).json({ error: 'Essa reserva já mudou de status.' });
      let notified = false;
      if (notify && r.contact_id) {
        const settings = await d.loadSettings(d.db, clientId);
        const template = settings.messages?.cancelledByStaff || DEFAULT_RESERVATION_MESSAGES.cancelledByStaff;
        const body = renderMessage(template, {
          dia: formatDayLabel(dayOf(new Date(r.starts_at)), dayOf(d.now())),
          hora: formatTime(hhmmInBrasilia(r.starts_at))
        });
        try {
          await d.send({ clientId, contactId: r.contact_id, body, sentBy: 'staff' });
          notified = true;
        } catch (error) {
          console.error(`Reservas: falha ao avisar o cancelamento da reserva ${r.id}:`, error.message);
        }
      }
      return res.json({ reservation: r, notified });
    }, 'Erro ao cancelar a reserva'),

    pauseContactBot: handler(async (req, res, clientId) => {
      const until = await d.pauseBot(d.db, { clientId, contactId: Number(req.params.id) });
      return res.json({ pausedUntil: until });
    }, 'Erro ao pausar o robô'),

    resumeContactBot: handler(async (req, res, clientId) => {
      await d.resumeBot(d.db, { clientId, contactId: Number(req.params.id) });
      return res.json({ ok: true });
    }, 'Erro ao retomar o robô')
  };
}

export const reservationHandlers = createReservationHandlers();
