import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_RESERVATION_MESSAGES, RESERVATION_MESSAGE_KEYS, isReservationCommand, isCancelCommand, isYes,
  parseDay, parseTimeChoice, formatDayLabel, formatTime, formatOptions, mentionsWeekday,
  isChangeCommand, mentionsTimeWord, mentionsDayWord, extractTime, correctedName, isReservationIntent, extractPartySize
} from './reservationText.js';

test('isChangeCommand', () => {
  assert.ok(isChangeCommand('MUDAR'));
  assert.ok(isChangeCommand('Posso mudar horário ?'));
  assert.ok(isChangeCommand('mudar para 12:30'));
  assert.ok(isChangeCommand('quero trocar a data'));
  assert.ok(isChangeCommand('dá pra remarcar?'));
  assert.ok(isChangeCommand('consigo mudar pra sábado?'));
  assert.ok(isChangeCommand('alterar reserva'));
  assert.ok(!isChangeCommand('muda nada'));
  assert.ok(!isChangeCommand('vou trocar de roupa e já vou'));
  assert.ok(!isChangeCommand('cancelar'));
});

test('mentionsTimeWord / mentionsDayWord', () => {
  assert.ok(mentionsTimeWord('posso mudar o horário?'));
  assert.ok(!mentionsTimeWord('mudar o dia'));
  assert.ok(mentionsDayWord('quero mudar a data'));
  assert.ok(mentionsDayWord('mudar o dia'));
});

test('extractTime: horário dentro da frase, sem pegar a data nem número pelado', () => {
  assert.equal(extractTime('mudar para 12:30'), '12:30');
  assert.equal(extractTime('sábado 20h'), '20:00');
  assert.equal(extractTime('dia 25 às 19h30'), '19:30');
  assert.equal(extractTime('às 21'), '21:00');
  assert.equal(extractTime('As 12:00'), '12:00');
  assert.equal(extractTime('25/10'), null);
  assert.equal(extractTime('2'), null);
  assert.equal(extractTime('mudar o horário'), null);
  assert.equal(extractTime('às 25h'), null);
});

test('correctedName: nome completo que tem o nome da reserva', () => {
  assert.equal(correctedName('Ana Luiza Pinheiro silva', 'Ana Luiza'), 'Ana Luiza Pinheiro silva');
  assert.equal(correctedName('ana luiza pinheiro', 'Ana'), 'ana luiza pinheiro');
  assert.equal(correctedName('tudo certo', 'Ana Luiza'), null);
  assert.equal(correctedName('Carlos Lima', 'Ana Luiza'), null);
  assert.equal(correctedName('Ana Luiza', 'Ana Luiza'), null);
  assert.equal(correctedName('Ana', 'Ana Luiza'), null);
  assert.equal(correctedName('sim Ana Luiza', 'Ana Luiza'), null);
  assert.equal(correctedName('Ana 12h', 'Ana Luiza'), null);
});

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

test('parseTimeChoice: hora pelada (12, 13) vale como hora quando está na lista', () => {
  const weekend = ['12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00', '21:30', '22:00', '22:30'];
  assert.equal(parseTimeChoice('12', weekend), '12:00');
  assert.equal(parseTimeChoice('13', weekend), '13:00');
  assert.equal(parseTimeChoice('3', weekend), '13:00');
  assert.equal(parseTimeChoice('11', weekend), '20:00');
  assert.equal(parseTimeChoice('19', weekend), '19:00');
});

test('mentionsWeekday', () => {
  assert.ok(mentionsWeekday('pode ser sábado'));
  assert.ok(!mentionsWeekday('hoje'));
  assert.ok(!mentionsWeekday('25/10'));
});

test('isReservationIntent: jeitos comuns de pedir reserva', () => {
  for (const t of [
    'gostaria de fazer uma reserva', 'Quero reserva para 12h', 'quero reservar uma mesa', 'Vocês aceitam reserva?',
    'fazem reserva?', 'dá pra reservar pra sábado?', 'Bom dia, quero fazer uma reserva para 4 pessoas', 'reservas',
    'Gostaria de reservar tmb uma mesa para dois as 12:30 aproximadamente', 'como faço pra reservar?'
  ]) assert.ok(isReservationIntent(t), t);
  for (const t of [
    'já fiz a reserva', 'tenho uma reserva hoje às 20h', 'reservei pra sábado', 'quero cancelar minha reserva',
    'minha reserva de sábado está confirmada?', 'quero mudar a reserva', 'boa noite', 'Quero ver o cardápio'
  ]) assert.ok(!isReservationIntent(t), t);
});

test('extractPartySize: só número que é de pessoas', () => {
  assert.equal(extractPartySize('mesa para dois as 12:30'), 2);
  assert.equal(extractPartySize('reserva para 4 pessoas'), 4);
  assert.equal(extractPartySize('somos 3'), 3);
  assert.equal(extractPartySize('pra 6'), 6);
  assert.equal(extractPartySize('um casal'), 2);
  assert.equal(extractPartySize('Quero reserva para 12h'), null);
  assert.equal(extractPartySize('reserva pra 25/10'), null);
  assert.equal(extractPartySize('para 19:30'), null);
  assert.equal(extractPartySize('2 adultos e uma criança'), null);
  assert.equal(extractPartySize('gostaria de fazer uma reserva'), null);
});
