import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_RESERVATION_MESSAGES, RESERVATION_MESSAGE_KEYS, isReservationCommand, isCancelCommand, isYes,
  parseDay, parseTimeChoice, formatDayLabel, formatTime, formatOptions
} from './reservationText.js';

test('isReservationCommand', () => {
  assert.ok(isReservationCommand('Quero fazer uma reserva (cód. RESERVA)'));
  assert.ok(isReservationCommand('cod reserva'));
  assert.ok(isReservationCommand('COD.RESERVA'));
  assert.ok(isReservationCommand('Reservar'));
  assert.ok(isReservationCommand('reserva!'));
  assert.ok(!isReservationCommand('vocês aceitam reserva pra sábado?'));
  assert.ok(!isReservationCommand('Quero entrar na fila (cód. FILA)'));
  assert.ok(!isReservationCommand(''));
});

test('isCancelCommand é estrito', () => {
  assert.ok(isCancelCommand('Cancelar!'));
  assert.ok(isCancelCommand('cancela'));
  assert.ok(isCancelCommand('cancelar reserva'));
  assert.ok(isCancelCommand('CANCELAR a reserva'));
  assert.ok(!isCancelCommand('posso cancelar o pedido?'));
  assert.ok(!isCancelCommand('não quero cancelar'));
});

test('isYes', () => {
  for (const t of ['sim', 'Sim!', 's', 'ok', 'isso', 'confirmo', 'pode', 'pode sim', '👍', 'sim, pode']) assert.ok(isYes(t), t);
  for (const t of ['não', 'nao', 'talvez', '4', 'simone']) assert.ok(!isYes(t), t);
});

test('parseDay', () => {
  const today = '2026-10-24'; // sábado
  assert.equal(parseDay('hoje', today), '2026-10-24');
  assert.equal(parseDay('amanhã', today), '2026-10-25');
  assert.equal(parseDay('amanha', today), '2026-10-25');
  assert.equal(parseDay('depois de amanhã', today), '2026-10-26');
  assert.equal(parseDay('sábado', today), '2026-10-24');
  assert.equal(parseDay('pode ser sabado', today), '2026-10-24');
  assert.equal(parseDay('sexta-feira', today), '2026-10-30');
  assert.equal(parseDay('segunda', today), '2026-10-26');
  assert.equal(parseDay('domingo', today), '2026-10-25');
  assert.equal(parseDay('dia 5', today), '2026-11-05');
  assert.equal(parseDay('dia 28', today), '2026-10-28');
  assert.equal(parseDay('31/10', today), '2026-10-31');
  assert.equal(parseDay('05/01', today), '2027-01-05');
  assert.equal(parseDay('25/12/2026', today), '2026-12-25');
  assert.equal(parseDay('31/02', today), null);
  assert.equal(parseDay('banana', today), null);
  assert.equal(parseDay('sim', today), null);
});

test('parseTimeChoice', () => {
  const opts = ['19:00', '19:30', '21:00'];
  assert.equal(parseTimeChoice('2', opts), '19:30');
  assert.equal(parseTimeChoice('1)', opts), '19:00');
  assert.equal(parseTimeChoice('19h30', opts), '19:30');
  assert.equal(parseTimeChoice('19:30', opts), '19:30');
  assert.equal(parseTimeChoice('19 e 30', opts), '19:30');
  assert.equal(parseTimeChoice('às 21h', opts), '21:00');
  assert.equal(parseTimeChoice('19', opts), '19:00');
  assert.equal(parseTimeChoice('20h', opts), null);
  assert.equal(parseTimeChoice('7', opts), null);
  assert.equal(parseTimeChoice('sim', opts), null);
});

test('formatos', () => {
  assert.equal(formatTime('19:00'), '19h');
  assert.equal(formatTime('19:30'), '19h30');
  assert.equal(formatDayLabel('2026-10-24', '2026-10-22'), 'sábado 24/10');
  assert.equal(formatDayLabel('2026-10-22', '2026-10-22'), 'hoje (22/10)');
  assert.equal(formatDayLabel('2026-10-23', '2026-10-22'), 'amanhã (23/10)');
  assert.equal(formatOptions(['19:00', '19:30']), '1) 19h  2) 19h30');
});

test('textos padrão: chaves e nada de robô', () => {
  for (const key of ['askSize', 'askDay', 'askTime', 'askName', 'confirm', 'confirmed', 'slotTaken', 'cancelled', 'cancelledByStaff', 'handoff', 'adFallbackAsk', 'noSlotsSuggest']) {
    assert.ok(RESERVATION_MESSAGE_KEYS.includes(key), key);
  }
  assert.equal(DEFAULT_RESERVATION_MESSAGES.handoff, 'Só um instante, já te respondo 🙂');
  for (const t of Object.values(DEFAULT_RESERVATION_MESSAGES)) assert.ok(!/rob[oô]|assistente|equipe/i.test(t), t);
});
