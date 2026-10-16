import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installHintFor } from './installHint.js';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/120.0 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36';

test('Android com prompt guardado mostra o botão instalar', () => {
  assert.equal(installHintFor({ userAgent: ANDROID, standalone: false, hasPrompt: true, dismissed: false }), 'android');
});

test('iPhone no Safari mostra a dica de Compartilhar', () => {
  assert.equal(installHintFor({ userAgent: IPHONE, standalone: false, hasPrompt: false, dismissed: false }), 'ios');
});

test('Chrome no iPhone não instala PWA: sem dica', () => {
  assert.equal(installHintFor({ userAgent: IPHONE_CHROME, standalone: false, hasPrompt: false, dismissed: false }), null);
});

test('já instalado ou dispensado: nada', () => {
  assert.equal(installHintFor({ userAgent: IPHONE, standalone: true, hasPrompt: false, dismissed: false }), null);
  assert.equal(installHintFor({ userAgent: ANDROID, standalone: false, hasPrompt: true, dismissed: true }), null);
});
