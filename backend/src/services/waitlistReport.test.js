import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serviceDayOf, serviceDayRange, recentServiceDays, buildReport, loadReport, purgeOldEntries } from './waitlistReport.js';

test('dia de serviço começa às 05:00 de Brasília: madrugada conta no dia anterior', () => {
  assert.equal(serviceDayOf('2026-10-17T23:00:00Z'), '2026-10-17'); // 20h BRT
  assert.equal(serviceDayOf('2026-10-18T04:30:00Z'), '2026-10-17'); // 01:30 BRT
  assert.equal(serviceDayOf('2026-10-18T07:59:00Z'), '2026-10-17'); // 04:59 BRT
  assert.equal(serviceDayOf('2026-10-18T08:00:00Z'), '2026-10-18'); // 05:00 BRT
  const r = serviceDayRange('2026-10-17');
  assert.equal(r.start.toISOString(), '2026-10-17T08:00:00.000Z');
  assert.equal(r.end.toISOString(), '2026-10-18T08:00:00.000Z');
});

test('recentServiceDays devolve hoje e os 6 anteriores', () => {
  const days = recentServiceDays(new Date('2026-10-18T02:00:00Z')); // 23h de 17/10 BRT
  assert.equal(days.length, 7);
  assert.equal(days[0], '2026-10-17');
  assert.equal(days[6], '2026-10-11');
});

test('buildReport lista todo mundo e soma grupos, pessoas e espera', () => {
  const r = buildReport([
    { id: 2, name: 'Bia', phone: '5511988887777', party_size: 2, source: 'manual', status: 'no_show', joined_at: '2026-10-17T22:10:00Z', finished_at: '2026-10-17T22:40:00Z' },
    { id: 1, name: 'Ana', phone: '5511999998888', party_size: 4, source: 'whatsapp', status: 'seated', joined_at: '2026-10-17T22:00:00Z', called_at: '2026-10-17T22:25:00Z', finished_at: '2026-10-17T22:30:00Z' },
    { id: 3, name: 'Caio', party_size: 3, source: 'whatsapp', status: 'seated', joined_at: '2026-10-17T22:20:00Z', finished_at: '2026-10-17T22:30:00Z' },
    { id: 4, name: 'Davi', party_size: null, source: 'whatsapp', status: 'awaiting_size', joined_at: '2026-10-17T22:50:00Z' }
  ]);
  assert.deepEqual(r.entries.map((e) => [e.id, e.status, e.wait_minutes]), [
    [1, 'seated', 30], [2, 'no_show', null], [3, 'seated', 10], [4, 'not_answered', null]
  ]);
  assert.deepEqual(r.summary, {
    groups: 3, people: 9, seatedGroups: 2, seatedPeople: 7, noShow: 1, left: 0, removed: 0,
    notAnswered: 1, avgWaitMinutes: 20, maxWaitMinutes: 30
  });
});

test('buildReport de dia vazio', () => {
  const r = buildReport([]);
  assert.equal(r.summary.groups, 0);
  assert.equal(r.summary.avgWaitMinutes, null);
  assert.deepEqual(r.entries, []);
});

function fakeDb(rows) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      return { rows: typeof rows === 'function' ? rows(sql, params) : rows };
    }
  };
}

test('loadReport separa por dia de serviço e cai pra hoje se o dia pedido estiver fora', async () => {
  const now = new Date('2026-10-18T15:00:00Z');
  const db = fakeDb([
    { id: 1, party_size: 2, status: 'seated', source: 'whatsapp', joined_at: '2026-10-17T23:00:00Z', finished_at: '2026-10-17T23:20:00Z' },
    { id: 2, party_size: 3, status: 'seated', source: 'whatsapp', joined_at: '2026-10-18T03:00:00Z', finished_at: '2026-10-18T03:10:00Z' },
    { id: 3, party_size: 2, status: 'waiting', source: 'manual', joined_at: '2026-10-18T14:00:00Z' }
  ]);
  const r = await loadReport(db, { clientId: 13, day: '2026-10-17', now });
  assert.equal(r.day, '2026-10-17');
  assert.deepEqual(r.entries.map((e) => e.id), [1, 2]);
  assert.deepEqual(r.days.slice(0, 2), [{ day: '2026-10-18', groups: 1 }, { day: '2026-10-17', groups: 2 }]);
  assert.equal(db.calls[0].params[0], 13);
  assert.equal(db.calls[0].params[1].toISOString(), '2026-10-12T08:00:00.000Z');

  const fallback = await loadReport(db, { clientId: 13, day: '2026-09-01', now });
  assert.equal(fallback.day, '2026-10-18');
});

test('purgeOldEntries apaga o que é anterior ao dia mais antigo da retenção', async () => {
  const db = fakeDb([{ id: 5 }, { id: 6 }]);
  const n = await purgeOldEntries(db, new Date('2026-10-18T15:00:00Z'));
  assert.equal(n, 2);
  assert.match(db.calls[0].sql, /DELETE FROM waitlist_entries WHERE joined_at < \?/);
  assert.equal(db.calls[0].params[0].toISOString(), '2026-10-12T08:00:00.000Z');
});
