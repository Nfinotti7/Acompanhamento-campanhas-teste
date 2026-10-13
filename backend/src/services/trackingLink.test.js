import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateCode, buildTrackedMessage, extractTrackingCode, buildWaMeUrl, slugify,
  collectClickParams, classifyClickSource, isPreviewBot, CODE_LENGTH
} from './trackingLink.js';

test('generateCode gera codigo do tamanho certo sem caracteres ambiguos', () => {
  const code = generateCode();
  assert.equal(code.length, CODE_LENGTH);
  assert.doesNotMatch(code, /[01OIL]/);
});

test('mensagem pronta termina com o codigo e o codigo e lido de volta', () => {
  const text = buildTrackedMessage('Olá! Quero reservar', 'A7K2M');
  assert.equal(text, 'Olá! Quero reservar (cód. A7K2M)');
  assert.equal(extractTrackingCode(text), 'A7K2M');
});

test('extractTrackingCode aceita variacoes que o lead pode digitar', () => {
  assert.equal(extractTrackingCode('oi cod A7K2M'), 'A7K2M');
  assert.equal(extractTrackingCode('oi COD.a7k2m'), 'A7K2M');
  assert.equal(extractTrackingCode('Olá, tudo bem?'), null);
  assert.equal(extractTrackingCode(null), null);
});

test('buildWaMeUrl limpa o numero e codifica o texto', () => {
  assert.equal(buildWaMeUrl('+55 (11) 99999-8888', 'Oi (cód. A)'), 'https://wa.me/5511999998888?text=Oi%20(c%C3%B3d.%20A)');
});

test('slugify', () => {
  assert.equal(slugify('Promoção Rodízio Sexta!'), 'promocao-rodizio-sexta');
});

test('collectClickParams prioriza a URL e completa com os padroes do link', () => {
  const p = collectClickParams({ utm_campaign: 'black', fbclid: 'FB1' }, { utm_source: 'instagram', utm_campaign: 'base' });
  assert.equal(p.utm_source, 'instagram');
  assert.equal(p.utm_campaign, 'black');
  assert.equal(p.fbclid, 'FB1');
  assert.equal(p.gclid, null);
});

test('classifyClickSource', () => {
  assert.equal(classifyClickSource({ gclid: 'G' }), 'google_ads');
  assert.equal(classifyClickSource({ utm_source: 'google' }), 'google_ads');
  assert.equal(classifyClickSource({ fbclid: 'F' }), 'ad');
  assert.equal(classifyClickSource({ utm_source: 'Instagram' }), 'ad');
  assert.equal(classifyClickSource({ utm_source: 'bio' }), 'outras');
  assert.equal(classifyClickSource({}), 'outras');
});

test('isPreviewBot reconhece robos de previa de link', () => {
  assert.ok(isPreviewBot('facebookexternalhit/1.1'));
  assert.ok(isPreviewBot('WhatsApp/2.23.20.0'));
  assert.ok(!isPreviewBot('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'));
});
