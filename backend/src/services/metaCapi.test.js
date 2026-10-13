import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCapiEvent, buildFbc, sha256, sendCapiEvent, isValidStageMetaEvent } from './metaCapi.js';

const base = { eventName: 'Lead', eventId: 'stage-1-Lead', eventTime: '2026-10-13T12:00:00Z', clientId: 9 };

test('sha256 normaliza antes do hash (igual a Meta exige)', () => {
  assert.equal(sha256(' BR '), sha256('br'));
});

test('conversa de anuncio CTWA com WABA vira evento business_messaging com ctwa_clid', () => {
  const event = buildCapiEvent({ ...base, contact: { id: 1, wa_id: '5511999998888', ctwa_clid: 'CLID' }, wabaId: 'WABA1' });
  assert.equal(event.action_source, 'business_messaging');
  assert.equal(event.messaging_channel, 'whatsapp');
  assert.equal(event.user_data.ctwa_clid, 'CLID');
  assert.equal(event.user_data.whatsapp_business_account_id, 'WABA1');
  assert.equal(event.event_time, Date.parse('2026-10-13T12:00:00Z') / 1000);
  assert.equal(event.event_id, 'stage-1-Lead');
});

test('sem ctwa_clid vira evento chat casado por telefone e fbc do link rastreavel', () => {
  const event = buildCapiEvent({ ...base, contact: { id: 1, wa_id: '+55 11 99999-8888', fbclid: 'FBX', clicked_at: '2026-10-13T11:00:00Z' } });
  assert.equal(event.action_source, 'chat');
  assert.deepEqual(event.user_data.ph, [sha256('5511999998888')]);
  assert.equal(event.user_data.fbc, `fb.1.${Date.parse('2026-10-13T11:00:00Z')}.FBX`);
  assert.equal(event.user_data.ctwa_clid, undefined);
});

test('ctwa_clid sem WABA (Baileys sem API oficial) cai no evento chat', () => {
  const event = buildCapiEvent({ ...base, contact: { id: 1, wa_id: '5511', ctwa_clid: 'CLID' } });
  assert.equal(event.action_source, 'chat');
});

test('valor vai em custom_data em BRL', () => {
  const event = buildCapiEvent({ ...base, eventName: 'Purchase', contact: { id: 1, wa_id: '55' }, value: '187.50' });
  assert.deepEqual(event.custom_data, { value: 187.5, currency: 'BRL' });
});

test('buildFbc sem fbclid devolve null', () => {
  assert.equal(buildFbc(null, new Date()), null);
});

test('Purchase nao pode ser ligado a etapa', () => {
  assert.ok(isValidStageMetaEvent('Lead'));
  assert.ok(isValidStageMetaEvent(null));
  assert.ok(!isValidStageMetaEvent('Purchase'));
});

test('sendCapiEvent manda test_event_code e devolve erro legivel da Meta', async () => {
  let sentBody;
  const ok = async (_url, opts) => { sentBody = JSON.parse(opts.body); return { ok: true, json: async () => ({ events_received: 1 }) }; };
  const res = await sendCapiEvent({ pixelId: 'P', accessToken: 'T', event: { a: 1 }, testEventCode: 'TEST1', fetchImpl: ok });
  assert.equal(res.events_received, 1);
  assert.equal(sentBody.test_event_code, 'TEST1');

  const fail = async () => ({ ok: false, status: 400, json: async () => ({ error: { message: 'Invalid parameter' } }) });
  await assert.rejects(sendCapiEvent({ pixelId: 'P', accessToken: 'T', event: {}, fetchImpl: fail }), /Invalid parameter/);
});
