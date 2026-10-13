import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStage, isValidManualStage, STAGE_KEYS } from './whatsappStage.js';

const NOW = new Date('2026-10-12T12:00:00.000Z');

test('conversao registrada vence qualquer outra condicao -> compareceu', () => {
  const stage = computeStage({
    hasConversion: true,
    appointmentAt: new Date('2026-10-20T18:00:00.000Z'), // futuro, mas irrelevante
    hasOutbound: true,
    lastActivityAt: NOW,
    remarketingDays: 3,
    now: NOW
  });
  assert.equal(stage, 'compareceu');
});

test('agendamento no futuro, sem conversao -> agendado', () => {
  const stage = computeStage({
    hasConversion: false,
    appointmentAt: new Date('2026-10-13T18:00:00.000Z'),
    hasOutbound: true,
    lastActivityAt: NOW,
    remarketingDays: 3,
    now: NOW
  });
  assert.equal(stage, 'agendado');
});

test('agendamento no passado, sem conversao -> nao_compareceu', () => {
  const stage = computeStage({
    hasConversion: false,
    appointmentAt: new Date('2026-10-10T18:00:00.000Z'),
    hasOutbound: true,
    lastActivityAt: NOW,
    remarketingDays: 3,
    now: NOW
  });
  assert.equal(stage, 'nao_compareceu');
});

test('agendamento no passado sem nenhuma mensagem registrada -> nao_compareceu (nao quebra)', () => {
  const stage = computeStage({
    hasConversion: false,
    appointmentAt: new Date('2026-10-10T18:00:00.000Z'),
    hasOutbound: false,
    lastActivityAt: null,
    remarketingDays: 3,
    now: NOW
  });
  assert.equal(stage, 'nao_compareceu');
});

test('sem agendamento, atividade recente e equipe ja respondeu -> em_atendimento', () => {
  const stage = computeStage({
    hasConversion: false,
    appointmentAt: null,
    hasOutbound: true,
    lastActivityAt: new Date('2026-10-11T12:00:00.000Z'), // 1 dia atras
    remarketingDays: 3,
    now: NOW
  });
  assert.equal(stage, 'em_atendimento');
});

test('sem agendamento, atividade recente e equipe nunca respondeu -> novo_lead', () => {
  const stage = computeStage({
    hasConversion: false,
    appointmentAt: null,
    hasOutbound: false,
    lastActivityAt: new Date('2026-10-11T12:00:00.000Z'),
    remarketingDays: 3,
    now: NOW
  });
  assert.equal(stage, 'novo_lead');
});

test('sem agendamento, atividade antiga mesmo tendo tido resposta antes -> remarketing (nao fica preso em em_atendimento)', () => {
  const stage = computeStage({
    hasConversion: false,
    appointmentAt: null,
    hasOutbound: true, // a equipe respondeu em algum momento no passado
    lastActivityAt: new Date('2026-10-05T12:00:00.000Z'), // 7 dias atras
    remarketingDays: 3,
    now: NOW
  });
  assert.equal(stage, 'remarketing');
});

test('sem agendamento e sem nenhuma atividade registrada -> remarketing', () => {
  const stage = computeStage({
    hasConversion: false,
    appointmentAt: null,
    hasOutbound: false,
    lastActivityAt: null,
    remarketingDays: 3,
    now: NOW
  });
  assert.equal(stage, 'remarketing');
});

test('STAGE_KEYS tem as 6 etapas do funil', () => {
  assert.deepEqual(STAGE_KEYS, ['novo_lead', 'em_atendimento', 'agendado', 'nao_compareceu', 'compareceu', 'remarketing']);
});

test('isValidManualStage aceita null e undefined (significa "automatico")', () => {
  assert.equal(isValidManualStage(null), true);
  assert.equal(isValidManualStage(undefined), true);
});

test('isValidManualStage aceita qualquer uma das 6 chaves', () => {
  for (const key of STAGE_KEYS) {
    assert.equal(isValidManualStage(key), true);
  }
});

test('isValidManualStage rejeita valor que nao e uma das 6 chaves', () => {
  assert.equal(isValidManualStage('etapa_inventada'), false);
  assert.equal(isValidManualStage(''), false);
  assert.equal(isValidManualStage(123), false);
});
