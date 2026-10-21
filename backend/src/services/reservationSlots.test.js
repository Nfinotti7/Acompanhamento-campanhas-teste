import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_RESERVATION_SETTINGS, toInstant, dayOf, weekdayOf, tablesForDay, slotsForDay,
  pickTableSize, availableSlots, maxParty, occupancyForDay
} from './reservationSlots.js';

const WEEKDAY = [{ start: '17:00', lastBooking: '22:30' }];
const WEEKEND = [{ start: '12:00', lastBooking: '14:30' }, { start: '18:00', lastBooking: '22:30' }];
const MALIBU = {
  ...DEFAULT_RESERVATION_SETTINGS,
  tables: [{ seats: 2, count: 2 }, { seats: 4, count: 2 }, { seats: 6, count: 2 }],
  hours: { 0: WEEKEND, 1: WEEKDAY, 2: WEEKDAY, 3: WEEKDAY, 4: WEEKDAY, 5: WEEKEND, 6: WEEKEND }
};

function booked(seats, day, time, minutes = 120) {
  const starts = toInstant(day, time);
  return { table_seats: seats, starts_at: starts, ends_at: new Date(starts.getTime() + minutes * 60e3) };
}

test('padrões do spec', () => {
  assert.equal(DEFAULT_RESERVATION_SETTINGS.duration_minutes, 120);
  assert.equal(DEFAULT_RESERVATION_SETTINGS.slot_minutes, 30);
  assert.equal(DEFAULT_RESERVATION_SETTINGS.hold_minutes, 15);
  assert.equal(DEFAULT_RESERVATION_SETTINGS.min_advance_minutes, 120);
  assert.equal(DEFAULT_RESERVATION_SETTINGS.max_advance_days, 30);
  assert.equal(DEFAULT_RESERVATION_SETTINGS.ad_fallback, false);
  assert.equal(DEFAULT_RESERVATION_SETTINGS.bot_enabled, true);
});

test('toInstant usa UTC-3', () => {
  assert.equal(toInstant('2026-10-24', '19:30').toISOString(), '2026-10-24T22:30:00.000Z');
});

test('dayOf e weekdayOf em Brasília', () => {
  assert.equal(dayOf(new Date('2026-10-25T02:00:00Z')), '2026-10-24'); // 23h de sábado
  assert.equal(weekdayOf('2026-10-24'), 6);
  assert.equal(weekdayOf('2026-10-25'), 0);
});

test('slotsForDay quinta: 17:00..22:30 de 30 em 30', () => {
  const s = slotsForDay(MALIBU, '2026-10-22');
  assert.equal(s[0], '17:00');
  assert.equal(s.at(-1), '22:30');
  assert.equal(s.length, 12);
});

test('slotsForDay sábado: almoço e jantar', () => {
  const s = slotsForDay(MALIBU, '2026-10-24');
  assert.deepEqual(s.slice(0, 6), ['12:00', '12:30', '13:00', '13:30', '14:00', '14:30']);
  assert.equal(s[6], '18:00');
  assert.equal(s.length, 6 + 10);
});

test('slotsForDay de dia sem turno é vazio', () => {
  assert.deepEqual(slotsForDay({ ...MALIBU, hours: { ...MALIBU.hours, 1: [] } }, '2026-10-26'), []);
});

test('exceção closed zera o dia; exceção com tables substitui', () => {
  const s = { ...MALIBU, exceptions: [{ date: '2026-10-24', closed: true }, { date: '2026-10-25', tables: [{ seats: 4, count: 1 }] }] };
  assert.deepEqual(tablesForDay(s, '2026-10-24'), []);
  assert.deepEqual(tablesForDay(s, '2026-10-25'), [{ seats: 4, count: 1 }]);
  assert.deepEqual(tablesForDay(s, '2026-10-26'), MALIBU.tables);
});

test('grupo de 3 vai pra mesa de 4; sem 4 livre, vai pra 6', () => {
  const t = toInstant('2026-10-24', '20:00');
  const busy4 = [booked(4, '2026-10-24', '20:00'), booked(4, '2026-10-24', '20:00')];
  assert.equal(pickTableSize({ tables: MALIBU.tables, reservations: [], startsAt: t, durationMinutes: 120, partySize: 3 }), 4);
  assert.equal(pickTableSize({ tables: MALIBU.tables, reservations: busy4, startsAt: t, durationMinutes: 120, partySize: 3 }), 6);
});

