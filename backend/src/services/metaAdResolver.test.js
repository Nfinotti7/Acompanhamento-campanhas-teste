import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAd } from './metaAdResolver.js';

const NOW = new Date('2026-10-13T12:00:00.000Z').getTime();

function makeFakeDb({ cached = null, accessToken = 'TOKEN' } = {}) {
  const calls = [];
  return {
    calls,
    db: {
      query: async (sql, params = []) => {
        calls.push({ sql, params });
        if (/FROM meta_ad_cache/.test(sql)) return { rows: cached ? [cached] : [] };
        if (/FROM credentials/.test(sql)) return { rows: accessToken ? [{ config_json: JSON.stringify({ access_token: accessToken, ad_account_id: 'act_1' }) }] : [] };
        return { rows: [] };
      }
    }
  };
}

function fakeGraph(responses) {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    const key = Object.keys(responses).find((k) => url.includes(k));
    const body = responses[key];
    if (!body) return { ok: false, status: 400, json: async () => ({ error: { message: 'not found' } }) };
    return { ok: true, json: async () => body };
  };
  return { fetchImpl, urls };
}

test('consulta a Marketing API e grava campanha/conjunto/anuncio/conta no cache', async () => {
  const { db, calls } = makeFakeDb();
  const { fetchImpl, urls } = fakeGraph({
    '/120211234567890?': { id: '120211234567890', name: 'AD0103', account_id: '555', adset: { id: '22', name: 'Semelhante 5%' }, campaign: { id: '33', name: 'MALIBU - [MSG] Terça' } },
    '/act_555?': { name: 'Malibu Sushibar - Ads' }
  });

  const result = await resolveAd({ adId: '120211234567890', clientId: 9, db, fetchImpl, now: () => NOW });

  assert.equal(result.campaignName, 'MALIBU - [MSG] Terça');
  assert.equal(result.adsetName, 'Semelhante 5%');
  assert.equal(result.adName, 'AD0103');
  assert.equal(result.accountName, 'Malibu Sushibar - Ads');
  assert.ok(urls[0].includes('access_token=TOKEN'));
  const upsert = calls.find((c) => /INSERT INTO meta_ad_cache/.test(c.sql));
  assert.ok(upsert);
  assert.deepEqual(upsert.params.slice(0, 8), ['120211234567890', 'AD0103', '22', 'Semelhante 5%', '33', 'MALIBU - [MSG] Terça', '555', 'Malibu Sushibar - Ads']);
});

test('usa o cache recente sem chamar a Meta de novo', async () => {
  const cached = { ad_id: '1', ad_name: 'AD', adset_id: '2', adset_name: 'S', campaign_id: '3', campaign_name: 'C', account_id: '4', account_name: 'Conta', fetched_at: new Date(NOW - 60 * 60 * 1000).toISOString() };
  const { db } = makeFakeDb({ cached });
  const { fetchImpl, urls } = fakeGraph({});

  const result = await resolveAd({ adId: '1', clientId: 9, db, fetchImpl, now: () => NOW });

  assert.equal(urls.length, 0);
  assert.equal(result.campaignName, 'C');
});

test('erro da Meta (ex: post impulsionado, token sem permissao) nao lanca -- devolve null', async () => {
  const { db, calls } = makeFakeDb();
  const { fetchImpl } = fakeGraph({});

  const result = await resolveAd({ adId: '999', clientId: 9, db, fetchImpl, now: () => NOW });

  assert.equal(result, null);
  assert.ok(!calls.some((c) => /INSERT INTO meta_ad_cache/.test(c.sql)));
});

test('cliente sem credencial Meta nao consulta nada', async () => {
  const { db } = makeFakeDb({ accessToken: null });
  const { fetchImpl, urls } = fakeGraph({});

  const result = await resolveAd({ adId: '1', clientId: 9, db, fetchImpl, now: () => NOW });

  assert.equal(result, null);
  assert.equal(urls.length, 0);
});
