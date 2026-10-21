import { test } from 'node:test';
import assert from 'node:assert/strict';
import { originLabel, statusLabel, groupByTime, todayBrasilia, timeOf, addDaysISO, dayTitle } from './reservationFormat.js';

test('originLabel', () => {
  assert.equal(originLabel({ source: 'manual' }), 'Telefone/balcão');
  assert.equal(originLabel({ source: 'whatsapp', contact_source: 'ad', campaign_name: 'MALIBU - Engajamento' }), 'Anúncio · MALIBU - Engajamento');
  assert.equal(originLabel({ source: 'whatsapp', contact_source: 'ad' }), 'Anúncio');
  assert.equal(originLabel({ source: 'whatsapp', contact_source: 'google_ads', tracking_method: 'link' }), 'Google');
  assert.equal(originLabel({ source: 'whatsapp', contact_source: 'outras', tracking_method: 'link' }), 'Link');
  assert.equal(originLabel({ source: 'whatsapp', contact_source: 'organic' }), '');
});

test('statusLabel', () => {
  assert.equal(statusLabel('confirmed'), 'Confirmada');
  assert.equal(statusLabel('arrived'), 'Chegou');
  assert.equal(statusLabel('no_show'), 'Não veio');
  assert.equal(statusLabel('cancelled'), 'Cancelada');
});

test('timeOf usa o horário de Brasília', () => {
  assert.equal(timeOf('2026-10-24T22:30:00Z'), '19:30');
  assert.equal(timeOf('2026-10-25T02:30:00.000Z'), '23:30');
});

test('groupByTime ordena por horário', () => {
  const groups = groupByTime([
    { id: 2, starts_at: '2026-10-24T23:00:00Z' },
    { id: 1, starts_at: '2026-10-24T22:30:00Z' },
    { id: 3, starts_at: '2026-10-24T22:30:00Z' }
  ]);
  assert.deepEqual(groups.map((g) => g.time), ['19:30', '20:00']);
  assert.deepEqual(groups[0].items.map((r) => r.id), [1, 3]);
});

test('todayBrasilia e addDaysISO', () => {
  assert.equal(todayBrasilia(new Date('2026-10-25T02:00:00Z')), '2026-10-24');
  assert.equal(addDaysISO('2026-10-31', 1), '2026-11-01');
  assert.equal(addDaysISO('2026-11-01', -1), '2026-10-31');
});

test('dayTitle', () => {
  assert.equal(dayTitle('2026-10-24', '2026-10-24'), 'Hoje · sábado, 24/10');
  assert.equal(dayTitle('2026-10-25', '2026-10-24'), 'Amanhã · domingo, 25/10');
  assert.equal(dayTitle('2026-10-27', '2026-10-24'), 'terça, 27/10');
});
