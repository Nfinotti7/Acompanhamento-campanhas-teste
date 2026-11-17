// Ferramentas do atendente com IA. A IA propõe, o código decide: toda regra de reserva
// (limite de grupo, antecedência, mesa livre, trava) é conferida aqui e em createReservation,
// nunca pelo prompt. runTool nunca lança: erro vira { error, message } pra IA contar ao cliente.
import { availableSlots, maxParty, toInstant, dayOf, addDays } from './reservationSlots.js';
import {
  createReservation, setReservationStatus, listReservations, upcomingReservationsForContact, SlotTakenError
} from './reservationStore.js';
import { pauseBot } from './botPause.js';
import { broadcast } from './sseHub.js';

const OFFSET_MS = 3 * 3600e3; // Brasília, UTC-3 fixo (igual reservationSlots.js)
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export const AI_TOOL_DECLARATIONS = [
  {
    name: 'check_availability',
    description: 'Consulta os horários com mesa livre num dia para um número de pessoas. Use antes de oferecer horários ao cliente.',
    parameters: {
      type: 'OBJECT',
      properties: {
        date: { type: 'STRING', description: 'Dia no formato AAAA-MM-DD.' },
        party_size: { type: 'INTEGER', description: 'Número de pessoas.' }
      },
      required: ['date', 'party_size']
    }
  },
  {
    name: 'create_reservation',
    description: 'Grava a reserva. Só chame depois de o cliente confirmar nome, dia, horário e número de pessoas.',
    parameters: {
      type: 'OBJECT',
      properties: {
        name: { type: 'STRING', description: 'Nome do cliente para a reserva.' },
        date: { type: 'STRING', description: 'Dia no formato AAAA-MM-DD.' },
        time: { type: 'STRING', description: 'Horário no formato HH:MM (24h).' },
        party_size: { type: 'INTEGER', description: 'Número de pessoas.' }
      },
      required: ['name', 'date', 'time', 'party_size']
    }
  },
  {
    name: 'list_my_reservations',
    description: 'Lista as reservas futuras deste cliente.',
    parameters: { type: 'OBJECT', properties: {} }
  },
  {
    name: 'cancel_reservation',
    description: 'Cancela uma reserva futura deste cliente, a pedido dele.',
    parameters: {
      type: 'OBJECT',
      properties: { reservation_id: { type: 'INTEGER', description: 'Id vindo de list_my_reservations.' } },
      required: ['reservation_id']
    }
  },
  {
    name: 'handoff_to_staff',
    description: 'Chama a equipe e para de responder esta conversa. Use para: grupo acima do limite, pedido especial '
      + '(decoração, bolo, desconto, sala, pagamento), mudança de horário de uma reserva, reclamação, pergunta que '
      + 'não está nos textos cadastrados, ou cliente pedindo para falar com uma pessoa.',
    parameters: {
      type: 'OBJECT',
      properties: { reason: { type: 'STRING', description: 'Motivo, em poucas palavras, para a equipe ler.' } },
      required: ['reason']
    }
  }
];

const fail = (error, message, extra = {}) => ({ error, message, ...extra });

function validDay(value) {
  if (typeof value !== 'string' || !DAY.test(value)) return false;
  return new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}

