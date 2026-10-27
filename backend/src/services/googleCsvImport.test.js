import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGoogleAdsCsv, parseNumber, parseDate, summarizeRows } from './googleCsvImport.js';
import { adoptCsvCampaigns } from './syncService.js';

test('parseNumber entende formato brasileiro e americano', () => {
  assert.equal(parseNumber('R$ 1.234,56'), 1234.56);
  assert.equal(parseNumber('1,234.56'), 1234.56);
  assert.equal(parseNumber('12,5'), 12.5);
  assert.equal(parseNumber('1.234'), 1234);
  assert.equal(parseNumber('1,234', { integer: true }), 1234);
  assert.equal(parseNumber(' --'), 0);
  assert.equal(parseNumber(''), 0);
});

test('parseDate aceita ISO, dd/mm/aaaa e mês por extenso', () => {
  assert.equal(parseDate('2026-10-05'), '2026-10-05');
  assert.equal(parseDate('05/10/2026'), '2026-10-05');
  assert.equal(parseDate('5 de out. de 2026'), '2026-10-05');
  assert.equal(parseDate('Oct 5, 2026'), '2026-10-05');
  assert.equal(parseDate('31/02/2026'), null);
  assert.equal(parseDate('Total: conta'), null);
});

test('parseGoogleAdsCsv lê export em português com título, ; e linha de total', () => {
  const csv = [
    'Relatório de campanhas',
    '5 de outubro de 2026 - 26 de outubro de 2026',
    'Status da campanha;Campanha;Dia;Custo;Cliques;Impr.;Conversões;Valor conv.',
    'Ativada;Malibu - Pesquisa;2026-10-05;"R$ 12,50";3;100;1,5;80,00',
    'Ativada;Malibu - Pesquisa;2026-10-06;10,00;2;50;0;0',
    'Pausada;Malibu - PMax;2026-10-05;1.234,56;1.000;20.000;2;100,5',
    'Total: contas;;;1257,06;1005;20150;3,5;180,5'
  ].join('\n');
  const { rows, skipped } = parseGoogleAdsCsv(csv);
  assert.equal(rows.length, 3);
  assert.equal(skipped, 1);
  const a = rows.find((r) => r.campaignName === 'Malibu - Pesquisa' && r.date === '2026-10-05');
  assert.deepEqual(
    [a.spend, a.clicks, a.impressions, a.conversions, a.conversionValue, a.status],
    [12.5, 3, 100, 2, 80, 'ENABLED']
  );
  const pmax = rows.find((r) => r.campaignName === 'Malibu - PMax');
  assert.equal(pmax.spend, 1234.56);
  assert.equal(pmax.clicks, 1000);
  assert.equal(pmax.status, 'PAUSED');
  assert.match(pmax.campaignId, /^csv:/);
  assert.equal(summarizeRows(rows).campaigns, 2);
});

test('parseGoogleAdsCsv lê export em inglês com vírgula e soma linhas repetidas do mesmo dia', () => {
  const csv = [
    'Campaign,Day,Cost,Clicks,Impr.,Conversions,Conv. value',
    'A,2026-10-05,5.00,1,10,0,0',
    'A,2026-10-05,2.50,2,20,1,10'
  ].join('\n');
  const { rows } = parseGoogleAdsCsv(csv);
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].spend, rows[0].clicks, rows[0].impressions, rows[0].conversions], [7.5, 3, 30, 1]);
});

test('parseGoogleAdsCsv explica quando falta a coluna de dia', () => {
  assert.throws(() => parseGoogleAdsCsv('Campanha,Custo\nA,1'), /Dia/);
});

test('adoptCsvCampaigns move o histórico e remove a campanha do CSV só do cliente certo', async () => {
  const calls = [];
  const tx = { query: async (sql, params) => { calls.push({ sql, params }); return { rowCount: 2 }; } };
  const out = await adoptCsvCampaigns(7, 'google', { withTransaction: (fn) => fn(tx) });
  assert.deepEqual(out, { moved: 2, removed: 2 });
  assert.match(calls[0].sql, /UPDATE daily_metrics/);
  assert.match(calls[0].sql, /NOT EXISTS/);
  assert.match(calls[1].sql, /DELETE FROM campaigns/);
  assert.deepEqual(calls[0].params, [7, 'google']);
  assert.deepEqual(calls[1].params, [7, 'google']);
});
