import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyCampaignByPrefix } from './campaignClassifier.js';

test('bate com o prefixo correto quando ele esta no inicio do nome', () => {
  const result = classifyCampaignByPrefix('RECREIO - Happy Hour', [
    { clientId: 5, campaignPrefix: 'RECREIO -' },
    { clientId: 6, campaignPrefix: 'MALIBU -' }
  ]);
  assert.deepEqual(result, { status: 'matched', clientId: 5 });
});

test('nao bate se o prefixo nao estiver no inicio', () => {
  const result = classifyCampaignByPrefix('Promo RECREIO - Teste', [
    { clientId: 5, campaignPrefix: 'RECREIO -' }
  ]);
  assert.deepEqual(result, { status: 'unclassified', clientId: null });
});

test('comparacao e exata, sensivel a maiuscula/minuscula', () => {
  const result = classifyCampaignByPrefix('recreio - happy hour', [
    { clientId: 5, campaignPrefix: 'RECREIO -' }
  ]);
  assert.deepEqual(result, { status: 'unclassified', clientId: null });
});

test('candidato com campaignPrefix nulo nunca bate com nada', () => {
  const result = classifyCampaignByPrefix('RECREIO - Happy Hour', [
    { clientId: 5, campaignPrefix: null }
  ]);
  assert.deepEqual(result, { status: 'unclassified', clientId: null });
});

test('nenhum candidato bate: unclassified', () => {
  const result = classifyCampaignByPrefix('Campanha Qualquer', [
    { clientId: 5, campaignPrefix: 'RECREIO -' },
    { clientId: 6, campaignPrefix: 'MALIBU -' }
  ]);
  assert.deepEqual(result, { status: 'unclassified', clientId: null });
});
