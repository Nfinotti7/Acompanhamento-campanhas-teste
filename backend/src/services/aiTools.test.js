import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AI_TOOL_DECLARATIONS, runTool } from './aiTools.js';
import { SlotTakenError } from './reservationStore.js';
import { DEFAULT_RESERVATION_SETTINGS } from './reservationSlots.js';

const NOW = new Date('2026-11-17T15:00:00Z'); // terça 12h em Brasília
const SETTINGS = {
  ...DEFAULT_RESERVATION_SETTINGS,
  tables: [{ seats: 2, count: 5 }, { seats: 4, count: 4 }, { seats: 6, count: 4 }],
  hours: { ...DEFAULT_RESERVATION_SETTINGS.hours, 5: [{ start: '17:30', lastBooking: '19:30' }] } // sexta
};
const FRIDAY = '2026-11-20';

function setup({ upcoming = [], dayReservations = [], createImpl } = {}) {
  const calls = { created: [], statuses: [], paused: [], broadcasts: [], listed: 0 };
  const deps = {
    listReservations: async () => { calls.listed += 1; return dayReservations; },
    upcomingReservations: async () => upcoming,
    createReservation: createImpl || (async (db, data) => { calls.created.push(data); return { id: 77, ...data }; }),
    setReservationStatus: async (db, data) => { calls.statuses.push(data); return { id: data.id }; },
    pauseBot: async (db, data) => { calls.paused.push(data); },
    broadcast: (...args) => { calls.broadcasts.push(args); }
  };
  const ctx = { db: {}, clientId: 9, contactId: 3561, waId: '5562981479128', settings: SETTINGS, now: NOW, deps };
  return { ctx, calls };
}

test('as 5 ferramentas estão declaradas', () => {
  assert.deepEqual(AI_TOOL_DECLARATIONS.map((t) => t.name).sort(),
    ['cancel_reservation', 'check_availability', 'create_reservation', 'handoff_to_staff', 'list_my_reservations']);
});

test('check_availability devolve os horários livres do dia', async () => {
  const { ctx } = setup();
  const r = await runTool('check_availability', { date: FRIDAY, party_size: 4 }, ctx);
  assert.deepEqual(r.times, ['17:30', '18:00', '18:30', '19:00', '19:30']);
});

test('check_availability: grupo de 10 (limite 6) pede repasse e não consulta o banco', async () => {
  const { ctx, calls } = setup();
  const r = await runTool('check_availability', { date: FRIDAY, party_size: 10 }, ctx);
  assert.deepEqual(r, { handoff: true, reason: 'group_too_large' });
  assert.equal(calls.listed, 0);
});

test('create_reservation válido grava com source whatsapp, telefone do contato e sem force', async () => {
  const { ctx, calls } = setup();
  const r = await runTool('create_reservation', { name: 'Wender Vieira', date: FRIDAY, time: '19:00', party_size: 4 }, ctx);
  assert.equal(r.ok, true);
  assert.equal(r.id, 77);
  assert.equal(calls.created.length, 1);
  const c = calls.created[0];
  assert.equal(c.source, 'whatsapp');
  assert.equal(c.phone, '5562981479128');
  assert.equal(c.contactId, 3561);
  assert.equal(c.clientId, 9);
  assert.equal(c.partySize, 4);
  assert.equal(c.name, 'Wender Vieira');
  assert.equal(c.force, false);
  assert.equal(c.startsAt.toISOString(), '2026-11-20T22:00:00.000Z'); // 19h em Brasília
});

test('create_reservation: grupo acima do limite não grava (injeção de "reserve 30")', async () => {
  const { ctx, calls } = setup();
  const r = await runTool('create_reservation', { name: 'Fulano', date: FRIDAY, time: '19:00', party_size: 30 }, ctx);
  assert.equal(r.error, 'group_too_large');
  assert.equal(calls.created.length, 0);
});

test('create_reservation: dados inválidos viram erro e nada é gravado', async () => {
  const cases = [
    { name: 'Ana', date: 'amanhã', time: '19:00', party_size: 2 },
    { name: 'Ana', date: '2026-02-31', time: '19:00', party_size: 2 },
    { name: 'Ana', date: FRIDAY, time: '7 da noite', party_size: 2 },
    { name: 'Ana', date: '2026-11-10', time: '19:00', party_size: 2 }, // passada
    { name: '  ', date: FRIDAY, time: '19:00', party_size: 2 },
    { name: 'Ana', date: FRIDAY, time: '19:00', party_size: 0 },
    { name: 'Ana', date: FRIDAY, time: '19:00', party_size: 'muitas' }
  ];
  for (const args of cases) {
    const { ctx, calls } = setup();
    const r = await runTool('create_reservation', args, ctx);
    assert.ok(r.error, `esperava erro para ${JSON.stringify(args)}`);
    assert.equal(calls.created.length, 0);
  }
});

test('create_reservation: horário fora do turno devolve alternativas e não grava', async () => {
  const { ctx, calls } = setup();
  const r = await runTool('create_reservation', { name: 'Ana', date: FRIDAY, time: '21:00', party_size: 2 }, ctx);
  assert.equal(r.error, 'slot_unavailable');
  assert.deepEqual(r.alternatives, ['17:30', '18:00', '18:30', '19:00', '19:30']);
  assert.equal(calls.created.length, 0);
});

