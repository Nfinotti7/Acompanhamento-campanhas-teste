import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTheme, contrastRatio } from './resolveTheme.js';

test('escolha salva vence o sistema', () => {
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('dark', false), 'dark');
});

test('sem escolha salva segue o sistema', () => {
  assert.equal(resolveTheme(null, true), 'dark');
  assert.equal(resolveTheme(null, false), 'light');
  assert.equal(resolveTheme('lixo', false), 'light');
});

test('contrastRatio bate com os valores conhecidos', () => {
  assert.equal(Math.round(contrastRatio('#000000', '#ffffff')), 21);
  assert.equal(contrastRatio('#777777', '#777777'), 1);
});
