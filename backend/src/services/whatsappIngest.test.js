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
  assert.deepEqual(messageCall.params, [5, 1, 'inbound', 'Oi, quero reservar', 'wamid.ABC123', '2026-10-12T12:00:00.000Z', null, null]);
});

test('ingestWhatsAppEvent baixa e guarda a midia quando a mensagem e nova', async () => {
  const { db, calls } = makeFakeDb();
  let downloads = 0;
  const event = baseEvent({
    body: '📷 Imagem',
    mediaType: 'image',
    media: { mimeType: 'image/jpeg', download: async () => { downloads++; return Buffer.from('fake-jpeg'); } }
  });

  await ingestWhatsAppEvent(5, event, { db, broadcast: () => {} });

  assert.equal(downloads, 1);
  const mediaInsert = calls.find((c) => /INSERT INTO whatsapp_media/.test(c.sql));
  assert.ok(mediaInsert);
  assert.equal(mediaInsert.params[2], 'image/jpeg');
  assert.ok(Buffer.isBuffer(mediaInsert.params[3]));
  const update = calls.find((c) => /UPDATE whatsapp_messages SET media_id/.test(c.sql));
  assert.ok(update);
});

test('ingestWhatsAppEvent nao baixa midia de mensagem repetida (webhook reenviado)', async () => {
  const calls = [];
  const db = {
    query: async (sql, params = []) => {
      calls.push({ sql, params });
      if (/INSERT INTO whatsapp_messages/.test(sql)) return { rows: [] }; // ON CONFLICT DO NOTHING
      if (/RETURNING id/.test(sql)) return { rows: [{ id: 1 }] };
      return { rows: [] };
    }
  };
  let downloads = 0;
  const event = baseEvent({ mediaType: 'image', media: { mimeType: 'image/jpeg', download: async () => { downloads++; return Buffer.from('x'); } } });

  await ingestWhatsAppEvent(5, event, { db, broadcast: () => {} });

  assert.equal(downloads, 0);
  assert.ok(!calls.some((c) => /INSERT INTO whatsapp_media/.test(c.sql)));
});

test('ingestWhatsAppEvent continua gravando a mensagem mesmo se o download da midia falhar', async () => {
  const { db, calls } = makeFakeDb();
  const event = baseEvent({ mediaType: 'audio', media: { mimeType: 'audio/ogg', download: async () => { throw new Error('expirou'); } } });

  const contactId = await ingestWhatsAppEvent(5, event, { db, broadcast: () => {} });

  assert.equal(contactId, 1);
  assert.ok(calls.some((c) => /INSERT INTO whatsapp_messages/.test(c.sql)));
  assert.ok(!calls.some((c) => /INSERT INTO whatsapp_media/.test(c.sql)));
});

test('ingestWhatsAppEvent nao guarda midia acima do limite de tamanho', async () => {
  const { db, calls } = makeFakeDb();
  const big = Buffer.alloc(16 * 1024 * 1024);
  const event = baseEvent({ mediaType: 'video', media: { mimeType: 'video/mp4', download: async () => big } });

  await ingestWhatsAppEvent(5, event, { db, broadcast: () => {} });

  assert.ok(!calls.some((c) => /INSERT INTO whatsapp_media/.test(c.sql)));
});

test('ingestWhatsAppEvent marca source como ad quando tem ctwa_clid', async () => {
  const { db, calls } = makeFakeDb();

  await ingestWhatsAppEvent(5, baseEvent({ ctwaClid: 'CLID_123', adId: 'AD_1' }), { db });

  const contactCall = calls.find((c) => /INSERT INTO whatsapp_contacts/.test(c.sql));
  assert.equal(contactCall.params[7], 'ad'); // source
});

test('ingestWhatsAppEvent guarda URL do anuncio, referral cru e metodo de rastreamento (primeiro toque)', async () => {
  const { db, calls } = makeFakeDb();
  const referral = { source_type: 'ad', source_id: 'AD_1', source_url: 'https://fb.me/x', ctwa_clid: 'CLID_1' };

  await ingestWhatsAppEvent(5, baseEvent({ ctwaClid: 'CLID_1', adId: 'AD_1', adSourceUrl: 'https://fb.me/x', referral }), { db, broadcast: () => {} });

  const contactCall = calls.find((c) => /INSERT INTO whatsapp_contacts/.test(c.sql));
  assert.equal(contactCall.params[9], 'https://fb.me/x');
  assert.deepEqual(JSON.parse(contactCall.params[10]), referral);
  assert.equal(contactCall.params[11], 'ctwa');
  assert.match(contactCall.sql, /ad_referral_json = COALESCE\(whatsapp_contacts\.ad_referral_json/);
});

test('ingestWhatsAppEvent sem anuncio nao grava referral nem metodo de rastreamento', async () => {
  const { db, calls } = makeFakeDb();

  await ingestWhatsAppEvent(5, baseEvent(), { db, broadcast: () => {} });

  const contactCall = calls.find((c) => /INSERT INTO whatsapp_contacts/.test(c.sql));
  assert.equal(contactCall.params[10], null);
  assert.equal(contactCall.params[11], null);
});

test('resposta enviada pelo proprio celular (outbound via Baileys) marca a conversa como lida', async () => {
  const { db, calls } = makeFakeDb();
  await ingestWhatsAppEvent(5, baseEvent({ direction: 'outbound' }), { db, broadcast: () => {} });
  assert.ok(calls.some((c) => /SET last_read_at = CURRENT_TIMESTAMP/.test(c.sql)));
});

test('mensagem recebida (inbound) nao marca a conversa como lida', async () => {
  const { db, calls } = makeFakeDb();
  await ingestWhatsAppEvent(5, baseEvent(), { db, broadcast: () => {} });
  assert.ok(!calls.some((c) => /last_read_at/.test(c.sql)));
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

test('ingestWhatsAppEvent marca como anuncio quando so tem o id do anuncio (Baileys sem ctwa_clid)', async () => {
  const { db, calls } = makeFakeDb();
  await ingestWhatsAppEvent(5, baseEvent({ adId: 'AD_9' }), { db, broadcast: () => {} });
  const contactCall = calls.find((c) => /INSERT INTO whatsapp_contacts/.test(c.sql));
  assert.equal(contactCall.params[7], 'ad');
  assert.equal(contactCall.params[11], 'ctwa');
});
