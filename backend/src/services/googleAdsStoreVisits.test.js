import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeStoreVisits } from './googleAdsSync.js';

const rows = [
  { campaignId: '1', date: '2026-11-07', spend: 40 },
  { campaignId: '1', date: '2026-11-08', spend: 30 },
  { campaignId: '2', date: '2026-11-07', spend: 10 }
];

test('mergeStoreVisits junta visitas por campanha e dia', () => {
  const out = mergeStoreVisits(rows, [
    { campaign: { id: '1' }, segments: { date: '2026-11-07' }, metrics: { allConversions: 14 } },
    { campaign: { id: 2 }, segments: { date: '2026-11-07' }, metrics: { allConversions: 1.5 } }
  ]);
  assert.deepEqual(out.map((r) => r.storeVisits), [14, 0, 1.5]);
  assert.equal(out[0].spend, 40);
});

test('mergeStoreVisits soma linhas repetidas e ignora dia sem métrica', () => {
  const out = mergeStoreVisits(rows, [
    { campaign: { id: '1' }, segments: { date: '2026-11-08' }, metrics: { allConversions: 2 } },
    { campaign: { id: '1' }, segments: { date: '2026-11-08' }, metrics: { allConversions: 3 } },
    { campaign: { id: '1' }, segments: { date: '2026-11-09' }, metrics: { allConversions: 9 } }
  ]);
  assert.deepEqual(out.map((r) => r.storeVisits), [0, 5, 0]);
  assert.equal(out.length, 3);
});

test('mergeStoreVisits sem visitas deixa tudo em zero', () => {
  assert.deepEqual(mergeStoreVisits(rows, []).map((r) => r.storeVisits), [0, 0, 0]);
  assert.deepEqual(mergeStoreVisits(rows, undefined).map((r) => r.storeVisits), [0, 0, 0]);
});
