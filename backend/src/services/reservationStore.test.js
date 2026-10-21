import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadReservationSettings, saveReservationSettings, createReservation, setReservationStatus,
  updateReservation, SlotTakenError, LOCK_BASE
} from './reservationStore.js';
import { toInstant } from './reservationSlots.js';

const TABLES = [{ seats: 2, count: 2 }, { seats: 4, count: 2 }, { seats: 6, count: 2 }];

// Banco em memória mínimo: só o que o reservationStore consulta.
function fakeDb({ config = { tables: TABLES }, reservations = [] } = {}) {
  const log = [];
  const state = { config, reservations: reservations.map((r, i) => ({ id: i + 1, status: 'confirmed', ...r })), appointmentSyncs: [] };
  let nextId = state.reservations.length + 1;
  const query = async (sql, params = []) => {
    log.push(sql);
    if (/pg_advisory_xact_lock/.test(sql)) return { rows: [{}] };
    if (/SELECT config FROM reservation_settings/.test(sql)) return { rows: state.config ? [{ config: state.config }] : [] };
    if (/INSERT INTO reservation_settings/.test(sql)) {
      state.config = JSON.parse(params[1]);
      return { rows: [] };
    }
    if (/FROM reservations\s+WHERE client_id = \? AND status IN \('confirmed', 'arrived'\)/.test(sql)) {
      const [, endsAt, startsAt, exceptId] = params;
      return {
        rows: state.reservations.filter((r) => ['confirmed', 'arrived'].includes(r.status)
          && new Date(r.starts_at) < endsAt && new Date(r.ends_at) > startsAt && r.id !== exceptId)
      };
    }
    if (/INSERT INTO reservations/.test(sql)) {
      const [client_id, contact_id, name, phone, party_size, table_seats, starts_at, ends_at, source, over_limit] = params;
      const r = { id: nextId++, client_id, contact_id, name, phone, party_size, table_seats, starts_at, ends_at, source, over_limit, status: 'confirmed' };
      state.reservations.push(r);
      return { rows: [r] };
    }
    if (/SELECT \* FROM reservations WHERE id = \? AND client_id = \?/.test(sql)) {
      return { rows: state.reservations.filter((r) => r.id === params[0]) };
    }
    if (/UPDATE reservations SET status = \?/.test(sql)) {
      const [status, cancelledBy, id, , from] = params;
      const r = state.reservations.find((x) => x.id === id && from.includes(x.status));
      if (!r) return { rows: [] };
      Object.assign(r, { status, cancelled_by: cancelledBy });
      return { rows: [r] };
    }
    if (/UPDATE reservations SET party_size/.test(sql)) {
      const [party_size, table_seats, starts_at, ends_at, name, over_limit, id] = params;
      const r = state.reservations.find((x) => x.id === id);
      Object.assign(r, { party_size, table_seats, starts_at, ends_at, name, over_limit });
      return { rows: [r] };
    }
    if (/UPDATE whatsapp_contacts SET appointment_at/.test(sql)) {
      state.appointmentSyncs.push(params.at(-1));
      return { rows: [] };
    }
    return { rows: [] };
  };
  return { log, state, query, withTransaction: async (fn) => fn({ query }) };
}

function deps() {
  const calls = { broadcast: [], moved: [] };
  return {
    calls,
    broadcast: (clientId, name, data) => calls.broadcast.push({ clientId, name, data }),
    moveToAutoStage: async (_db, args) => { calls.moved.push(args); return { changed: true }; }
  };
}

const AT_1930 = toInstant('2026-10-24', '19:30');
const base = { clientId: 9, contactId: 1, name: 'Ana', phone: '5511999998888', partySize: 4, startsAt: AT_1930, source: 'whatsapp' };

function occupied(seats) {
  return { table_seats: seats, starts_at: AT_1930, ends_at: new Date(AT_1930.getTime() + 7200e3) };
}

test('createReservation trava o cliente antes de ler', async () => {
  const db = fakeDb();
  await createReservation(db, base, deps());
  assert.match(db.log[0], /pg_advisory_xact_lock/);
  assert.equal(db.state.reservations[0].table_seats, 4);
  assert.equal(db.state.reservations[0].ends_at.toISOString(), '2026-10-25T00:30:00.000Z');
});

