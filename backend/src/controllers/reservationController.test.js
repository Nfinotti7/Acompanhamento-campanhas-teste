import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createReservationHandlers } from './reservationController.js';
import { SlotTakenError } from '../services/reservationStore.js';
import { DEFAULT_RESERVATION_SETTINGS } from '../services/reservationSlots.js';

const SETTINGS = {
  ...DEFAULT_RESERVATION_SETTINGS,
  tables: [{ seats: 4, count: 1 }],
  hours: { ...DEFAULT_RESERVATION_SETTINGS.hours, 6: [{ start: '19:00', lastBooking: '21:00' }] }
};

function fakeRes() {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}

function make({ enabled = true, createError = null, sendError = null } = {}) {
  const calls = { create: [], sent: [], status: [], contacts: [], seenClientIds: [] };
  const handlers = createReservationHandlers({
    db: {
      query: async (sql, params) => {
        if (/FROM clients WHERE id/.test(sql)) {
          calls.seenClientIds.push(params[0]);
          return { rows: [{ reservations_enabled: enabled, name: 'Malibu' }] };
        }
        return { rows: [] };
      }
    },
    now: () => new Date('2026-10-22T18:00:00Z'),
    loadSettings: async () => SETTINGS,
    listReservations: async () => [],
    findOrCreateContact: async (_db, args) => { calls.contacts.push(args); return 42; },
    createReservation: async (_db, args) => {
      calls.create.push(args);
      if (createError) throw createError;
      return { id: 1, ...args };
    },
    setReservationStatus: async (_db, args) => {
      calls.status.push(args);
      return { id: args.id, contact_id: 42, starts_at: '2026-10-24T22:30:00Z', status: args.status };
    },
    send: async (m) => { calls.sent.push(m); if (sendError) throw sendError; return 'w'; },
    pauseBot: async () => { calls.paused = true; },
    resumeBot: async () => {}
  });
  return { handlers, calls };
}

const staffReq = (extra = {}) => ({ user: { role: 'staff', clientId: 9 }, query: {}, body: {}, params: {}, ...extra });

test('reservas desligadas → 403', async () => {
  const { handlers } = make({ enabled: false });
  const res = fakeRes();
  await handlers.getDay(staffReq({ query: { day: '2026-10-24' } }), res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error, 'Reservas não estão ativas para este restaurante.');
});

test('GET settings com reservas desligadas devolve enabled:false', async () => {
  const { handlers } = make({ enabled: false });
  const res = fakeRes();
  await handlers.getSettings(staffReq(), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.enabled, false);
});

test('POST manual cria contato pelo telefone e grava como manual', async () => {
  const { handlers, calls } = make();
  const res = fakeRes();
  await handlers.create(staffReq({ body: { name: 'Ana', phone: '(11) 99999-8888', partySize: 4, day: '2026-10-24', time: '19:30' } }), res);
  assert.equal(res.statusCode, 201);
  assert.deepEqual(calls.contacts, [{ clientId: 9, waId: '5511999998888', name: 'Ana' }]);
  assert.equal(calls.create[0].source, 'manual');
  assert.equal(calls.create[0].contactId, 42);
  assert.equal(calls.create[0].startsAt.toISOString(), '2026-10-24T22:30:00.000Z');
  assert.equal(calls.create[0].force, false);
});

test('POST manual sem vaga → 409 com os horários livres', async () => {
  const { handlers } = make({ createError: new SlotTakenError() });
  const res = fakeRes();
  await handlers.create(staffReq({ body: { name: 'Ana', phone: '', partySize: 4, day: '2026-10-24', time: '19:30' } }), res);
  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body.slots, ['19:00', '19:30', '20:00', '20:30', '21:00']);
});

test('POST manual com telefone inválido → 400', async () => {
  const { handlers } = make();
  const res = fakeRes();
  await handlers.create(staffReq({ body: { name: 'Ana', phone: '123', partySize: 4, day: '2026-10-24', time: '19:30' } }), res);
  assert.equal(res.statusCode, 400);
});

test('cancelar com aviso manda a mensagem como equipe e não pausa o robô', async () => {
  const { handlers, calls } = make();
  const res = fakeRes();
  await handlers.cancel(staffReq({ params: { id: '5' }, body: { notify: true } }), res);
  assert.deepEqual(calls.status, [{ clientId: 9, id: 5, status: 'cancelled', cancelledBy: 'staff' }]);
  assert.equal(calls.sent.length, 1);
  assert.equal(calls.sent[0].sentBy, 'staff');
  assert.equal(calls.sent[0].body, 'Sua reserva de sábado 24/10, 19h30 foi cancelada. Qualquer dúvida, é só responder aqui.');
  assert.equal(calls.paused, undefined);
  assert.equal(res.body.notified, true);
});

test('cancelar com falha no envio devolve notified:false', async () => {
  const { handlers } = make({ sendError: new Error('caiu') });
  const res = fakeRes();
  await handlers.cancel(staffReq({ params: { id: '5' }, body: { notify: true } }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.notified, false);
});

test('staff só enxerga o próprio restaurante', async () => {
  const { handlers, calls } = make();
  await handlers.getDay(staffReq({ query: { day: '2026-10-24', clientId: '5' } }), fakeRes());
  assert.deepEqual(calls.seenClientIds, [9]);
});

test('GET do dia devolve ocupação dos horários', async () => {
  const { handlers } = make();
  const res = fakeRes();
  await handlers.getDay(staffReq({ query: { day: '2026-10-24' } }), res);
  assert.equal(res.body.day, '2026-10-24');
  assert.deepEqual(res.body.occupancy[0], { time: '19:00', free: { 4: 1 } });
  assert.equal(res.body.overLimit, false);
});

test('GET bot do contato: pausado e conversa ativa', async () => {
  const handlers = createReservationHandlers({
    db: {
      query: async (sql) => {
        if (/FROM clients WHERE id/.test(sql)) return { rows: [{ reservations_enabled: true }] };
        if (/bot_paused_until/.test(sql)) return { rows: [{ bot_paused_until: '2026-10-23T06:00:00Z', bot_active: true }] };
        return { rows: [] };
      }
    },
    now: () => new Date('2026-10-22T18:00:00Z')
  });
  const res = fakeRes();
  await handlers.contactBot(staffReq({ params: { id: '3' } }), res);
  assert.deepEqual(res.body, { enabled: true, pausedUntil: '2026-10-23T06:00:00Z', paused: true, active: true });
});

test('GET bot do contato com reservas desligadas devolve enabled:false', async () => {
  const { handlers } = make({ enabled: false });
  const res = fakeRes();
  await handlers.contactBot(staffReq({ params: { id: '3' } }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.enabled, false);
});