test('create_reservation: reserva cancelada não ocupa mesa, confirmada sim', async () => {
  const startsAt = new Date('2026-11-20T22:00:00Z');
  const endsAt = new Date('2026-11-21T00:00:00Z');
  const full = Array.from({ length: 4 }, (_, i) => ({ id: i, status: 'confirmed', table_seats: 4, starts_at: startsAt, ends_at: endsAt }));
  const fullSix = Array.from({ length: 4 }, (_, i) => ({ id: 10 + i, status: 'confirmed', table_seats: 6, starts_at: startsAt, ends_at: endsAt }));
  const blocked = setup({ dayReservations: [...full, ...fullSix] });
  const r1 = await runTool('create_reservation', { name: 'Ana', date: FRIDAY, time: '19:00', party_size: 4 }, blocked.ctx);
  assert.equal(r1.error, 'slot_unavailable');
  const cancelled = setup({ dayReservations: [...full, ...fullSix].map((r) => ({ ...r, status: 'cancelled' })) });
  const r2 = await runTool('create_reservation', { name: 'Ana', date: FRIDAY, time: '19:00', party_size: 4 }, cancelled.ctx);
  assert.equal(r2.ok, true);
});

test('create_reservation: SlotTakenError vira slot_taken', async () => {
  const { ctx } = setup({ createImpl: async () => { throw new SlotTakenError(); } });
  const r = await runTool('create_reservation', { name: 'Ana', date: FRIDAY, time: '19:00', party_size: 2 }, ctx);
  assert.equal(r.error, 'slot_taken');
});

test('list_my_reservations devolve só as futuras do contato', async () => {
  const { ctx } = setup({ upcoming: [{ id: 5, starts_at: new Date('2026-11-20T22:00:00Z'), party_size: 4 }] });
  const r = await runTool('list_my_reservations', {}, ctx);
  assert.deepEqual(r.reservations, [{ id: 5, date: '2026-11-20', time: '19:00', party_size: 4 }]);
});

test('cancel_reservation de reserva de outro contato é recusado', async () => {
  const { ctx, calls } = setup({ upcoming: [{ id: 5, starts_at: new Date('2026-11-20T22:00:00Z'), party_size: 4 }] });
  const r = await runTool('cancel_reservation', { reservation_id: 999 }, ctx);
  assert.equal(r.error, 'not_found');
  assert.equal(calls.statuses.length, 0);
});

test('cancel_reservation da própria reserva cancela como cliente', async () => {
  const { ctx, calls } = setup({ upcoming: [{ id: 5, starts_at: new Date('2026-11-20T22:00:00Z'), party_size: 4 }] });
  const r = await runTool('cancel_reservation', { reservation_id: 5 }, ctx);
  assert.equal(r.ok, true);
  assert.deepEqual(calls.statuses, [{ clientId: 9, id: 5, status: 'cancelled', cancelledBy: 'cliente' }]);
});

test('handoff_to_staff pausa a IA e avisa a equipe', async () => {
  const { ctx, calls } = setup();
  const r = await runTool('handoff_to_staff', { reason: 'grupo de 10 pessoas, aniversário' }, ctx);
  assert.equal(r.ok, true);
  assert.equal(calls.paused.length, 1);
  assert.equal(calls.paused[0].contactId, 3561);
  assert.deepEqual(calls.broadcasts, [[9, 'reservation', { contactId: 3561, needsAttention: true }]]);
});

test('ferramenta desconhecida devolve erro sem lançar', async () => {
  const { ctx } = setup();
  const r = await runTool('apagar_banco', {}, ctx);
  assert.equal(r.error, 'unknown_tool');
});

test('create_reservation repetido para a mesma reserva não duplica', async () => {
  const existing = { id: 5, starts_at: new Date('2026-11-20T22:00:00Z'), party_size: 4 };
  const { ctx, calls } = setup({ upcoming: [existing] });
  const r = await runTool('create_reservation', { name: 'Ana', date: FRIDAY, time: '19:00', party_size: 4 }, ctx);
  assert.deepEqual(r, { ok: true, already_booked: true, id: 5, date: FRIDAY, time: '19:00', party_size: 4 });
  assert.equal(calls.created.length, 0);
});

test('create_reservation no mesmo horário de outra reserva do contato, com outro tamanho, vai para a equipe', async () => {
  const existing = { id: 5, starts_at: new Date('2026-11-20T22:00:00Z'), party_size: 4 };
  const { ctx, calls } = setup({ upcoming: [existing] });
  const r = await runTool('create_reservation', { name: 'Ana', date: FRIDAY, time: '19:00', party_size: 2 }, ctx);
  assert.equal(r.error, 'already_booked_at_that_time');
  assert.equal(calls.created.length, 0);
});

// A tabela reservations só aceita as origens do CHECK do banco. Uma origem fora da lista (foi o 'ai')
// faz o INSERT falhar e a reserva nunca é gravada, e um createReservation falso não percebe.
test('a origem que a IA grava é aceita pelo CHECK da tabela reservations', async () => {
  const { readFileSync } = await import('node:fs');
  const ddl = readFileSync(new URL('../config/db.js', import.meta.url), 'utf8');
  const match = ddl.match(/CREATE TABLE IF NOT EXISTS reservations \([\s\S]*?source TEXT NOT NULL CHECK \(source IN \(([^)]*)\)\)/);
  assert.ok(match, 'não achei o CHECK de source em reservations');
  const allowed = [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const { ctx, calls } = setup();
  await runTool('create_reservation', { name: 'Ana', date: FRIDAY, time: '19:00', party_size: 2 }, ctx);
  assert.ok(allowed.includes(calls.created[0].source), `source ${calls.created[0].source} fora de ${allowed}`);
});
