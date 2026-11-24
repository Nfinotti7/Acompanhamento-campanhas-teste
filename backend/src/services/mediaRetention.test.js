import { test } from 'node:test';
import assert from 'node:assert/strict';
import { purgeOldMedia } from './mediaRetention.js';

function fakeDb(batches) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      const n = batches.shift() ?? 0;
      return { rows: Array.from({ length: n }, (_, i) => ({ id: i + 1 })) };
    },
  };
}

test('apaga mídia mais velha que o prazo, poupando foto de perfil', async () => {
  const db = fakeDb([3]);
  const total = await purgeOldMedia(db, 24);
  assert.equal(total, 3);
  assert.equal(db.calls.length, 1);
  assert.match(db.calls[0].sql, /DELETE FROM whatsapp_media/);
  assert.match(db.calls[0].sql, /profile_pic_media_id/);
  assert.deepEqual(db.calls[0].params, [24]);
});

test('repete em lotes até acabar', async () => {
  const db = fakeDb([200, 200, 15]);
  const total = await purgeOldMedia(db, 24);
  assert.equal(total, 415);
  assert.equal(db.calls.length, 3);
});
