import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendToContact, SendError } from './whatsappSender.js';

function fakeDb({ contact = { wa_id: '5511999998888' }, settings = { connection_type: 'baileys' } } = {}) {
  const calls = [];
  return {
    calls,
    query: async (sql, params = []) => {
      calls.push({ sql, params });
      if (/FROM whatsapp_contacts/.test(sql)) return { rows: contact ? [contact] : [] };
      if (/FROM whatsapp_settings/.test(sql)) return { rows: settings ? [settings] : [] };
      return { rows: [] };
    }
  };
}

test('sendToContact manda pelo Baileys, grava a mensagem e avisa a tela', async () => {
  const db = fakeDb();
  const sent = [];
  const events = [];
  const id = await sendToContact({ clientId: 7, contactId: 3, body: 'Oi' }, {
    db,
    sendViaBaileys: async (clientId, waId, body) => { sent.push({ clientId, waId, body }); return 'wamid.X'; },
    broadcast: (clientId, name, data) => events.push({ clientId, name, data })
  });
  assert.equal(id, 'wamid.X');
  assert.deepEqual(sent, [{ clientId: 7, waId: '5511999998888', body: 'Oi' }]);
  const insert = db.calls.find((c) => /INSERT INTO whatsapp_messages/.test(c.sql));
  assert.deepEqual(insert.params, [7, 3, 'Oi', 'wamid.X']);
  assert.equal(events[0].name, 'message');
  assert.equal(events[0].data.direction, 'outbound');
});

test('sendToContact usa a Cloud API quando o cliente não é Baileys', async () => {
  const db = fakeDb({ settings: { connection_type: 'cloud_api', phone_number_id: 'P', access_token: 'T' } });
  let cloudArgs;
  await sendToContact({ clientId: 7, contactId: 3, body: 'Oi' }, {
    db,
    sendWhatsAppMessage: async (args) => { cloudArgs = args; return { messages: [{ id: 'wamid.C' }] }; },
    broadcast: () => {}
  });
  assert.deepEqual(cloudArgs, { phoneNumberId: 'P', accessToken: 'T', to: '5511999998888', body: 'Oi' });
});

test('sendToContact recusa contato inexistente com 404', async () => {
  const db = fakeDb({ contact: null });
  await assert.rejects(
    sendToContact({ clientId: 7, contactId: 99, body: 'Oi' }, { db, broadcast: () => {} }),
    (err) => err instanceof SendError && err.httpStatus === 404
  );
});

test('sendToContact recusa cliente sem WhatsApp configurado com 400', async () => {
  const db = fakeDb({ settings: null });
  await assert.rejects(
    sendToContact({ clientId: 7, contactId: 3, body: 'Oi' }, { db, broadcast: () => {} }),
    (err) => err instanceof SendError && err.httpStatus === 400
  );
});
