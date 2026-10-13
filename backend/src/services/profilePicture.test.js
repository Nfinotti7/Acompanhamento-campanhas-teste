import { test } from 'node:test';
import assert from 'node:assert/strict';
import { refreshProfilePicture } from './profilePicture.js';

const NOW = new Date('2026-10-13T12:00:00.000Z').getTime();

function makeFakeDb({ checkedAt = null, currentPicId = null } = {}) {
  const calls = [];
  const db = {
    query: async (sql, params = []) => {
      calls.push({ sql, params });
      if (/SELECT profile_pic_checked_at/.test(sql)) {
        return { rows: [{ profile_pic_checked_at: checkedAt, profile_pic_media_id: currentPicId }] };
      }
      if (/INSERT INTO whatsapp_media/.test(sql)) return { rows: [{ id: 42 }] };
      return { rows: [] };
    }
  };
  return { db, calls };
}

const fakeFetch = async () => ({ ok: true, headers: { get: () => 'image/jpeg' }, arrayBuffer: async () => new TextEncoder().encode('jpg').buffer });

test('baixa e guarda a foto quando nunca foi verificada', async () => {
  const { db, calls } = makeFakeDb();
  await refreshProfilePicture({ clientId: 9, contactId: 17, getPictureUrl: async () => 'https://pps.whatsapp.net/x.jpg', fetchImpl: fakeFetch, db, now: () => NOW });

  assert.ok(calls.some((c) => /INSERT INTO whatsapp_media/.test(c.sql)));
  const update = calls.find((c) => /SET profile_pic_media_id/.test(c.sql));
  assert.ok(update);
  assert.equal(update.params[0], 42);
});

test('nao consulta de novo se ja verificou nas ultimas 24h', async () => {
  const { db, calls } = makeFakeDb({ checkedAt: new Date(NOW - 60 * 60 * 1000).toISOString() });
  let asked = false;
  await refreshProfilePicture({ clientId: 9, contactId: 17, getPictureUrl: async () => { asked = true; return 'x'; }, fetchImpl: fakeFetch, db, now: () => NOW });

  assert.equal(asked, false);
  assert.ok(!calls.some((c) => /INSERT INTO whatsapp_media/.test(c.sql)));
});

test('contato sem foto (ou com privacidade) so marca como verificado, sem quebrar', async () => {
  const { db, calls } = makeFakeDb();
  await refreshProfilePicture({ clientId: 9, contactId: 17, getPictureUrl: async () => { throw new Error('item-not-found'); }, fetchImpl: fakeFetch, db, now: () => NOW });

  assert.ok(calls.some((c) => /SET profile_pic_checked_at/.test(c.sql)));
  assert.ok(!calls.some((c) => /INSERT INTO whatsapp_media/.test(c.sql)));
});

test('troca a foto antiga pela nova e apaga a antiga', async () => {
  const { db, calls } = makeFakeDb({ currentPicId: 7 });
  await refreshProfilePicture({ clientId: 9, contactId: 17, getPictureUrl: async () => 'https://pps.whatsapp.net/y.jpg', fetchImpl: fakeFetch, db, now: () => NOW });

  const del = calls.find((c) => /DELETE FROM whatsapp_media/.test(c.sql));
  assert.ok(del);
  assert.equal(del.params[0], 7);
});