function partyOf(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

function localParts(date) {
  const iso = new Date(new Date(date).getTime() - OFFSET_MS).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

// Reservas que ocupam mesa naquele dia (cancelada e não compareceu não ocupam).
async function reservationsOfDay(ctx, d, day) {
  const rows = await d.listReservations(ctx.db, {
    clientId: ctx.clientId, from: toInstant(day, '00:00'), to: toInstant(addDays(day, 1), '00:00')
  });
  return rows.filter((r) => r.status === 'confirmed' || r.status === 'arrived');
}

function resolveDeps(deps = {}) {
  return {
    listReservations: deps.listReservations || listReservations,
    upcomingReservations: deps.upcomingReservations || upcomingReservationsForContact,
    createReservation: deps.createReservation || createReservation,
    setReservationStatus: deps.setReservationStatus || setReservationStatus,
    pauseBot: deps.pauseBot || pauseBot,
    broadcast: deps.broadcast || broadcast
  };
}

async function checkAvailability(args, ctx, d) {
  const party = partyOf(args.party_size);
  if (!party) return fail('invalid_party', 'Número de pessoas inválido.');
  if (party > maxParty(ctx.settings)) return { handoff: true, reason: 'group_too_large' };
  if (!validDay(args.date)) return fail('invalid_date', 'Data inválida; use AAAA-MM-DD.');
  const day = args.date;
  if (day < dayOf(ctx.now)) return fail('past_date', 'Essa data já passou.');
  const reservations = await reservationsOfDay(ctx, d, day);
  const slots = availableSlots({ settings: ctx.settings, day, partySize: party, reservations, now: ctx.now });
  return { times: slots.map((s) => s.time) };
}

async function createReservationTool(args, ctx, d) {
  const name = String(args.name || '').trim().slice(0, 80);
  if (!name) return fail('invalid_name', 'Falta o nome para a reserva.');
  const party = partyOf(args.party_size);
  if (!party) return fail('invalid_party', 'Número de pessoas inválido.');
  if (party > maxParty(ctx.settings)) {
    return fail('group_too_large', 'Grupo acima do que fecho sozinha: chame a equipe com handoff_to_staff.');
  }
  if (!validDay(args.date)) return fail('invalid_date', 'Data inválida; use AAAA-MM-DD.');
  if (typeof args.time !== 'string' || !HHMM.test(args.time)) return fail('invalid_time', 'Horário inválido; use HH:MM.');
  const day = args.date;
  if (day < dayOf(ctx.now)) return fail('past_date', 'Essa data já passou.');

  const reservations = await reservationsOfDay(ctx, d, day);
  const slots = availableSlots({ settings: ctx.settings, day, partySize: party, reservations, now: ctx.now });
  const slot = slots.find((s) => s.time === args.time);
  if (!slot) {
    return fail('slot_unavailable', 'Esse horário não está disponível.', { alternatives: slots.map((s) => s.time) });
  }
  try {
    const reservation = await d.createReservation(ctx.db, {
      clientId: ctx.clientId, contactId: ctx.contactId, name, phone: ctx.waId,
      partySize: party, startsAt: slot.startsAt, source: 'ai', force: false
    });
    return { ok: true, id: reservation.id, date: day, time: args.time, party_size: party };
  } catch (error) {
    if (error instanceof SlotTakenError) return fail('slot_taken', 'Acabaram de ocupar esse horário.');
    throw error;
  }
}

async function myReservations(ctx, d) {
  return d.upcomingReservations(ctx.db, { clientId: ctx.clientId, contactId: ctx.contactId, now: ctx.now });
}

async function handlers(name, args, ctx, d) {
  switch (name) {
    case 'check_availability': return checkAvailability(args, ctx, d);
    case 'create_reservation': return createReservationTool(args, ctx, d);
    case 'list_my_reservations': {
      const rows = await myReservations(ctx, d);
      return { reservations: rows.map((r) => ({ id: r.id, ...localParts(r.starts_at), party_size: r.party_size })) };
    }
    case 'cancel_reservation': {
      const id = Number(args.reservation_id);
      const mine = (await myReservations(ctx, d)).find((r) => Number(r.id) === id);
      if (!mine) return fail('not_found', 'Não achei essa reserva neste contato.');
      await d.setReservationStatus(ctx.db, { clientId: ctx.clientId, id: mine.id, status: 'cancelled', cancelledBy: 'cliente' });
      return { ok: true };
    }
    case 'handoff_to_staff': {
      await d.pauseBot(ctx.db, { clientId: ctx.clientId, contactId: ctx.contactId, now: ctx.now });
      d.broadcast(ctx.clientId, 'reservation', { contactId: Number(ctx.contactId), needsAttention: true });
      return { ok: true };
    }
    default:
      return fail('unknown_tool', `Ferramenta desconhecida: ${name}.`);
  }
}

export async function runTool(name, args, ctx) {
  const d = resolveDeps(ctx.deps);
  try {
    return await handlers(name, args || {}, ctx, d);
  } catch (error) {
    console.error(`Atendente IA: erro na ferramenta ${name}:`, error.message);
    return fail('tool_error', 'Não consegui fazer isso agora; chame a equipe com handoff_to_staff.');
  }
}
