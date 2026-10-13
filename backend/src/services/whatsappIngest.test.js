import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ingestWhatsAppEvent } from './whatsappIngest.js';

function makeFakeDb() {
  const calls = [];
  let nextId = 1;
  const db = {
    query: async (sql, params = []) => {
      calls.push({ sql, params });
      if (/RETURNING id/.test(sql)) {
        return { rows: [{ id: nextId++ }] };
      }
      return { rows: [] };
    }
  };
  return { db, calls };
}

const baseEvent = (overrides) => ({
  waId: '5511999998888',
  profileName: 'Maria Teste',
  waMessageId: 'wamid.ABC123',
  direction: 'inbound',
  body: 'Oi, quero reservar',
  sentAt: '2026-10-12T12:00:00.000Z',
  ctwaClid: null,
  adId: null,
  adHeadline: null,
  adBody: null,
  ...overrides
});

test('ingestWhatsAppEvent grava o contato e a mensagem pro client_id informado', async () => {
  const { db, calls } = makeFakeDb();

  const contactId = await ingestWhatsAppEvent(5, baseEvent(), { db });

  assert.equal(contactId, 1);
  const contactCall = calls.find((c) => /INSERT INTO whatsapp_contacts/.test(c.sql));
  assert.ok(contactCall);
  assert.equal(contactCall.params[0], 5); // client_id
  assert.equal(contactCall.params[1], '5511999998888'); // wa_id

  const messageCall = calls.find((c) => /INSERT INTO whatsapp_messages/.test(c.sql));
  assert.ok(messageCall);
  assert.deepEqual(messageCall.params, [5, 1, 'inbound', 'Oi, quero reservar', 'wamid.ABC123', '2026-10-12T12:00:00.000Z']);
});

test('ingestWhatsAppEvent marca source como ad quando tem ctwa_clid', async () => {
  const { db, calls } = makeFakeDb();

  await ingestWhatsAppEvent(5, baseEvent({ ctwaClid: 'CLID_123', adId: 'AD_1' }), { db });

  const contactCall = calls.find((c) => /INSERT INTO whatsapp_contacts/.test(c.sql));
  assert.equal(contactCall.params[7], 'ad'); // source
});

test('ingestWhatsAppEvent marca source como organic quando nao tem ctwa_clid', async () => {
  const { db, calls } = makeFakeDb();

  await ingestWhatsAppEvent(5, baseEvent(), { db });

  const contactCall = calls.find((c) => /INSERT INTO whatsapp_contacts/.test(c.sql));
  assert.equal(contactCall.params[7], 'organic');
});

test('ingestWhatsAppEvent limpa manual_stage e manual_stage_set_at no upsert', async () => {
  const { db, calls } = makeFakeDb();

  await ingestWhatsAppEvent(5, baseEvent(), { db });

  const contactCall = calls.find((c) => /INSERT INTO whatsapp_contacts/.test(c.sql));
  assert.match(contactCall.sql, /manual_stage = NULL/);
  assert.match(contactCall.sql, /manual_stage_set_at = NULL/);
});

test('ingestWhatsAppEvent notifica via SSE quando a mensagem e gravada', async () => {
  const { db } = makeFakeDb();
  const broadcasts = [];
  const broadcast = (clientId, eventName, data) => broadcasts.push({ clientId, eventName, data });

  await ingestWhatsAppEvent(5, baseEvent(), { db, broadcast });

  assert.equal(broadcasts.length, 1);
  assert.equal(broadcasts[0].clientId, 5);
  assert.equal(broadcasts[0].eventName, 'message');
  assert.equal(broadcasts[0].data.contactId, 1);
  assert.equal(broadcasts[0].data.direction, 'inbound');
  assert.equal(broadcasts[0].data.body, 'Oi, quero reservar');
});
