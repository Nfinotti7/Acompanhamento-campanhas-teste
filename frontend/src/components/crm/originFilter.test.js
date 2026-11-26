import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterByPeriod, filterByOrigin, countByOrigin } from './originFilter.js';

// 26/11 15h em Brasília.
const NOW = new Date('2026-11-26T18:00:00.000Z');
const contact = (id, origin_category, first_contact_at) => ({ id, origin_category, first_contact_at });
const list = [
  contact(1, 'anuncio', '2026-11-26T16:00:00Z'),
  contact(2, 'organico', '2026-11-26T02:00:00Z'), // 25/11 23h em Brasília
  contact(3, 'anuncio_antigo', '2026-11-26T12:00:00Z'),
  contact(4, 'google', '2026-11-21T12:00:00Z'),
  contact(5, 'anuncio', '2026-11-19T12:00:00Z'),
  contact(6, 'organico', '2026-08-01T12:00:00Z')
];
const ids = (rows) => rows.map((r) => r.id);

test('período conta pelo dia de Brasília da primeira mensagem', () => {
  assert.deepEqual(ids(filterByPeriod(list, 'today', NOW)), [1, 3]);
  assert.deepEqual(ids(filterByPeriod(list, '7', NOW)), [1, 2, 3, 4]);
  assert.deepEqual(ids(filterByPeriod(list, '30', NOW)), [1, 2, 3, 4, 5]);
  assert.deepEqual(ids(filterByPeriod(list, '', NOW)), [1, 2, 3, 4, 5, 6]);
});

test('"anúncios" junta Meta no ar e Google, sem anúncio antigo', () => {
  assert.deepEqual(ids(filterByOrigin(list, 'anuncios')), [1, 4, 5]);
  assert.deepEqual(ids(filterByOrigin(list, 'anuncio_antigo')), [3]);
  assert.deepEqual(ids(filterByOrigin(list, 'organico')), [2, 6]);
  assert.equal(filterByOrigin(list, '').length, 6);
});

test('contagem por origem; link de outras origens entra no orgânico', () => {
  assert.deepEqual(countByOrigin([...list, contact(7, 'outras', '2026-11-26T12:00:00Z')]),
    { total: 7, anuncios: 3, anuncio_antigo: 1, organico: 3 });
});
