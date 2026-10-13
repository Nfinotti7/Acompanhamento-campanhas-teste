import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fireEvent, fireStageEvent, fireSaleEvent } from './conversionEvents.js';

function fakeDb({ capi, contact = { id: 7, wa_id: '5511999998888', ctwa_clid: null }, stageEvent = 'Lead', duplicate = false }) {
  const calls = [];
  return {
    calls,
    query: async (sql, params = []) => {
      calls.push({ sql, params });
      if (/FROM capi_settings/.test(sql)) return { rows: capi ? [capi] : [] };
      if (/LEFT JOIN tracking_clicks/.test(sql)) return { rows: contact ? [contact] : [] };
      if (/JOIN crm_stages/.test(sql)) return { rows: [{ meta_event: stageEvent }] };
      if (/INSERT INTO conversion_events/.test(sql)) return { rows: duplicate ? [] : [{ id: 1 }] };
      return { rows: [] };
    }
  };
}

const enabled = { pixel_id: 'PX', enabled: true, config_json: JSON.stringify({ access_token: 'TOK' }), waba_id: 'baileys', test_event_code: null };

test('nao envia nada se a CAPI do cliente nao esta ligada', async () => {
  let sent = 0;
  const db = fakeDb({ capi: { ...enabled, enabled: false } });
  const res = await fireEvent({ clientId: 9, contactId: 7, eventName: 'Lead', eventId: 'x' }, { db, send: async () => { sent++; } });
  assert.equal(res.status, 'disabled');
  assert.equal(sent, 0);
});

test('nao envia sem token Meta', async () => {
  const db = fakeDb({ capi: { ...enabled, config_json: '{}' } });
  const res = await fireEvent({ clientId: 9, contactId: 7, eventName: 'Lead', eventId: 'x' }, { db, send: async () => {} });
  assert.equal(res.status, 'disabled');
});

test('envia, registra como enviado, e trata waba "baileys" como sem WABA', async () => {
  let sentArgs;
  const db = fakeDb({ capi: enabled, contact: { id: 7, wa_id: '55', ctwa_clid: 'CLID' } });
  const res = await fireEvent({ clientId: 9, contactId: 7, eventName: 'Lead', eventId: 'c7-Lead' }, { db, send: async (args) => { sentArgs = args; } });
  assert.equal(res.status, 'sent');
  assert.equal(sentArgs.pixelId, 'PX');
  assert.equal(sentArgs.event.action_source, 'chat');
  assert.ok(db.calls.some((c) => /SET status = 'sent'/.test(c.sql)));
});

test('evento ja registrado (mesmo event_id) nao reenvia', async () => {
  let sent = 0;
  const db = fakeDb({ capi: enabled, duplicate: true });
  const res = await fireEvent({ clientId: 9, contactId: 7, eventName: 'Lead', eventId: 'c7-Lead' }, { db, send: async () => { sent++; } });
  assert.equal(res.status, 'duplicate');
  assert.equal(sent, 0);
});

test('falha da Meta fica registrada com a mensagem de erro', async () => {
  const db = fakeDb({ capi: enabled });
  const res = await fireEvent({ clientId: 9, contactId: 7, eventName: 'Lead', eventId: 'c7-Lead' }, { db, send: async () => { throw new Error('Invalid pixel'); } });
  assert.equal(res.status, 'failed');
  const update = db.calls.find((c) => /SET status = 'failed'/.test(c.sql));
  assert.equal(update.params[0], 'Invalid pixel');
});

test('evento de etapa usa event_id fixo por contato e evento', async () => {
  let sentArgs;
  const db = fakeDb({ capi: enabled, stageEvent: 'Schedule' });
  await fireStageEvent({ clientId: 9, contactId: 7 }, { db, send: async (args) => { sentArgs = args; } });
  assert.equal(sentArgs.event.event_name, 'Schedule');
  assert.equal(sentArgs.event.event_id, 'c7-Schedule');
});

test('etapa sem evento ligado nao envia', async () => {
  const db = fakeDb({ capi: enabled, stageEvent: null });
  const res = await fireStageEvent({ clientId: 9, contactId: 7 }, { db, send: async () => { throw new Error('nao devia'); } });
  assert.equal(res.status, 'no_event');
});

test('venda envia Purchase com valor e event_id por venda', async () => {
  let sentArgs;
  const db = fakeDb({ capi: enabled });
  await fireSaleEvent({ clientId: 9, contactId: 7, conversionId: 55, value: 120 }, { db, send: async (args) => { sentArgs = args; } });
  assert.equal(sentArgs.event.event_name, 'Purchase');
  assert.equal(sentArgs.event.event_id, 'sale-55');
  assert.deepEqual(sentArgs.event.custom_data, { value: 120, currency: 'BRL' });
});
