import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toLegacyColors } from './legacyColors.js';

test('color(srgb ...) vira rgba() que o html2canvas entende', () => {
  assert.equal(toLegacyColors('color(srgb 0 0.5 1 / 0.4)'), 'rgba(0, 128, 255, 0.4)');
  assert.equal(toLegacyColors('color(srgb 1 1 1)'), 'rgba(255, 255, 255, 1)');
});

test('converte dentro de sombra e gradiente sem mexer no resto', () => {
  assert.equal(
    toLegacyColors('0px 4px 15px 0px color(srgb 0 0.498 0.588 / 0.35)'),
    '0px 4px 15px 0px rgba(0, 127, 150, 0.35)'
  );
  assert.equal(
    toLegacyColors('linear-gradient(135deg, color(srgb 0 0.5 0.6) 0%, rgb(0, 106, 128) 100%)'),
    'linear-gradient(135deg, rgba(0, 128, 153, 1) 0%, rgb(0, 106, 128) 100%)'
  );
});

test('cor já suportada volta igual', () => {
  assert.equal(toLegacyColors('rgb(1, 2, 3)'), 'rgb(1, 2, 3)');
  assert.equal(toLegacyColors('none'), 'none');
  assert.equal(toLegacyColors(''), '');
});
