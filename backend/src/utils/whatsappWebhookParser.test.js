import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWhatsAppWebhook } from './whatsappWebhookParser.js';

const payloadComAnuncio = {
  object: 'whatsapp_business_account',
  entry: [{
    id: 'WABA_ID',
    changes: [{
      field: 'messages',
      value: {
        messaging_product: 'whatsapp',
        metadata: { display_phone_number: '15551234567', phone_number_id: 'PHONE_123' },
        contacts: [{ profile: { name: 'Maria Silva' }, wa_id: '5511999998888' }],
        messages: [{
          from: '5511999998888',
          id: 'wamid.ABC123',
          timestamp: '1735000000',
          type: 'text',
          text: { body: 'Olá, vim pelo anúncio!' },
          referral: {
            source_type: 'ad',
            source_id: '120211234567890',
            headline: 'Promoção de hoje',
            body: 'Peça já pelo WhatsApp',
            ctwa_clid: 'AfelCsWK_fake_clid'
          }
        }]
      }
    }]
  }]
};

const payloadSemAnuncio = {
  object: 'whatsapp_business_account',
  entry: [{
    id: 'WABA_ID',
    changes: [{
      field: 'messages',
      value: {
        messaging_product: 'whatsapp',
        metadata: { display_phone_number: '15551234567', phone_number_id: 'PHONE_123' },
        contacts: [{ profile: { name: 'João Souza' }, wa_id: '5511988887777' }],
        messages: [{
          from: '5511988887777',
          id: 'wamid.DEF456',
          timestamp: '1735000100',
          type: 'text',
          text: { body: 'Vocês têm mesa pra hoje?' }
        }]
      }
    }]
  }]
};

const payloadDeStatus = {
  object: 'whatsapp_business_account',
  entry: [{
    id: 'WABA_ID',
    changes: [{
      field: 'messages',
      value: {
        messaging_product: 'whatsapp',
        metadata: { display_phone_number: '15551234567', phone_number_id: 'PHONE_123' },
        statuses: [{ id: 'wamid.ABC123', status: 'delivered' }]
      }
    }]
  }]
};

test('extrai ctwa_clid e dados do anuncio quando a mensagem vem de um Click-to-WhatsApp Ad', () => {
  const events = parseWhatsAppWebhook(payloadComAnuncio);
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], {
    phoneNumberId: 'PHONE_123',
    waId: '5511999998888',
    profileName: 'Maria Silva',
    waMessageId: 'wamid.ABC123',
    direction: 'inbound',
    body: 'Olá, vim pelo anúncio!',
    sentAt: new Date(1735000000 * 1000).toISOString(),
    ctwaClid: 'AfelCsWK_fake_clid',
    adId: '120211234567890',
    adHeadline: 'Promoção de hoje',
    adBody: 'Peça já pelo WhatsApp'
  });
});

test('mensagem organica (sem anuncio) tem campos de referral nulos', () => {
  const events = parseWhatsAppWebhook(payloadSemAnuncio);
  assert.equal(events.length, 1);
  assert.equal(events[0].ctwaClid, null);
  assert.equal(events[0].adId, null);
  assert.equal(events[0].profileName, 'João Souza');
});

test('payload de status (sem campo messages) retorna lista vazia', () => {
  const events = parseWhatsAppWebhook(payloadDeStatus);
  assert.deepEqual(events, []);
});

test('payload vazio ou malformado retorna lista vazia sem lancar erro', () => {
  assert.deepEqual(parseWhatsAppWebhook({}), []);
  assert.deepEqual(parseWhatsAppWebhook({ entry: [] }), []);
});
