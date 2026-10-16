import { test } from 'node:test';
import assert from 'node:assert/strict';
import { swStrategyFor } from './swStrategy.js';

const u = (p) => new URL(`https://furtherads.online${p}`);

test('API, link rastreável e webhook nunca passam pelo cache', () => {
  assert.equal(swStrategyFor(u('/api/waitlist'), 'cors'), 'bypass');
  assert.equal(swStrategyFor(u('/api/whatsapp/events?token=x'), 'cors'), 'bypass');
  assert.equal(swStrategyFor(u('/r/abc'), 'navigate'), 'bypass');
  assert.equal(swStrategyFor(u('/api/v1/whatsapp/webhook'), 'cors'), 'bypass');
});

test('abrir página é rede primeiro com fallback pro shell', () => {
  assert.equal(swStrategyFor(u('/namesa'), 'navigate'), 'network-first-shell');
  assert.equal(swStrategyFor(u('/'), 'navigate'), 'network-first-shell');
});

test('arquivos com hash e ícones vão pelo cache', () => {
  assert.equal(swStrategyFor(u('/assets/index-abc123.js'), 'no-cors'), 'cache-first');
  assert.equal(swStrategyFor(u('/icons/namesa-192.png'), 'no-cors'), 'cache-first');
  assert.equal(swStrategyFor(u('/brand/further-arrow-dark-trim.png'), 'no-cors'), 'cache-first');
});

test('outro domínio (fonte do Google) não é com a gente', () => {
  assert.equal(swStrategyFor(new URL('https://fonts.googleapis.com/css2'), 'cors'), 'bypass');
});
