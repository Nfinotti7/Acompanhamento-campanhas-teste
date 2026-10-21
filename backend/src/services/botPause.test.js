import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pauseBot, resumeBot, isBotPaused, PAUSE_MS } from './botPause.js';

function fakeDb(pausedUntil = null) {
  const calls = [];
  return {
    calls,
    query: async (sql, params = []) => {
      calls.push({ sql, params });
      if (/SELECT bot_paused_until/.test(sql)) return { rows: [{ bot_paused_until: pausedUntil }] };
      return { rows: [] };
    }
  };
}

const NOW = new Date('2026-10-24T22:00:00Z');

test('pauseBot pausa por 12h, encerra a conversa ativa e avisa a tela', async () => {
  const db = fakeDb();
  const events = [];
  const until = await pauseBot(db, { clientId: 9, contactId: 3, now: NOW }, { broadcast: (c, n, d) => events.push({ c, n, d }) });
  assert.equal(PAUSE_MS, 12 * 3600e3);
  assert.equal(until.toISOString(), '2026-10-25T10:00:00.000Z');
  const pause = db.calls.find((c) => /SET bot_paused_until = \?/.test(c.sql));
  assert.deepEqual(pause.params, [until, 3, 9]);
  const close = db.calls.find((c) => /UPDATE reservation_conversations SET status = 'handed_off'/.test(c.sql));
  assert.deepEqual(close.params, [9, 3]);
  assert.deepEqual(events, [{ c: 9, n: 'reservation', d: { contactId: 3, botPaused: true } }]);
});

test('resumeBot zera a pausa', async () => {
  const db = fakeDb();
  await resumeBot(db, { clientId: 9, contactId: 3 }, { broadcast: () => {} });
  assert.ok(db.calls.some((c) => /SET bot_paused_until = NULL/.test(c.sql)));
});

test('isBotPaused compara com agora', async () => {
  assert.equal(await isBotPaused(fakeDb(new Date('2026-10-25T00:00:00Z')), { contactId: 3, now: NOW }), true);
  assert.equal(await isBotPaused(fakeDb(new Date('2026-10-24T21:00:00Z')), { contactId: 3, now: NOW }), false);
  assert.equal(await isBotPaused(fakeDb(null), { contactId: 3, now: NOW }), false);
});

test('pauseBot só encerra conversa do próprio restaurante', async () => {
  const db = fakeDb();
  await pauseBot(db, { clientId: 9, contactId: 3, now: NOW }, { broadcast: () => {} });
  const close = db.calls.find((c) => /UPDATE reservation_conversations/.test(c.sql));
  assert.match(close.sql, /client_id = \?/);
  assert.deepEqual(close.params, [9, 3]);
});
