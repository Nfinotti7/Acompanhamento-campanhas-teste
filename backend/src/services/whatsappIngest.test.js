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

test('mensagem nova poe contato sem etapa no funil, sem mexer em quem ja tem etapa', async () => {
  const { db, calls } = makeFakeDb();

  await ingestWhatsAppEvent(5, baseEvent(), { db, broadcast: () => {} });

  const stageCall = calls.find((c) => /UPDATE whatsapp_contacts SET stage_id/.test(c.sql));
  assert.ok(stageCall);
  assert.match(stageCall.sql, /stage_id IS NULL/);
  const contactCall = calls.find((c) => /INSERT INTO whatsapp_contacts/.test(c.sql));
  assert.doesNotMatch(contactCall.sql, /stage/);
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

test('mensagem com codigo do Link Rastreavel liga o clique e define a origem (primeiro toque)', async () => {
  const calls = [];
  const db = {
    query: async (sql, params = []) => {
      calls.push({ sql, params });
      if (/UPDATE tracking_clicks/.test(sql)) return { rows: [{ id: 33, utm_source: 'google', fbclid: null, gclid: 'G1' }] };
      if (/RETURNING id/.test(sql)) return { rows: [{ id: 1 }] };
      return { rows: [] };
    }
  };
  await ingestWhatsAppEvent(5, baseEvent({ body: 'Olá! Quero reservar (cód. A7K2M)' }), { db, broadcast: () => {} });

  const clickCall = calls.find((c) => /UPDATE tracking_clicks/.test(c.sql));
  assert.deepEqual(clickCall.params, [1, 5, 'A7K2M']);
  const sourceCall = calls.find((c) => /tracking_method = 'link'/.test(c.sql));
  assert.deepEqual(sourceCall.params, ['google_ads', 33, 1]);
  assert.match(sourceCall.sql, /tracking_method IS NULL/);
  // origem resolvida antes de entrar no funil (o evento Lead já sai com ela)
  assert.ok(calls.indexOf(sourceCall) < calls.findIndex((c) => /SET stage_id/.test(c.sql)));
});

test('mensagem sem codigo nao consulta cliques', async () => {
  const { db, calls } = makeFakeDb();
  await ingestWhatsAppEvent(5, baseEvent(), { db, broadcast: () => {} });
  assert.ok(!calls.some((c) => /tracking_clicks/.test(c.sql)));
});

function flagsDb(flags) {
  const calls = [];
  let nextId = 1;
  return {
    calls,
    query: async (sql, params = []) => {
      calls.push({ sql, params });
      if (/FROM clients WHERE id/.test(sql)) return { rows: [flags] };
      if (/RETURNING id/.test(sql)) return { rows: [{ id: nextId++ }] };
      return { rows: [] };
    }
  };
}

const tick = () => new Promise((r) => setImmediate(r));

test('ingestWhatsAppEvent aciona o robô da fila só pra cliente com Na Mesa e mensagem nova', async () => {
  const db = flagsDb({ dashboard_enabled: false, waitlist_enabled: true });
  const seen = [];
  await ingestWhatsAppEvent(5, baseEvent({ body: 'FILA' }), { db, broadcast: () => {}, onInbound: async (args) => seen.push(args) });
  await tick();
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0], { clientId: 5, contactId: 1, waId: '5511999998888', profileName: 'Maria Teste', body: 'FILA' });
  // sem CRM: não entra no funil
  assert.ok(!db.calls.some((c) => /UPDATE whatsapp_contacts SET stage_id/.test(c.sql)));
});

test('ingestWhatsAppEvent não aciona o robô em mensagem repetida nem enviada por nós', async () => {
  const seen = [];
  const onInbound = async (args) => seen.push(args);
  const repeated = {
    query: async (sql) => {
      if (/FROM clients WHERE id/.test(sql)) return { rows: [{ dashboard_enabled: false, waitlist_enabled: true }] };
      if (/INSERT INTO whatsapp_messages/.test(sql)) return { rows: [] }; // ON CONFLICT DO NOTHING
      if (/RETURNING id/.test(sql)) return { rows: [{ id: 1 }] };
      return { rows: [] };
    }
  };
  await ingestWhatsAppEvent(5, baseEvent({ body: 'FILA' }), { db: repeated, broadcast: () => {}, onInbound });
  await ingestWhatsAppEvent(5, baseEvent({ body: 'FILA', direction: 'outbound', waMessageId: 'w2' }), { db: flagsDb({ waitlist_enabled: true }), broadcast: () => {}, onInbound });
  await tick();
  assert.equal(seen.length, 0);
});

