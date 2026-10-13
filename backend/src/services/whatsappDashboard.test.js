import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDailyOriginSeries, buildDailySalesSeries, summarizeCampaigns } from './whatsappDashboard.js';

test('serie diaria por origem preenche os dias sem conversa com zero', () => {
  const rows = [
    { day: '2026-10-10', origin: 'meta_ads', count: 3 },
    { day: '2026-10-10', origin: 'nao_rastreada', count: 1 },
    { day: '2026-10-12', origin: 'meta_ads', count: 2 }
  ];

  const series = buildDailyOriginSeries(rows, '2026-10-10', '2026-10-12');

  assert.deepEqual(series, [
    { day: '2026-10-10', meta_ads: 3, google_ads: 0, outras: 0, nao_rastreada: 1 },
    { day: '2026-10-11', meta_ads: 0, google_ads: 0, outras: 0, nao_rastreada: 0 },
    { day: '2026-10-12', meta_ads: 2, google_ads: 0, outras: 0, nao_rastreada: 0 }
  ]);
});

test('serie diaria aceita day vindo como Date do Postgres', () => {
  const series = buildDailyOriginSeries([{ day: new Date('2026-10-10T00:00:00.000Z'), origin: 'meta_ads', count: 1 }], '2026-10-10', '2026-10-10');
  assert.equal(series[0].meta_ads, 1);
});

test('serie diaria de vendas soma quantidade e valor por dia', () => {
  const series = buildDailySalesSeries([{ day: '2026-10-11', sales: 2, revenue: 150.5 }], '2026-10-10', '2026-10-11');
  assert.deepEqual(series, [
    { day: '2026-10-10', sales: 0, revenue: 0 },
    { day: '2026-10-11', sales: 2, revenue: 150.5 }
  ]);
});

test('resumo por campanha calcula ROAS e custo por conversa, sem dividir por zero', () => {
  const result = summarizeCampaigns([
    { campaign_id: '1', campaign_name: 'A', conversations: 10, sales: 2, revenue: 400, spend: 100 },
    { campaign_id: '2', campaign_name: 'B', conversations: 5, sales: 0, revenue: 0, spend: 0 }
  ]);

  assert.equal(result[0].roas, 4);
  assert.equal(result[0].costPerConversation, 10);
  assert.equal(result[1].roas, null);
  assert.equal(result[1].costPerConversation, null);
});

test('resumo por campanha ordena por numero de conversas', () => {
  const result = summarizeCampaigns([
    { campaign_id: '1', campaign_name: 'Pouca', conversations: 1, sales: 0, revenue: 0, spend: 0 },
    { campaign_id: '2', campaign_name: 'Muita', conversations: 9, sales: 0, revenue: 0, spend: 0 }
  ]);
  assert.equal(result[0].campaignName, 'Muita');
});
