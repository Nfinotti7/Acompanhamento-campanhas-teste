import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importHistoryMessages, applyHistoryContactNames } from './historyImport.js';

function fakeDb() {
  const calls = [];
  let contactSeq = 0;
  const seenMsgs = new Set();
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      if (/INSERT INTO whatsapp_contacts/.test(sql)) return { rows: [{ id: 100 + (++contactSeq) }] };
      if (/INSERT INTO whatsapp_messages/.test(sql)) {
        const id = params[4];
        if (seenMsgs.has(id)) return { rows: [] };
        seenMsgs.add(id);
        return { rows: [{ id: seenMsgs.size }] };
      }
      if (/UPDATE whatsapp_contacts/.test(sql)) return { rows: [{ id: 1 }] };
      return { rows: [] };
    },
  };
}

const ev = (over) => ({
  waId: '5562999990000', profileName: 'Ana', waMessageId: 'M1', direction: 'inbound',
  body: 'oi', sentAt: '2026-11-10T12:00:00.000Z', ...over,
});
const deps = (events) => ({ isUsable: () => true, map: (m) => events[m] });

test('grava contato e mensagens sem tocar em funil, robô ou mídia', async () => {
  const db = fakeDb();
  const events = [ev({}), ev({ waMessageId: 'M2', direction: 'outbound', profileName: null, sentAt: '2026-11-10T12:01:00.000Z' })];
  const r = await importHistoryMessages(db, 9, [0, 1], deps(events));
  assert.deepEqual(r, { messages: 2, contacts: 1 });
  const sqls = db.calls.map((c) => c.sql).join('\n');
  assert.doesNotMatch(sqls, /crm_|conversion|whatsapp_media|reservation|waitlist/);
});

test('ignora grupo e mensagem sem id; repetida não duplica', async () => {
  const db = fakeDb();
  const events = [ev({}), ev({}), ev({ waId: '120363000000000000', waMessageId: 'G1' }), ev({ waMessageId: null })];
  const r = await importHistoryMessages(db, 9, [0, 1, 2, 3], deps(events));
  assert.equal(r.messages, 1);
});

test('mais antiga primeiro e anúncio marca origem ad', async () => {
  const db = fakeDb();
  const events = [
    ev({ waMessageId: 'B', sentAt: '2026-11-12T00:00:00.000Z' }),
    ev({ waMessageId: 'A', sentAt: '2026-11-01T00:00:00.000Z', adId: '123', ctwaClid: 'x' }),
  ];
  await importHistoryMessages(db, 9, [0, 1], deps(events));
  const firstMsg = db.calls.find((c) => /INSERT INTO whatsapp_messages/.test(c.sql));
  assert.equal(firstMsg.params[4], 'A');
  const firstContact = db.calls.find((c) => /INSERT INTO whatsapp_contacts/.test(c.sql));
  assert.equal(firstContact.params[7], 'ad');
});

test('nome dos contatos do histórico só preenche quem está sem nome', async () => {
  const db = fakeDb();
  const n = await applyHistoryContactNames(db, 9, [
    { id: '5562988887777@s.whatsapp.net', notify: 'João' },
    { id: '120363000@g.us', notify: 'Grupo' },
    { id: '5562911112222@s.whatsapp.net' },
  ]);
  assert.equal(n, 1);
  assert.match(db.calls[0].sql, /profile_name IS NULL/);
  assert.deepEqual(db.calls[0].params, ['João', 9, '5562988887777']);
});