test('ingestWhatsAppEvent sem Na Mesa não aciona o robô e continua no CRM', async () => {
  const db = flagsDb({ dashboard_enabled: true, waitlist_enabled: false });
  const seen = [];
  await ingestWhatsAppEvent(5, baseEvent({ body: 'FILA' }), { db, broadcast: () => {}, onInbound: async (a) => seen.push(a) });
  await tick();
  assert.equal(seen.length, 0);
  assert.ok(db.calls.some((c) => /UPDATE whatsapp_contacts SET stage_id/.test(c.sql)));
});

test('mensagem de grupo não aciona o robô da fila', async () => {
  const db = flagsDb({ dashboard_enabled: false, waitlist_enabled: true });
  const seen = [];
  await ingestWhatsAppEvent(5, baseEvent({ waId: '120363025246125486', body: 'fila?' }), { db, broadcast: () => {}, onInbound: async (a) => seen.push(a) });
  await tick();
  assert.equal(seen.length, 0);
});

test('mensagem do celular (outbound nova) pausa o robô de reserva', async () => {
  const db = flagsDb({ dashboard_enabled: true, reservations_enabled: true });
  const paused = [];
  await ingestWhatsAppEvent(9, baseEvent({ direction: 'outbound', waMessageId: 'w9' }), { db, broadcast: () => {}, pauseBot: async (_db, a) => paused.push(a) });
  assert.deepEqual(paused, [{ clientId: 9, contactId: 1 }]);
});

test('eco do Baileys de mensagem do robô (já gravada) não pausa', async () => {
  const paused = [];
  const echo = {
    query: async (sql) => {
      if (/FROM clients WHERE id/.test(sql)) return { rows: [{ dashboard_enabled: true, reservations_enabled: true }] };
      if (/INSERT INTO whatsapp_messages/.test(sql)) return { rows: [] };
      if (/RETURNING id/.test(sql)) return { rows: [{ id: 1 }] };
      return { rows: [] };
    }
  };
  await ingestWhatsAppEvent(9, baseEvent({ direction: 'outbound' }), { db: echo, broadcast: () => {}, pauseBot: async (_db, a) => paused.push(a) });
  assert.equal(paused.length, 0);
});

test('sem reservas ligadas, mensagem de saída não pausa nada', async () => {
  const db = flagsDb({ dashboard_enabled: true, reservations_enabled: false });
  const paused = [];
  await ingestWhatsAppEvent(9, baseEvent({ direction: 'outbound', waMessageId: 'w10' }), { db, broadcast: () => {}, pauseBot: async (_db, a) => paused.push(a) });
  assert.equal(paused.length, 0);
});

test('ingest aciona o robô de reserva com origem de anúncio, contato novo e nome do restaurante', async () => {
  const calls = [];
  let nextId = 1;
  const db = {
    query: async (sql) => {
      if (/FROM clients WHERE id/.test(sql)) return { rows: [{ dashboard_enabled: true, reservations_enabled: true, name: 'Malibu' }] };
      if (/INSERT INTO whatsapp_contacts/.test(sql)) return { rows: [{ id: 7, inserted: true }] };
      if (/RETURNING id/.test(sql)) return { rows: [{ id: nextId++ }] };
      calls.push(sql);
      return { rows: [] };
    }
  };
  const seen = [];
  await ingestWhatsAppEvent(9, baseEvent({ body: 'Quero fazer uma reserva (cód. RESERVA)', adId: 'ad1' }), { db, broadcast: () => {}, onReservation: async (a) => seen.push(a) });
  await tick();
  assert.deepEqual(seen, [{ clientId: 9, contactId: 7, waId: '5511999998888', profileName: 'Maria Teste', body: 'Quero fazer uma reserva (cód. RESERVA)', fromAd: true, isNewContact: true, restaurantName: 'Malibu' }]);
});

