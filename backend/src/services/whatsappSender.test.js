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
  assert.deepEqual(insert.params, [7, 3, 'Oi', 'wamid.X', 'staff']);
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

test('robô grava a linha antes de enviar, com o mesmo id', async () => {
  const db = fakeDb();
  const order = [];
  const origQuery = db.query;
  db.query = async (sql, params) => {
    if (/INSERT INTO whatsapp_messages/.test(sql)) order.push({ step: 'insert', id: params[3], sentBy: params[4], sql });
    return origQuery(sql, params);
  };
  let sentId;
  const id = await sendToContact({ clientId: 7, contactId: 3, body: 'Oi', sentBy: 'bot_reserva' }, {
    db,
    sendViaBaileys: async (_c, _w, _b, opts) => { order.push({ step: 'send' }); sentId = opts.messageId; return opts.messageId; },
    broadcast: () => {}
  });
  assert.deepEqual(order.map((o) => o.step), ['insert', 'send']);
  assert.match(order[0].id, /^3EB0[0-9A-F]{18}$/);
  assert.equal(sentId, order[0].id);
  assert.equal(id, order[0].id);
  assert.equal(order[0].sentBy, 'bot_reserva');
  assert.match(order[0].sql, /'pending'/);
  assert.ok(db.calls.some((c) => /SET status = 'sent'/.test(c.sql) && c.params[0] === id));
});

test('falha no envio do robô marca failed e relança', async () => {
  const db = fakeDb();
  await assert.rejects(sendToContact({ clientId: 7, contactId: 3, body: 'Oi', sentBy: 'bot_reserva' }, {
    db,
    sendViaBaileys: async () => { throw new Error('caiu'); },
    broadcast: () => {}
  }), /caiu/);
  assert.ok(db.calls.some((c) => /SET status = 'failed'/.test(c.sql)));
});
