import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendToContact, sendMediaToContact, attachmentType, SendError } from './whatsappSender.js';

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

function mediaDb(settings) {
  const db = fakeDb({ settings });
  const query = db.query;
  db.query = async (sql, params) => {
    if (/INSERT INTO whatsapp_media/.test(sql)) { db.calls.push({ sql, params }); return { rows: [{ id: 55 }] }; }
    return query(sql, params);
  };
  return db;
}

test('attachmentType: JPEG/PNG são foto, MP4 é vídeo, o resto vai como documento', () => {
  assert.equal(attachmentType('image/jpeg'), 'image');
  assert.equal(attachmentType('image/png'), 'image');
  assert.equal(attachmentType('video/mp4'), 'video');
  assert.equal(attachmentType('audio/ogg; codecs=opus'), 'audio');
  assert.equal(attachmentType('application/pdf'), 'document');
  assert.equal(attachmentType('image/webp'), 'document');
  assert.equal(attachmentType('image/heic'), 'document');
});

test('sendMediaToContact grava o arquivo e a mensagem antes de mandar pelo Baileys', async () => {
  const db = mediaDb({ connection_type: 'baileys' });
  const sent = [];
  const events = [];
  await sendMediaToContact({ clientId: 7, contactId: 3, data: Buffer.from('img'), mimeType: 'image/png', filename: 'cardapio.png', caption: ' Nosso cardápio ' }, {
    db,
    sendViaBaileys: async (clientId, waId, body, opts) => { sent.push({ clientId, waId, body, opts }); return opts.messageId; },
    broadcast: (clientId, name, data) => events.push(data)
  });
  const media = db.calls.find((c) => /INSERT INTO whatsapp_media/.test(c.sql));
  assert.deepEqual(media.params.slice(0, 3), [7, 3, 'image/png']);
  const insert = db.calls.find((c) => /INSERT INTO whatsapp_messages/.test(c.sql));
  assert.equal(insert.params[2], 'Nosso cardápio');
  assert.deepEqual(insert.params.slice(5), [55, 'image', 'cardapio.png']);
  assert.equal(sent[0].body, 'Nosso cardápio');
  assert.equal(sent[0].opts.messageId, insert.params[3]);
  assert.deepEqual(sent[0].opts.media, { mediaId: 55, mediaType: 'image', mimeType: 'image/png', filename: 'cardapio.png' });
  assert.ok(db.calls.some((c) => /SET status = 'sent'/.test(c.sql)));
  assert.equal(events[0].body, 'Nosso cardápio');
});

test('sendMediaToContact sem legenda grava o rótulo do tipo', async () => {
  const db = mediaDb({ connection_type: 'baileys' });
  await sendMediaToContact({ clientId: 7, contactId: 3, data: Buffer.from('pdf'), mimeType: 'application/pdf', filename: 'menu.pdf' }, {
    db, sendViaBaileys: async () => 'x', broadcast: () => {}
  });
  const insert = db.calls.find((c) => /INSERT INTO whatsapp_messages/.test(c.sql));
  assert.equal(insert.params[2], '📎 menu.pdf');
});

test('sendMediaToContact marca falha quando o Baileys não envia', async () => {
  const db = mediaDb({ connection_type: 'baileys' });
  await assert.rejects(sendMediaToContact({ clientId: 7, contactId: 3, data: Buffer.from('img'), mimeType: 'image/jpeg' }, {
    db, sendViaBaileys: async () => { throw new Error('caiu'); }, broadcast: () => {}
  }), /caiu/);
  assert.ok(db.calls.some((c) => /SET status = 'failed'/.test(c.sql)));
});

test('sendMediaToContact pela Cloud API sobe o arquivo e manda com o id', async () => {
  const db = mediaDb({ connection_type: 'cloud_api', phone_number_id: 'P', access_token: 'T' });
  let sendArgs;
  await sendMediaToContact({ clientId: 7, contactId: 3, data: Buffer.from('pdf'), mimeType: 'application/pdf', filename: 'menu.pdf', caption: 'Menu' }, {
    db,
    uploadCloudMedia: async ({ mimeType }) => { assert.equal(mimeType, 'application/pdf'); return 'MEDIA1'; },
    sendWhatsAppMedia: async (args) => { sendArgs = args; return { messages: [{ id: 'wamid.M' }] }; },
    broadcast: () => {}
  });
  assert.deepEqual(sendArgs, { phoneNumberId: 'P', accessToken: 'T', to: '5511999998888', mediaType: 'document', mediaId: 'MEDIA1', caption: 'Menu', filename: 'menu.pdf' });
  const insert = db.calls.find((c) => /INSERT INTO whatsapp_messages/.test(c.sql));
  assert.equal(insert.params[3], 'wamid.M');
});

test('sendMediaToContact manda a legenda do áudio como texto separado', async () => {
  const db = mediaDb({ connection_type: 'baileys' });
  const sent = [];
  await sendMediaToContact({ clientId: 7, contactId: 3, data: Buffer.from('a'), mimeType: 'audio/mpeg', filename: 'a.mp3', caption: 'Escuta' }, {
    db, sendViaBaileys: async (c, w, body, opts) => { sent.push({ body, media: !!opts?.media }); return 'id'; }, broadcast: () => {}
  });
  assert.deepEqual(sent, [{ body: '', media: true }, { body: 'Escuta', media: false }]);
});

test('sendMediaToContact recusa arquivo vazio ou grande demais', async () => {
  const db = mediaDb({ connection_type: 'baileys' });
  await assert.rejects(sendMediaToContact({ clientId: 7, contactId: 3, data: Buffer.alloc(0) }, { db, broadcast: () => {} }),
    (err) => err instanceof SendError && err.httpStatus === 400);
  await assert.rejects(sendMediaToContact({ clientId: 7, contactId: 3, data: Buffer.alloc(15 * 1024 * 1024 + 1) }, { db, broadcast: () => {} }),
    (err) => err instanceof SendError && err.httpStatus === 413);
});
