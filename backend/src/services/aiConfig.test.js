import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_AI_SETTINGS, isAiActiveFor, validateAiSettings, aiStateFor } from './aiConfig.js';
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

test('a atendente tem nome padrão editável', () => {
  assert.equal(DEFAULT_AI_SETTINGS.name, 'Maria');
  assert.equal(validateAiSettings({ ...DEFAULT_AI_SETTINGS, name: '' }), null);
  assert.equal(validateAiSettings({ ...DEFAULT_AI_SETTINGS, name: 'Duda' }), null);
  assert.match(validateAiSettings({ ...DEFAULT_AI_SETTINGS, name: 'x'.repeat(41) }), /Nome/);
  assert.match(validateAiSettings({ ...DEFAULT_AI_SETTINGS, name: 42 }), /Nome/);
});

test('pausa geral: com ai.paused ninguém fala com a IA, mesmo ligada', () => {
  assert.equal(DEFAULT_AI_SETTINGS.paused, false);
  const s = (extra) => ({ ai: { enabled: true, test_phones: [], paused: false, ...extra } });
  assert.equal(isAiActiveFor(s({}), '5562981479128'), true);
  assert.equal(isAiActiveFor(s({ paused: true }), '5562981479128'), false);
  assert.equal(validateAiSettings({ ...DEFAULT_AI_SETTINGS, paused: true }), null);
  assert.match(validateAiSettings({ ...DEFAULT_AI_SETTINGS, paused: 'sim' }), /IA/);
});

test('aiStateFor: on, paused (pausa da conversa) ou null', () => {
  const NOW = new Date('2026-11-17T22:00:00Z');
  const settings = { ai: { enabled: true, test_phones: ['62981479196'], paused: false } };
  const mine = { wa_id: '556281479196', bot_paused_until: null };
  assert.equal(aiStateFor(settings, mine, NOW), 'on');
  assert.equal(aiStateFor(settings, { ...mine, bot_paused_until: '2026-11-18T10:00:00Z' }, NOW), 'paused');
  assert.equal(aiStateFor(settings, { ...mine, bot_paused_until: '2026-11-17T10:00:00Z' }, NOW), 'on'); // pausa já venceu
  assert.equal(aiStateFor(settings, { wa_id: '556281470000', bot_paused_until: null }, NOW), null); // fora da lista de teste
  assert.equal(aiStateFor(settings, { wa_id: '120363025246125486', bot_paused_until: null }, NOW), null); // grupo
  assert.equal(aiStateFor({ ai: { ...settings.ai, paused: true } }, mine, NOW), null); // pausa geral
  assert.equal(aiStateFor({ ai: { ...settings.ai, enabled: false } }, mine, NOW), null);
});

test('o botão de pausa geral grava só ai.paused e mantém nome, lista de teste e tom', async () => {
  const saved = [];
  const stored = { ai: { enabled: true, name: 'Maria', test_phones: ['62981479196'], tone: 'Tom X', extra: 'Regra Y' } };
  const db = {
    query: async (sql, params) => {
      if (/INSERT INTO reservation_settings/.test(sql)) { saved.push(JSON.parse(params[1])); return { rows: [] }; }
      return { rows: [{ config: stored }] };
    }
  };
  const next = await saveReservationSettings(db, 9, { ai: { paused: true } });
  assert.equal(next.ai.paused, true);
  assert.deepEqual(saved[0].ai, { ...DEFAULT_AI_SETTINGS, ...stored.ai, paused: true });
});

test('cardápio detalhado da IA: padrão vazio, aceita até 8000 caracteres', () => {
  assert.equal(DEFAULT_AI_SETTINGS.menu_details, '');
  assert.equal(validateAiSettings({ ...DEFAULT_AI_SETTINGS, menu_details: 'x'.repeat(8000) }), null);
  assert.match(validateAiSettings({ ...DEFAULT_AI_SETTINGS, menu_details: 'x'.repeat(8001) }), /Cardápio detalhado/);
  assert.match(validateAiSettings({ ...DEFAULT_AI_SETTINGS, menu_details: 42 }), /Cardápio detalhado/);
});

