import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generate, GeminiError } from './geminiClient.js';

const okBody = (parts, usage = { promptTokenCount: 120, candidatesTokenCount: 15 }) => ({
  candidates: [{ content: { role: 'model', parts }, finishReason: 'STOP' }],
  usageMetadata: usage
});

function fakeFetch(body, { status = 200 } = {}) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
  };
  fn.calls = calls;
  return fn;
}

const BASE = { system: 'Você é a atendente.', contents: [{ role: 'user', parts: [{ text: 'Oi' }] }] };
const DEPS = { apiKey: 'chave-secreta-123', model: 'gemini-teste' };

test('manda a requisição no formato da API REST', async () => {
  const fetch = fakeFetch(okBody([{ text: 'Oi!' }]));
  const tools = [{ name: 'check_availability', description: 'd', parameters: { type: 'OBJECT', properties: {} } }];
  await generate({ ...BASE, tools, maxOutputTokens: 300 }, { ...DEPS, fetch });
  const [call] = fetch.calls;
  assert.equal(call.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-teste:generateContent');
  assert.equal(call.init.method, 'POST');
  assert.equal(call.init.headers['x-goog-api-key'], 'chave-secreta-123');
  assert.deepEqual(call.body.systemInstruction, { parts: [{ text: 'Você é a atendente.' }] });
  assert.deepEqual(call.body.contents, BASE.contents);
  assert.deepEqual(call.body.tools, [{ functionDeclarations: tools }]);
  assert.equal(call.body.generationConfig.maxOutputTokens, 300);
});

test('sem ferramentas não manda o campo tools', async () => {
  const fetch = fakeFetch(okBody([{ text: 'Oi!' }]));
  await generate(BASE, { ...DEPS, fetch });
  assert.equal('tools' in fetch.calls[0].body, false);
});

test('devolve o texto e o uso de tokens', async () => {
  const fetch = fakeFetch(okBody([{ text: 'Oi, ' }, { text: 'tudo bem?' }]));
  const r = await generate(BASE, { ...DEPS, fetch });
  assert.equal(r.text, 'Oi, tudo bem?');
  assert.deepEqual(r.usage, { in: 120, out: 15 });
  assert.deepEqual(r.functionCalls, []);
});

test('devolve as chamadas de ferramenta', async () => {
  const fetch = fakeFetch(okBody([{ functionCall: { name: 'check_availability', args: { date: '2026-11-20', party_size: 4 } } }]));
  const r = await generate(BASE, { ...DEPS, fetch });
  assert.deepEqual(r.functionCalls, [{ name: 'check_availability', args: { date: '2026-11-20', party_size: 4 } }]);
  assert.equal(r.text, '');
});

test('resposta vazia ou bloqueada vira GeminiError', async () => {
  for (const body of [
    {},
    { candidates: [] },
    { candidates: [{ finishReason: 'SAFETY' }] },
    okBody([]),
    okBody([{ text: '   ' }])
  ]) {
    await assert.rejects(generate(BASE, { ...DEPS, fetch: fakeFetch(body) }), GeminiError);
  }
});

test('erro HTTP vira GeminiError sem vazar a chave', async () => {
  const fetch = fakeFetch({ error: { message: 'quota' } }, { status: 429 });
  await assert.rejects(generate(BASE, { ...DEPS, fetch }), (e) => {
    assert.ok(e instanceof GeminiError);
    assert.match(e.message, /429/);
    assert.doesNotMatch(e.message, /chave-secreta-123/);
    return true;
  });
});

test('sem chave não chama a API', async () => {
  const fetch = fakeFetch(okBody([{ text: 'x' }]));
  await assert.rejects(generate(BASE, { fetch, model: 'm', apiKey: '' }), GeminiError);
  assert.equal(fetch.calls.length, 0);
});

test('estouro do tempo limite vira GeminiError', async () => {
  const fetch = (url, init) => new Promise((resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  });
  await assert.rejects(generate(BASE, { ...DEPS, fetch, timeoutMs: 20 }), /tempo/i);
});