test('LOCK_BASE + clientId é a chave da trava', async () => {
  const db = fakeDb();
  const params = [];
  const query = db.query;
  db.withTransaction = async (fn) => fn({ query: async (sql, p) => { if (/advisory/.test(sql)) params.push(p[0]); return query(sql, p); } });
  await createReservation(db, base, deps());
  assert.deepEqual(params, [LOCK_BASE + 9]);
});

test('última mesa já tomada → SlotTakenError', async () => {
  const db = fakeDb({ reservations: [occupied(4), occupied(4), occupied(6), occupied(6)] });
  await assert.rejects(createReservation(db, base, deps()), SlotTakenError);
  assert.equal(db.state.reservations.length, 4);
});

test('force grava acima do limite com over_limit', async () => {
  const db = fakeDb({ reservations: [occupied(4), occupied(4), occupied(6), occupied(6)] });
  const r = await createReservation(db, { ...base, force: true }, deps());
  assert.equal(r.over_limit, true);
  assert.equal(r.table_seats, 4);
});

test('confirmar move o card pra agendado, sincroniza appointment_at e avisa a tela', async () => {
  const db = fakeDb();
  const d = deps();
  const r = await createReservation(db, base, d);
  assert.deepEqual(d.calls.moved, [{ clientId: 9, contactId: 1, event: 'agendado' }]);
  assert.deepEqual(db.state.appointmentSyncs, [1]);
  assert.deepEqual(d.calls.broadcast, [{ clientId: 9, name: 'reservation', data: { id: r.id, contactId: 1 } }]);
});

test('reserva sem contato não mexe no CRM', async () => {
  const db = fakeDb();
  const d = deps();
  await createReservation(db, { ...base, contactId: null }, d);
  assert.deepEqual(d.calls.moved, []);
  assert.deepEqual(db.state.appointmentSyncs, []);
});

test('cancelar recalcula appointment_at', async () => {
  const db = fakeDb({ reservations: [{ ...occupied(4), contact_id: 1, client_id: 9 }] });
  const d = deps();
  const r = await setReservationStatus(db, { clientId: 9, id: 1, status: 'cancelled', cancelledBy: 'staff' }, d);
  assert.equal(r.status, 'cancelled');
  assert.deepEqual(db.state.appointmentSyncs, [1]);
  assert.equal(d.calls.moved.length, 0);
});

test('cancelar reserva já cancelada devolve null', async () => {
  const db = fakeDb({ reservations: [{ ...occupied(4), contact_id: 1, status: 'cancelled' }] });
  assert.equal(await setReservationStatus(db, { clientId: 9, id: 1, status: 'cancelled' }, deps()), null);
});

test('updateReservation revalida sem contar a própria', async () => {
  const db = fakeDb({ reservations: [{ ...occupied(4), contact_id: 1, party_size: 4 }, occupied(4), occupied(6), occupied(6)] });
  const r = await updateReservation(db, { clientId: 9, id: 1, partySize: 3 }, deps());
  assert.equal(r.table_seats, 4);
});

test('loadReservationSettings mescla com os padrões', async () => {
  const s = await loadReservationSettings(fakeDb({ config: { tables: TABLES } }), 9);
  assert.equal(s.duration_minutes, 120);
  assert.deepEqual(s.tables, TABLES);
  const empty = await loadReservationSettings(fakeDb({ config: null }), 9);
  assert.deepEqual(empty.tables, []);
});

test('saveReservationSettings recusa horário invertido, seats 0 e exceção sem data', async () => {
  const db = fakeDb();
  await assert.rejects(saveReservationSettings(db, 9, { hours: { 1: [{ start: '23:00', lastBooking: '17:00' }] } }), /horário/i);
  await assert.rejects(saveReservationSettings(db, 9, { tables: [{ seats: 0, count: 2 }] }), /mesa/i);
  await assert.rejects(saveReservationSettings(db, 9, { exceptions: [{ closed: true }] }), /data/i);
  const saved = await saveReservationSettings(db, 9, { tables: [{ seats: 2, count: 3 }], hold_minutes: 20 });
  assert.equal(saved.hold_minutes, 20);
  assert.deepEqual(db.state.config.tables, [{ seats: 2, count: 3 }]);
});

test('erro depois de gravar (funil/agenda) não derruba a reserva já gravada', async () => {
  const db = fakeDb();
  const d = deps();
  d.moveToAutoStage = async () => { throw new Error('banco caiu'); };
  const r = await createReservation(db, base, d);
  assert.equal(r.party_size, 4);
  assert.equal(db.state.reservations.length, 1);
});
