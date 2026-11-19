import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeTranscribeHandler } from './whatsappTranscribeController.js';
import { TranscribeError } from '../services/audioTranscriber.js';

function fakeRes() {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}
const reqOf = (user, extra = {}) => ({ user, params: { messageId: '7' }, query: {}, body: {}, ...extra });

test('cliente/staff transcreve usando o próprio clientId, ignorando o da requisição', async () => {
  let seen;
  const handler = makeTranscribeHandler({ transcribe: async (_db, args) => { seen = args; return { transcript: 'oi' }; } });
  const res = fakeRes();
  await handler(reqOf({ role: 'staff', clientId: 9 }, { query: { clientId: '1' } }), res);
  assert.deepEqual(seen, { messageId: '7', clientId: 9 });
  assert.deepEqual(res.body, { transcript: 'oi' });
});

test('admin escolhe o cliente pela query', async () => {
  let seen;
  const handler = makeTranscribeHandler({ transcribe: async (_db, args) => { seen = args; return { transcript: 'oi' }; } });
  await handler(reqOf({ role: 'admin' }, { query: { clientId: '4' } }), fakeRes());
  assert.equal(seen.clientId, '4');
});

test('admin sem clientId recebe 400', async () => {
  const handler = makeTranscribeHandler({ transcribe: async () => ({}) });
  const res = fakeRes();
  await handler(reqOf({ role: 'admin' }), res);
  assert.equal(res.statusCode, 400);
});

test('erros do serviço viram o status certo e mensagem em português', async () => {
  const cases = [['not_found', 404], ['not_audio', 400], ['too_large', 413], ['failed', 502]];
  for (const [code, status] of cases) {
    const handler = makeTranscribeHandler({ transcribe: async () => { throw new TranscribeError(code, 'msg interna'); } });
    const res = fakeRes();
    await handler(reqOf({ role: 'staff', clientId: 9 }), res);
    assert.equal(res.statusCode, status, code);
    assert.ok(res.body.error && res.body.error !== 'msg interna', code);
  }
});

test('erro inesperado vira 500', async () => {
  const handler = makeTranscribeHandler({ transcribe: async () => { throw new Error('boom'); } });
  const res = fakeRes();
  const orig = console.error; console.error = () => {};
  try { await handler(reqOf({ role: 'staff', clientId: 9 }), res); } finally { console.error = orig; }
  assert.equal(res.statusCode, 500);
});
