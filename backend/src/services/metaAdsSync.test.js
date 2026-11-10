import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchCampaignPageId, normalizeAccountId, isEventCampaign } from './metaAdsSync.js';

test('fetchCampaignPageId extrai o page id do effective_object_story_id', async () => {
  const fakeFetch = async (url) => {
    assert.ok(url.includes('campaign123/ads'));
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: [{ creative: { effective_object_story_id: '987654321_111222333' } }] })
    };
  };
  const pageId = await fetchCampaignPageId('campaign123', 'token-abc', fakeFetch);
  assert.equal(pageId, '987654321');
});

test('fetchCampaignPageId retorna null quando a campanha nao tem anuncio com criativo', async () => {
  const fakeFetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ data: [] }) });
  const pageId = await fetchCampaignPageId('campaign123', 'token-abc', fakeFetch);
  assert.equal(pageId, null);
});

test('fetchCampaignPageId lanca erro quando a API responde com falha', async () => {
  const fakeFetch = async () => ({ ok: false, status: 400, text: async () => JSON.stringify({ error: { message: 'Invalid campaign' } }) });
  await assert.rejects(() => fetchCampaignPageId('campaign123', 'token-abc', fakeFetch), /Invalid campaign/);
});

test('normalizeAccountId adiciona o prefixo act_ quando falta', () => {
  assert.equal(normalizeAccountId('123456'), 'act_123456');
  assert.equal(normalizeAccountId('act_123456'), 'act_123456');
});

test('normalizeAccountId remove espacos nas pontas antes de comparar', () => {
  assert.equal(normalizeAccountId('  act_123456  '), 'act_123456');
  assert.equal(normalizeAccountId(' 123456 '), 'act_123456');
});

test('normalizeAccountId nao lanca erro quando o valor nao e string', () => {
  assert.equal(normalizeAccountId(123456), 'act_123456');
});

import { resolveCampaignStatus, fetchCampaignStatuses } from './metaAdsSync.js';
import { updateCampaignStatuses } from './syncService.js';

test('campanha ativa com todos os conjuntos parados conta como pausada', () => {
  assert.equal(resolveCampaignStatus('ACTIVE', { total: 3, active: 0 }), 'PAUSED');
  assert.equal(resolveCampaignStatus('ACTIVE', { total: 3, active: 1 }), 'ACTIVE');
  assert.equal(resolveCampaignStatus('ACTIVE', undefined), 'ACTIVE');
  assert.equal(resolveCampaignStatus('ACTIVE', { total: 0, active: 0 }), 'ACTIVE');
  assert.equal(resolveCampaignStatus('PAUSED', { total: 2, active: 2 }), 'PAUSED');
});

test('status de todas as campanhas da conta, com e sem o detalhe dos conjuntos', async () => {
  const campaigns = new Map([['1', { status: 'ACTIVE' }], ['2', { status: 'PAUSED' }], ['3', { status: 'ACTIVE' }]]);
  const withAdsets = await fetchCampaignStatuses('act_1', 't', {
    fetchCampaignMeta: async () => campaigns,
    fetchAdsetActivity: async () => new Map([['1', { total: 2, active: 0 }], ['3', { total: 1, active: 1 }]])
  });
  assert.deepEqual([...withAdsets], [['1', 'PAUSED'], ['2', 'PAUSED'], ['3', 'ACTIVE']]);
  const noAdsets = await fetchCampaignStatuses('act_1', 't', {
    fetchCampaignMeta: async () => campaigns,
    fetchAdsetActivity: async () => { throw new Error('sem permissão'); }
  });
  assert.equal(noAdsets.get('1'), 'ACTIVE');
});

test('atualiza só o que mudou', async () => {
  const calls = [];
  const db = { query: async (sql, params) => { calls.push(params); return { rowCount: params[0] === 'PAUSED' ? 1 : 0 }; } };
  const changed = await updateCampaignStatuses(new Map([['1', 'PAUSED'], ['2', 'ACTIVE'], ['3', null]]), db);
  assert.equal(changed, 1);
  assert.equal(calls.length, 2); // o status vazio é ignorado
});

test('isEventCampaign: campanhas de eventos com WhatsApp 4052 ou marca [EVT]', () => {
  assert.equal(isEventCampaign('RECREIO - [TRF] Confraternização WhatsApp 4052'), true);
  assert.equal(isEventCampaign('ALMA - [evt] Natal'), true);
  assert.equal(isEventCampaign('MALIBU - [ENG] Rodízio Jantar WhatsApp - NOV26'), false);
  assert.equal(isEventCampaign(null), false);
});
