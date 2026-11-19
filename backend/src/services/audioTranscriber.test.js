import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  transcribeMessage,
  ensureTranscripts,
  MAX_AUDIO_BYTES,
  TranscribeError
} from './audioTranscriber.js';

// Banco falso: uma mensagem de áudio com a mídia ligada.
function fakeDb(overrides = {}) {
  const row = {
    id: 7, client_id: 9, contact_id: 3, media_type: 'audio', transcript: null,
    mime_type: 'audio/ogg; codecs=opus', size_bytes: 1000, data: Buffer.from('abc'),
    ...overrides
  };
  const db = {
    row,
    query: async (sql, params) => {
      if (/^\s*SELECT/i.test(sql) && /FROM whatsapp_messages/.test(sql)) return { rows: db.row ? [db.row] : [] };
      if (/^\s*UPDATE whatsapp_messages SET transcript/i.test(sql)) { db.row.transcript = params[0]; return { rows: [] }; }
      return { rows: [] };
    }
  };
  return db;
}

test('transcreve o áudio, manda o arquivo ao Gemini e grava o texto', async () => {
  const db = fakeDb();
  let sent;
  const generate = async (args) => { sent = args; return { text: ' Quero reservar pra sexta. ', functionCalls: [], parts: [], usage: {} }; };
  const out = await transcribeMessage(db, { messageId: 7, clientId: 9 }, { generate });
  assert.equal(out.transcript, 'Quero reservar pra sexta.');
  const part = sent.contents[0].parts.find((p) => p.inlineData);
  assert.equal(part.inlineData.mimeType, 'audio/ogg'); // sem o ";codecs=opus"
  assert.equal(part.inlineData.data, Buffer.from('abc').toString('base64'));
  assert.equal(db.row.transcript, 'Quero reservar pra sexta.');
});

test('segunda chamada devolve o texto gravado sem chamar o Gemini de novo', async () => {
  const db = fakeDb({ transcript: 'já transcrito' });
  let calls = 0;
  const generate = async () => { calls += 1; return { text: 'x', functionCalls: [], parts: [] }; };
  const out = await transcribeMessage(db, { messageId: 7, clientId: 9 }, { generate });
  assert.equal(out.transcript, 'já transcrito');
  assert.equal(calls, 0);
});

test('mensagem de outro cliente ou inexistente dá not_found', async () => {
  const db = fakeDb();
  db.row = null; // nada volta do banco
  const generate = async () => { throw new Error('não devia chamar'); };
  await assert.rejects(
    transcribeMessage(db, { messageId: 7, clientId: 1 }, { generate }),
    (e) => e instanceof TranscribeError && e.code === 'not_found'
  );
});

test('só áudio é transcrito', async () => {
  const db = fakeDb({ media_type: 'image' });
  await assert.rejects(
    transcribeMessage(db, { messageId: 7, clientId: 9 }, { generate: async () => ({}) }),
    (e) => e.code === 'not_audio'
  );
});

test('áudio acima do limite não vai ao Gemini', async () => {
  const db = fakeDb({ size_bytes: MAX_AUDIO_BYTES + 1 });
  let calls = 0;
  await assert.rejects(
    transcribeMessage(db, { messageId: 7, clientId: 9 }, { generate: async () => { calls += 1; return {}; } }),
    (e) => e.code === 'too_large'
  );
  assert.equal(calls, 0);
});

test('falha do Gemini vira erro failed e não grava nada', async () => {
  const db = fakeDb();
  const generate = async () => { throw new Error('Gemini: erro HTTP 429.'); };
  await assert.rejects(
    transcribeMessage(db, { messageId: 7, clientId: 9 }, { generate }),
    (e) => e.code === 'failed'
  );
  assert.equal(db.row.transcript, null);
});

test('texto vazio do Gemini vira erro failed (áudio sem fala)', async () => {
  const db = fakeDb();
  const generate = async () => ({ text: '   ', functionCalls: [], parts: [] });
  await assert.rejects(
    transcribeMessage(db, { messageId: 7, clientId: 9 }, { generate }),
    (e) => e.code === 'failed'
  );
});

test('ensureTranscripts transcreve só os áudios sem texto e segue se um falhar', async () => {
  const pendingRows = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const db = { query: async () => ({ rows: pendingRows }) };
  const done = [];
  const transcribe = async (_db, { messageId }) => {
    if (messageId === 2) throw new TranscribeError('failed', 'x');
    done.push(messageId);
    return { transcript: 't' };
  };
  const n = await ensureTranscripts(db, { contactId: 3, clientId: 9 }, { transcribe });
  assert.deepEqual(done, [1, 3]);
  assert.equal(n, 2);
});
