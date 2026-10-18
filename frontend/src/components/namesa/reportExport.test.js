import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCsv, formatPhone, formatTime, printHtml } from './reportExport.js';

const entries = [
  { id: 1, name: 'Ana; "Bia"', phone: '5562996952514', party_size: 4, source: 'whatsapp', status: 'seated', joined_at: '2026-10-17T22:00:00Z', called_at: '2026-10-17T22:25:00Z', finished_at: '2026-10-17T22:30:00Z', wait_minutes: 30 },
  { id: 2, name: null, phone: null, party_size: null, source: 'manual', status: 'not_answered', joined_at: '2026-10-17T22:10:00Z' }
];

test('formatPhone e formatTime (horário de Brasília)', () => {
  assert.equal(formatPhone('5562996952514'), '(62) 99695-2514');
  assert.equal(formatPhone('556296952514'), '(62) 9695-2514');
  assert.equal(formatPhone(null), '');
  assert.equal(formatTime('2026-10-17T22:00:00Z'), '19:00');
  assert.equal(formatTime(null), '');
});

test('toCsv: BOM, ";" e aspas escapadas', () => {
  const csv = toCsv(entries);
  assert.ok(csv.startsWith('﻿Chegada;Nome;WhatsApp'));
  const lines = csv.slice(1).split('\r\n');
  assert.equal(lines.length, 3);
  assert.equal(lines[1], '19:00;"Ana; ""Bia""";(62) 99695-2514;4;WhatsApp;Sentou;19:25;19:30;30');
  assert.equal(lines[2], '19:10;Sem nome;;;Manual;Não respondeu;;;');
});

test('printHtml escapa o nome', () => {
  const html = printHtml({
    restaurant: 'Mercearia',
    report: { day: '2026-10-17', summary: { groups: 1, people: 4, seatedGroups: 1, seatedPeople: 4, noShow: 0, left: 0, avgWaitMinutes: 30, maxWaitMinutes: 30 }, entries: [{ ...entries[0], name: '<b>x</b>' }] }
  });
  assert.ok(html.includes('&lt;b&gt;x&lt;/b&gt;'));
  assert.ok(!html.includes('<b>x</b>'));
});
