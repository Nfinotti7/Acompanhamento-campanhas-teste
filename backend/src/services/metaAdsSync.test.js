import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchCampaignPageId, normalizeAccountId } from './metaAdsSync.js';

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