test('ingest não aciona o robô de reserva sem a chave ligada nem em mensagem repetida', async () => {
  const seen = [];
  const onReservation = async (a) => seen.push(a);
  await ingestWhatsAppEvent(9, baseEvent({ body: 'RESERVA' }), { db: flagsDb({ dashboard_enabled: true, reservations_enabled: false }), broadcast: () => {}, onReservation });
  const repeated = {
    query: async (sql) => {
      if (/FROM clients WHERE id/.test(sql)) return { rows: [{ dashboard_enabled: true, reservations_enabled: true }] };
      if (/INSERT INTO whatsapp_messages/.test(sql)) return { rows: [] };
      if (/RETURNING id/.test(sql)) return { rows: [{ id: 1 }] };
      return { rows: [] };
    }
  };
  await ingestWhatsAppEvent(9, baseEvent({ body: 'RESERVA' }), { db: repeated, broadcast: () => {}, onReservation });
  await tick();
  assert.equal(seen.length, 0);
});

function autoReplyDb(lastInboundAt) {
  return {
    query: async (sql) => {
      if (/FROM clients WHERE id/.test(sql)) return { rows: [{ dashboard_enabled: true, reservations_enabled: true }] };
      if (/direction = 'inbound'\s+ORDER BY sent_at DESC/.test(sql)) return { rows: lastInboundAt ? [{ sent_at: lastInboundAt }] : [] };
      if (/RETURNING id/.test(sql)) return { rows: [{ id: 1 }] };
      return { rows: [] };
    }
  };
}

test('resposta automática do WhatsApp Business (segundos depois da mensagem do cliente) não pausa', async () => {
  const paused = [];
  await ingestWhatsAppEvent(9, baseEvent({ direction: 'outbound', waMessageId: 'auto1', sentAt: '2026-10-12T12:00:03.000Z' }),
    { db: autoReplyDb('2026-10-12T12:00:00.000Z'), broadcast: () => {}, pauseBot: async (_db, a) => paused.push(a) });
  assert.equal(paused.length, 0);
});

test('resposta do atendente depois de um tempo pausa', async () => {
  const paused = [];
  await ingestWhatsAppEvent(9, baseEvent({ direction: 'outbound', waMessageId: 'human1', sentAt: '2026-10-12T12:01:00.000Z' }),
    { db: autoReplyDb('2026-10-12T12:00:00.000Z'), broadcast: () => {}, pauseBot: async (_db, a) => paused.push(a) });
  assert.equal(paused.length, 1);
});

// Contato novo (inserted) num cliente com as chaves pedidas.
function makeAdsDb(flags) {
  const calls = [];
  const db = {
    query: async (sql, params = []) => {
      calls.push({ sql, params });
      if (/INSERT INTO whatsapp_contacts/.test(sql)) return { rows: [{ id: 7, inserted: true }] };
      if (/FROM clients WHERE id/.test(sql)) return { rows: [{ name: 'Malibu', dashboard_enabled: true, ...flags }] };
      if (/RETURNING id/.test(sql)) return { rows: [{ id: 1 }] };
      return { rows: [] };
    }
  };
  return { db, calls };
}
const presumeCall = (calls) => calls.find((c) => /^UPDATE whatsapp_contacts SET source = 'ad', tracking_method = 'ads_number'/.test(c.sql));

test('número só de anúncios: contato novo sem cartão vira Meta Ads presumido', async () => {
  const { db, calls } = makeAdsDb({ whatsapp_ads_only: true });
  await ingestWhatsAppEvent(9, baseEvent({ waId: '556291896553' }), { db, broadcast: () => {}, notifyInbound: () => {} });
  assert.ok(presumeCall(calls));
  assert.deepEqual(presumeCall(calls).params, [7]);
});

