import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyOrigin, ORIGINS, balcaoOriginFilter } from './whatsappOrigin.js';

test('ORIGINS tem as 4 origens do painel, na ordem de exibicao', () => {
  assert.deepEqual(ORIGINS, ['meta_ads', 'google_ads', 'outras', 'nao_rastreada']);
});

test('contato que chegou por clique em anuncio Meta e meta_ads', () => {
  assert.equal(classifyOrigin({ source: 'ad' }), 'meta_ads');
});

test('contato organico (sem anuncio, sem link rastreavel) e nao_rastreada', () => {
  assert.equal(classifyOrigin({ source: 'organic' }), 'nao_rastreada');
  assert.equal(classifyOrigin({ source: null }), 'nao_rastreada');
  assert.equal(classifyOrigin({}), 'nao_rastreada');
});

test('origens ja gravadas como google_ads/outras sao respeitadas (vem do link rastreavel)', () => {
  assert.equal(classifyOrigin({ source: 'google_ads' }), 'google_ads');
  assert.equal(classifyOrigin({ source: 'outras' }), 'outras');
});

const fakeDb = (flag) => ({ query: async () => ({ rows: flag === undefined ? [] : [{ balcao_ads_only: flag }] }) });

test('balcaoOriginFilter: cliente com so-anuncio esconde organicas por padrao', async () => {
  const f = await balcaoOriginFilter(fakeDb(true), 5, undefined);
  assert.equal(f.adsOnly, true);
  assert.equal(f.sql, " AND wc.source IN ('ad', 'google_ads')");
});

test('balcaoOriginFilter: origin=all mostra tudo mas avisa que o filtro existe', async () => {
  const f = await balcaoOriginFilter(fakeDb(true), 5, 'all');
  assert.deepEqual(f, { adsOnly: true, sql: '' });
});

test('balcaoOriginFilter: cliente sem a chave (ou inexistente) nao filtra', async () => {
  assert.deepEqual(await balcaoOriginFilter(fakeDb(false), 5, undefined), { adsOnly: false, sql: '' });
  assert.deepEqual(await balcaoOriginFilter(fakeDb(undefined), 5, undefined), { adsOnly: false, sql: '' });
});