import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyOrigin, ORIGINS } from './whatsappOrigin.js';

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