test('número só de anúncios: contato com cartão de anúncio não é presumido', async () => {
  const { db, calls } = makeAdsDb({ whatsapp_ads_only: true });
  await ingestWhatsAppEvent(9, baseEvent({ adId: 'AD_1', ctwaClid: 'clid' }), { db, broadcast: () => {}, notifyInbound: () => {} });
  assert.equal(presumeCall(calls), undefined);
});

test('sem a chave, contato novo sem cartão continua não rastreado', async () => {
  const { db, calls } = makeAdsDb({ whatsapp_ads_only: false });
  await ingestWhatsAppEvent(9, baseEvent(), { db, broadcast: () => {}, notifyInbound: () => {} });
  assert.equal(presumeCall(calls), undefined);
});

test('número só de anúncios: mensagem de saída e grupo não presumem', async () => {
  const out = makeAdsDb({ whatsapp_ads_only: true });
  await ingestWhatsAppEvent(9, baseEvent({ direction: 'outbound' }), { db: out.db, broadcast: () => {}, pauseBot: async () => {} });
  assert.equal(presumeCall(out.calls), undefined);
  const group = makeAdsDb({ whatsapp_ads_only: true });
  await ingestWhatsAppEvent(9, baseEvent({ waId: '120363000000000000' }), { db: group.db, broadcast: () => {} });
  assert.equal(presumeCall(group.calls), undefined);
});

test('cartão não reconhecido fica guardado no contato', async () => {
  const { db, calls } = makeAdsDb({});
  const card = { source_type: null, source_url: 'https://site.com', headline: 'Site' };
  await ingestWhatsAppEvent(9, baseEvent({ unmatchedAdReply: card }), { db, broadcast: () => {}, notifyInbound: () => {} });
  const insert = calls.find((c) => /INSERT INTO whatsapp_contacts/.test(c.sql));
  assert.deepEqual(JSON.parse(insert.params[12]), card);
});

test('respostas automáticas só rodam quando o robô de reserva não tratou a mensagem', async () => {
  for (const [reservationResult, expectInfo] of [['ignored', true], ['paused', false], ['asked_size', false]]) {
    const { db } = makeAdsDb({ reservations_enabled: true });
    const infoCalls = [];
    await ingestWhatsAppEvent(9, baseEvent({ body: 'Quero ver o cardápio' }), {
      db, broadcast: () => {}, notifyInbound: () => {},
      onReservation: async () => reservationResult,
      onInfo: async (args) => { infoCalls.push(args); return 'answered'; }
    });
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(infoCalls.length, expectInfo ? 1 : 0, reservationResult);
    if (expectInfo) assert.equal(infoCalls[0].body, 'Quero ver o cardápio');
  }
});

test('mensagem de ausência do WhatsApp Business não pausa o robô, mesmo minutos depois', async () => {
  const calls = [];
  let paused = 0;
  const db = {
    query: async (sql, params = []) => {
      calls.push({ sql, params });
      if (/INSERT INTO whatsapp_contacts/.test(sql)) return { rows: [{ id: 7, inserted: false }] };
      if (/FROM clients WHERE id/.test(sql)) return { rows: [{ name: 'Malibu', dashboard_enabled: true, reservations_enabled: true }] };
      if (/SELECT sent_at FROM whatsapp_messages/.test(sql)) return { rows: [{ sent_at: '2026-10-26T18:12:14.000Z' }] };
      if (/RETURNING id/.test(sql)) return { rows: [{ id: 1 }] };
      return { rows: [] };
    }
  };
  const away = 'Agradecemos sua mensagem. Não estamos disponíveis no momento, mas entraremos em contato assim que possível.';
  await ingestWhatsAppEvent(9, baseEvent({ direction: 'outbound', body: away, sentAt: '2026-10-26T18:14:00.000Z' }), {
    db, broadcast: () => {}, pauseBot: async () => { paused++; }
  });
  assert.equal(paused, 0);
  await ingestWhatsAppEvent(9, baseEvent({ direction: 'outbound', waMessageId: 'X2', body: 'Para realizar sua reserva, me informe o nome', sentAt: '2026-10-26T18:14:50.000Z' }), {
    db, broadcast: () => {}, pauseBot: async () => { paused++; }
  });
  assert.equal(paused, 1);
});
