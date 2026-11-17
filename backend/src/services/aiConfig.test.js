import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_AI_SETTINGS, isAiActiveFor, validateAiSettings } from './aiConfig.js';
import { loadReservationSettings, saveReservationSettings } from './reservationStore.js';

test('IA desligada por padrão', () => {
  assert.equal(DEFAULT_AI_SETTINGS.enabled, false);
  assert.deepEqual(DEFAULT_AI_SETTINGS.test_phones, []);
  assert.ok(DEFAULT_AI_SETTINGS.tone.length > 20);
});

test('isAiActiveFor: desligada nunca fala', () => {
  assert.equal(isAiActiveFor({ ai: { enabled: false, test_phones: [] } }, '5562981479128'), false);
  assert.equal(isAiActiveFor({}, '5562981479128'), false);
});

test('isAiActiveFor: ligada sem lista fala com todo mundo', () => {
  assert.equal(isAiActiveFor({ ai: { enabled: true, test_phones: [] } }, '5562981479128'), true);
});

test('isAiActiveFor: com lista, só os números da lista', () => {
  const s = { ai: { enabled: true, test_phones: ['62981479128'] } };
  assert.equal(isAiActiveFor(s, '5562981479128'), true);
  assert.equal(isAiActiveFor(s, '5562999999999'), false);
});

test('validateAiSettings aceita a configuração padrão', () => {
  assert.equal(validateAiSettings(DEFAULT_AI_SETTINGS), null);
});

test('validateAiSettings rejeita valores inválidos', () => {
  const base = DEFAULT_AI_SETTINGS;
  assert.match(validateAiSettings({ ...base, enabled: 'sim' }), /IA/);
  assert.match(validateAiSettings({ ...base, test_phones: Array(21).fill('62981479128') }), /números/);
  assert.match(validateAiSettings({ ...base, test_phones: ['abc'] }), /números/);
  assert.match(validateAiSettings({ ...base, tone: 'x'.repeat(1501) }), /Tom de voz/);
  assert.match(validateAiSettings({ ...base, extra: 'x'.repeat(2001) }), /Instruções/);
});

test('loadReservationSettings devolve ai com padrão e mescla o salvo', async () => {
  const db = { query: async () => ({ rows: [{ config: { ai: { enabled: true } } }] }) };
  const s = await loadReservationSettings(db, 9);
  assert.equal(s.ai.enabled, true);
  assert.deepEqual(s.ai.test_phones, []);
  assert.equal(s.ai.tone, DEFAULT_AI_SETTINGS.tone);
});

test('saveReservationSettings recusa IA inválida', async () => {
  const db = { query: async () => ({ rows: [{ config: {} }] }) };
  await assert.rejects(
    saveReservationSettings(db, 9, { ai: { enabled: 'sim' } }),
    /IA/
  );
});

test('isAiActiveFor: o 9 extra do celular não atrapalha (WhatsApp guarda o número com 12 ou 13 dígitos)', () => {
  const comNove = { ai: { enabled: true, test_phones: ['62981479128'] } };
  assert.equal(isAiActiveFor(comNove, '556281479128'), true); // wa_id sem o 9
  assert.equal(isAiActiveFor(comNove, '5562981479128'), true); // wa_id com o 9
  const semNove = { ai: { enabled: true, test_phones: ['6281479128'] } };
  assert.equal(isAiActiveFor(semNove, '5562981479128'), true);
  assert.equal(isAiActiveFor(semNove, '556281479128'), true);
  assert.equal(isAiActiveFor(comNove, '556281479999'), false);
  assert.equal(isAiActiveFor(comNove, '5511981479128'), false); // outro DDD
  const comPais = { ai: { enabled: true, test_phones: ['5562981479128'] } };
  assert.equal(isAiActiveFor(comPais, '556281479128'), true);
});