test('sem nenhuma mesa que comporte → null', () => {
  const t = toInstant('2026-10-24', '20:00');
  const all6 = [booked(6, '2026-10-24', '19:00'), booked(6, '2026-10-24', '20:30')];
  assert.equal(pickTableSize({ tables: MALIBU.tables, reservations: all6, startsAt: t, durationMinutes: 120, partySize: 5 }), null);
});

test('reserva das 19:00 bloqueia 20:30 mas não 21:00', () => {
  const two2 = [booked(2, '2026-10-24', '19:00'), booked(2, '2026-10-24', '19:00')];
  const args = { tables: MALIBU.tables, reservations: two2, durationMinutes: 120, partySize: 2 };
  assert.equal(pickTableSize({ ...args, startsAt: toInstant('2026-10-24', '20:30') }), 4);
  assert.equal(pickTableSize({ ...args, startsAt: toInstant('2026-10-24', '21:00') }), 2);
});

test('reserva das 22:30 ocupa até 00:30 do dia seguinte', () => {
  const late = [booked(6, '2026-10-24', '22:30'), booked(6, '2026-10-24', '22:30')];
  const startsAt = toInstant('2026-10-25', '00:00');
  assert.equal(pickTableSize({ tables: MALIBU.tables, reservations: late, startsAt, durationMinutes: 120, partySize: 6 }), null);
  assert.equal(pickTableSize({ tables: MALIBU.tables, reservations: late, startsAt: toInstant('2026-10-25', '00:30'), durationMinutes: 120, partySize: 6 }), 6);
});

test('availableSlots respeita 2h de antecedência', () => {
  const now = toInstant('2026-10-22', '18:10');
  const slots = availableSlots({ settings: MALIBU, day: '2026-10-22', partySize: 2, reservations: [], now });
  assert.equal(slots[0].time, '20:30');
  assert.equal(slots[0].tableSeats, 2);
  assert.equal(slots[0].startsAt.toISOString(), '2026-10-22T23:30:00.000Z');
});

test('availableSlots pula horário lotado', () => {
  const now = toInstant('2026-10-22', '10:00');
  const full = [2, 2, 4, 4, 6, 6].map((s) => booked(s, '2026-10-22', '19:00'));
  const times = availableSlots({ settings: MALIBU, day: '2026-10-22', partySize: 2, reservations: full, now }).map((s) => s.time);
  assert.ok(times.includes('17:00'));
  assert.ok(!times.includes('18:00'));
  assert.ok(!times.includes('20:30'));
  assert.ok(times.includes('21:00'));
});

test('availableSlots acima de 30 dias e grupo de 7 dão vazio', () => {
  const now = toInstant('2026-10-22', '10:00');
  assert.deepEqual(availableSlots({ settings: MALIBU, day: '2026-11-22', partySize: 2, reservations: [], now }), []);
  assert.ok(availableSlots({ settings: MALIBU, day: '2026-11-21', partySize: 2, reservations: [], now }).length > 0);
  assert.deepEqual(availableSlots({ settings: MALIBU, day: '2026-10-24', partySize: 7, reservations: [], now }), []);
});

test('availableSlots de dia no passado é vazio', () => {
  const now = toInstant('2026-10-22', '10:00');
  assert.deepEqual(availableSlots({ settings: MALIBU, day: '2026-10-21', partySize: 2, reservations: [], now }), []);
});

test('maxParty: configurado ou maior mesa', () => {
  assert.equal(maxParty(MALIBU), 6);
  assert.equal(maxParty({ ...MALIBU, max_party: 4 }), 4);
});

test('occupancyForDay conta livres por tamanho', () => {
  const occ = occupancyForDay({ settings: MALIBU, day: '2026-10-22', reservations: [booked(4, '2026-10-22', '19:00')] });
  const at = (t) => occ.find((o) => o.time === t).free;
  assert.deepEqual(at('17:00'), { 2: 2, 4: 2, 6: 2 });
  assert.deepEqual(at('20:30'), { 2: 2, 4: 1, 6: 2 });
  assert.deepEqual(at('21:00'), { 2: 2, 4: 2, 6: 2 });
});
