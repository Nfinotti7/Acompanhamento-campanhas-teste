import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isReminderDue, isReviewDue, isConfirmReply, parseRating, parseOwnerPhones, reminderSendAfter
} from './followupText.js';

// 2026-11-07 (sábado) 19:00 em Brasília = 22:00Z
const START = new Date('2026-11-07T22:00:00Z');
const at = (hhmmZ) => new Date(`2026-11-07T${hhmmZ}:00Z`);

test('lembrete: sai 3h antes, nunca antes disso nem na última hora', () => {
  const args = { startsAt: START, createdAt: new Date('2026-11-05T12:00:00Z'), hoursBefore: 3 };
  assert.equal(isReminderDue({ ...args, now: at('18:30') }), false); // 15:30 local
  assert.equal(isReminderDue({ ...args, now: at('19:00') }), true); // 16:00 local
  assert.equal(isReminderDue({ ...args, now: at('21:00') }), true);
  assert.equal(isReminderDue({ ...args, now: at('21:30') }), false); // faltam 30 min
});

test('lembrete: reserva feita depois do ponto de envio não recebe', () => {
  const args = { startsAt: START, hoursBefore: 3, now: at('21:00') };
  assert.equal(isReminderDue({ ...args, createdAt: at('20:00') }), false);
  assert.equal(isReminderDue({ ...args, createdAt: at('18:00') }), true);
});

test('lembrete: almoço cedo espera as 8h', () => {
  // 09:30 local = 12:30Z, 3h antes seria 06:30 local
  const startsAt = new Date('2026-11-07T12:30:00Z');
  assert.equal(reminderSendAfter(startsAt, 3).toISOString(), '2026-11-07T11:00:00.000Z'); // 08:00 local
  const args = { startsAt, createdAt: new Date('2026-11-05T12:00:00Z'), hoursBefore: 3 };
  assert.equal(isReminderDue({ ...args, now: new Date('2026-11-07T10:00:00Z') }), false);
  assert.equal(isReminderDue({ ...args, now: new Date('2026-11-07T11:10:00Z') }), true);
});

test('avaliação: depois do fim, dentro do horário e do prazo', () => {
  const endsAt = new Date('2026-11-08T00:00:00Z'); // 21:00 local
  assert.equal(isReviewDue({ endsAt, now: new Date('2026-11-07T23:00:00Z') }), false);
  assert.equal(isReviewDue({ endsAt, now: new Date('2026-11-08T00:30:00Z') }), true); // 21:30 local
  assert.equal(isReviewDue({ endsAt, now: new Date('2026-11-08T02:30:00Z') }), false); // 23:30 local
  assert.equal(isReviewDue({ endsAt, now: new Date('2026-11-08T13:00:00Z') }), true); // 10:00 local
  assert.equal(isReviewDue({ endsAt, now: new Date('2026-11-09T13:00:00Z') }), false); // passou do prazo
});

test('confirmação de presença', () => {
  for (const ok of ['SIM', 'Sim!', 'confirmo', 'Confirmado 👍', 'tá confirmado', 'ok', 'estarei lá', 'Sim, vamos sim', 'pode ser']) {
    assert.equal(isConfirmReply(ok), true, ok);
  }
  for (const no of ['não', 'sim mas quero mudar o horário', 'cancelar', 'queria trocar pra 20h', 'sim, e vocês têm cadeirinha de bebê pra gente usar?', '5', 'quero ver o cardápio']) {
    assert.equal(isConfirmReply(no), false, no);
  }
});

test('nota de 1 a 5', () => {
  assert.equal(parseRating('5'), 5);
  assert.equal(parseRating(' 4. '), 4);
  assert.equal(parseRating('nota 3'), 3);
  assert.equal(parseRating('5 estrelas'), 5);
  assert.equal(parseRating('4/5'), 4);
  assert.equal(parseRating('⭐⭐⭐⭐'), 4);
  assert.equal(parseRating('10'), null);
  assert.equal(parseRating('0'), null);
  assert.equal(parseRating('foi ótimo'), null);
  assert.equal(parseRating('mesa pra 4'), null);
});

test('telefones do dono', () => {
  assert.deepEqual(parseOwnerPhones('(62) 99999-0000, 5562988887777\n62999990000'), ['5562999990000', '5562988887777']);
  assert.deepEqual(parseOwnerPhones(''), []);
  assert.deepEqual(parseOwnerPhones('123'), []);
});