test('só leads de anúncio é o padrão', () => {
  assert.equal(DEFAULT_AI_SETTINGS.only_ad_leads, true);
});

test('isAiActiveFor: com só anúncio, atende lead de anúncio e ninguém mais', () => {
  const s = { ai: { enabled: true, only_ad_leads: true, test_phones: [] } };
  assert.equal(isAiActiveFor(s, '5562981479128', 'ad'), true);
  assert.equal(isAiActiveFor(s, '5562981479128', 'organic'), false);
  assert.equal(isAiActiveFor(s, '5562981479128', undefined), false);
  assert.equal(isAiActiveFor(s, '5562981479128', null), false);
});

test('isAiActiveFor: sem a regra de anúncio, atende qualquer origem', () => {
  const s = { ai: { enabled: true, only_ad_leads: false, test_phones: [] } };
  assert.equal(isAiActiveFor(s, '5562981479128', 'organic'), true);
});

test('isAiActiveFor: a regra de anúncio soma com a lista de teste e com a pausa', () => {
  const base = { enabled: true, only_ad_leads: true };
  assert.equal(isAiActiveFor({ ai: { ...base, test_phones: ['5562999990000'] } }, '5562981479128', 'ad'), false);
  assert.equal(isAiActiveFor({ ai: { ...base, paused: true, test_phones: [] } }, '5562981479128', 'ad'), false);
});

test('validateAiSettings: only_ad_leads precisa ser booleano, ausente vale', () => {
  const ok = { ...DEFAULT_AI_SETTINGS };
  assert.equal(validateAiSettings(ok), null);
  const legacy = { ...DEFAULT_AI_SETTINGS }; delete legacy.only_ad_leads;
  assert.equal(validateAiSettings(legacy), null);
  assert.match(validateAiSettings({ ...DEFAULT_AI_SETTINGS, only_ad_leads: 'sim' }), /inválido/);
});

test('aiStateFor: lead que não é de anúncio não ganha selo da IA', () => {
  const s = { ai: { ...DEFAULT_AI_SETTINGS, enabled: true } };
  const row = { wa_id: '5562981479128', bot_paused_until: null };
  assert.equal(aiStateFor(s, { ...row, source: 'organic' }), null);
  assert.equal(aiStateFor(s, { ...row, source: 'ad' }), 'on');
});

test('isAiActiveFor: número da lista de teste fala com a IA mesmo sem ser lead de anúncio', () => {
  const s = { ai: { enabled: true, only_ad_leads: true, test_phones: ['62981479128'] } };
  assert.equal(isAiActiveFor(s, '5562981479128', 'organic'), true);
  assert.equal(isAiActiveFor(s, '5511999998888', 'ad'), false);
});

test('validateAiSettings: eventos especiais', () => {
  const base = { ...DEFAULT_AI_SETTINGS };
  const ok = { title: 'Black Malibu', starts_on: '2026-11-27', ends_on: '2026-11-27', details: 'Almoço R$ 99.' };
  assert.deepEqual(DEFAULT_AI_SETTINGS.events, []);
  assert.equal(validateAiSettings({ ...base, events: [ok] }), null);
  assert.equal(validateAiSettings({ ...base, events: undefined }), null);
  assert.match(validateAiSettings({ ...base, events: [{ ...ok, title: '' }] }), /Eventos/);
  assert.match(validateAiSettings({ ...base, events: [{ ...ok, starts_on: '27/11/2026' }] }), /Eventos/);
  assert.match(validateAiSettings({ ...base, events: [{ ...ok, ends_on: '2026-11-26' }] }), /Eventos/);
  assert.match(validateAiSettings({ ...base, events: [{ ...ok, details: 'x'.repeat(1501) }] }), /Eventos/);
  assert.match(validateAiSettings({ ...base, events: Array(21).fill(ok) }), /Eventos/);
});
