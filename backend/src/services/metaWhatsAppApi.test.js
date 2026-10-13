import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendWhatsAppMessage, downloadCloudMedia } from './metaWhatsAppApi.js';

test('downloadCloudMedia busca a URL da midia e baixa o arquivo com o token', async () => {
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/MEDIA_1')) {
      return { ok: true, json: async () => ({ url: 'https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=1' }) };
    }
    return { ok: true, arrayBuffer: async () => new TextEncoder().encode('bytes').buffer };
  };

  const buffer = await downloadCloudMedia({ mediaId: 'MEDIA_1', accessToken: 'TOKEN', fetchImpl: fakeFetch });

  assert.equal(buffer.toString(), 'bytes');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer TOKEN');
  assert.equal(calls[1].options.headers.Authorization, 'Bearer TOKEN');
});

test('downloadCloudMedia lanca erro se a Meta recusar', async () => {
  const fakeFetch = async () => ({ ok: false, status: 401, text: async () => 'invalid token' });
  await assert.rejects(() => downloadCloudMedia({ mediaId: 'X', accessToken: 'T', fetchImpl: fakeFetch }), /401/);
});

test('sendWhatsAppMessage monta a chamada correta e retorna o JSON da resposta', async () => {
  let capturedUrl;
  let capturedOptions;

  const fakeFetch = async (url, options) => {
    capturedUrl = url;
    capturedOptions = options;
    return {
      ok: true,
      json: async () => ({ messages: [{ id: 'wamid.FAKE123' }] })
    };
  };

  const result = await sendWhatsAppMessage({
    phoneNumberId: '123456',
    accessToken: 'token-abc',
    to: '5511999998888',
    body: 'Olá!',
    fetchImpl: fakeFetch
  });

  assert.equal(capturedUrl, 'https://graph.facebook.com/v20.0/123456/messages');
  assert.equal(capturedOptions.method, 'POST');
  assert.equal(capturedOptions.headers['Authorization'], 'Bearer token-abc');
  assert.equal(capturedOptions.headers['Content-Type'], 'application/json');

  const sentBody = JSON.parse(capturedOptions.body);
  assert.equal(sentBody.messaging_product, 'whatsapp');
  assert.equal(sentBody.to, '5511999998888');
  assert.equal(sentBody.type, 'text');
  assert.equal(sentBody.text.body, 'Olá!');

  assert.deepEqual(result, { messages: [{ id: 'wamid.FAKE123' }] });
});

test('sendWhatsAppMessage lança erro quando a resposta não é ok', async () => {
  const fakeFetch = async () => ({
    ok: false,
    status: 401,
    text: async () => '{"error":"invalid token"}'
  });

  await assert.rejects(
    () => sendWhatsAppMessage({
      phoneNumberId: '123456',
      accessToken: 'bad-token',
      to: '5511999998888',
      body: 'oi',
      fetchImpl: fakeFetch
    }),
    /Falha ao enviar mensagem no WhatsApp \(status 401\)/
  );
});
