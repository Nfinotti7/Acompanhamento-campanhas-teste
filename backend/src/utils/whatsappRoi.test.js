import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeRoi } from './whatsappRoi.js';

test('computeRoi calcula roi e roas corretamente com gasto e conversoes', () => {
  const result = computeRoi({
    adSpend: 200,
    conversions: [
      { contactId: 1, amountSpent: 150 },
      { contactId: 2, amountSpent: 300 },
      { contactId: null, amountSpent: 80 }
    ]
  });

  assert.equal(result.totalSpend, 200);
  assert.equal(result.totalRevenue, 530);
  assert.equal(result.conversionCount, 3);
  assert.equal(result.matchedCount, 2);
  assert.equal(result.roas, 2.65); // 530 / 200
  assert.equal(result.roi, 165);   // ((530 - 200) / 200) * 100
});

test('computeRoi retorna roi e roas zero quando nao ha gasto em anuncio', () => {
  const result = computeRoi({ adSpend: 0, conversions: [{ contactId: 1, amountSpent: 100 }] });
  assert.equal(result.roi, 0);
  assert.equal(result.roas, 0);
  assert.equal(result.totalRevenue, 100);
});

test('computeRoi lida com lista de conversoes vazia', () => {
  const result = computeRoi({ adSpend: 150, conversions: [] });
  assert.equal(result.totalRevenue, 0);
  assert.equal(result.conversionCount, 0);
  assert.equal(result.matchedCount, 0);
  assert.equal(result.roi, -100); // perdeu 100% do gasto, sem faturamento
});
