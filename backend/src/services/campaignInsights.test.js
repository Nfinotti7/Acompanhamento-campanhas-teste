import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCreativeRanking, summarizeResponseTimes, computeAlerts, buildAlertsMessage, runCampaignAlerts
} from './campaignInsights.js';
import { DEFAULT_FOLLOWUP_SETTINGS } from './followupText.js';

test('ranking: ordena por reservas, calcula custo e no-show por campanha', () => {
  const ads = [
    { ad_id: 'a1', ad_name: 'Vídeo rodízio', campaign_id: 'c1', campaign_name: 'Rodízio', conversations: '20', reservations: '6', arrived: '3', no_show: '1' },
    { ad_id: 'a2', ad_name: 'Foto sushi', campaign_id: 'c1', campaign_name: 'Rodízio', conversations: '15', reservations: '0', arrived: '0', no_show: '0' },
    { ad_id: 'a3', ad_name: 'Promo', campaign_id: 'c2', campaign_name: 'Promo', conversations: '5', reservations: '1', arrived: '0', no_show: '3' }
  ];
  const { ads: ranked, campaigns } = buildCreativeRanking(ads, new Map([['c1', 700], ['c2', 100]]));
  assert.deepEqual(ranked.map((a) => a.adId), ['a1', 'a3', 'a2']);
  assert.equal(ranked[0].verdict, 'escalar'); // 30% contra média ~17%
  assert.equal(ranked[2].verdict, 'pausar'); // 15 conversas, nenhuma reserva
  assert.equal(ranked[1].verdict, null);
  const c1 = campaigns.find((c) => c.campaignId === 'c1');
  assert.equal(c1.conversations, 35);
  assert.equal(c1.reservations, 6);
  assert.equal(c1.costPerReservation, 700 / 6);
  assert.equal(c1.noShowRate, 0.25); // 1 não veio de 4 marcadas
});

test('ranking: no-show só com marcações suficientes', () => {
  const { campaigns } = buildCreativeRanking([
    { ad_id: 'a', campaign_id: 'c', campaign_name: 'C', conversations: 10, reservations: 4, arrived: 1, no_show: 3 }
  ]);
  assert.equal(campaigns[0].noShowRate, 0.75);
  const few = buildCreativeRanking([{ ad_id: 'a', campaign_id: 'c', campaign_name: 'C', conversations: 10, reservations: 2, arrived: 1, no_show: 1 }]);
  assert.equal(few.campaigns[0].noShowRate, null);
});

test('tempo de resposta: mediana, % em 5 min e sem resposta', () => {
  const now = new Date('2026-11-03T20:00:00Z');
  const t = (m) => new Date(new Date('2026-11-03T12:00:00Z').getTime() + m * 60e3);
  const rows = [
    { in_t: t(0), out_t: t(1) },
    { in_t: t(0), out_t: t(3) },
    { in_t: t(0), out_t: t(30) },
    { in_t: t(0), out_t: null }, // sem resposta há horas
    { in_t: new Date(now.getTime() - 5 * 60e3), out_t: null } // chegou agora há pouco: ainda dá tempo
  ];
  const s = summarizeResponseTimes(rows, now);
  assert.equal(s.conversations, 5);
  assert.equal(s.answered, 3);
  assert.equal(s.unanswered, 1);
  assert.equal(s.medianMinutes, 3);
  assert.equal(Math.round(s.within5Pct * 100), 67);
  assert.equal(summarizeResponseTimes([], now).medianMinutes, null);
});

function camp(name, perDay, status = 'ACTIVE') {
  return { id: name, name, status, days: perDay };
}
// Hoje = 2026-11-10; recente = 07, 08, 09; base = 31/10 a 06/11
const TODAY = '2026-11-10';
function days(spec) {
  const out = {};
  for (const [d, spend, conversations] of spec) out[d] = { spend, conversations };
  return out;
}
const BASE = (spend, conv) => ['2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'].map((d) => [d, spend, conv]);

test('alerta: campanha ativa que parou de gastar', () => {
  const alerts = computeAlerts([camp('Rodízio', days(BASE(20, 2)))], TODAY);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].type, 'sem_entrega');
  assert.match(alerts[0].message, /sem entrega/);
});

test('alerta: pausada não conta como sem entrega', () => {
  assert.deepEqual(computeAlerts([camp('Velha', days(BASE(20, 2)), 'PAUSED')], TODAY), []);
});

test('alerta: gastou e não trouxe conversa', () => {
  const d = days([...BASE(20, 2), ['2026-11-07', 20, 0], ['2026-11-08', 20, 0], ['2026-11-09', 20, 0]]);
  const alerts = computeAlerts([camp('Rodízio', d)], TODAY);
  assert.equal(alerts[0].type, 'sem_conversa');
  assert.match(alerts[0].message, /R\$\s60,00/);
});

test('alerta: custo por conversa subiu', () => {
  // base: 140 / 14 = R$ 10 por conversa. recente: 90 / 3 = R$ 30
  const d = days([...BASE(20, 2), ['2026-11-07', 30, 1], ['2026-11-08', 30, 1], ['2026-11-09', 30, 1]]);
  const alerts = computeAlerts([camp('Rodízio', d)], TODAY);
  assert.equal(alerts[0].type, 'cpl_subiu');
  assert.match(alerts[0].message, /200%/);
});

test('sem alerta quando está normal ou o gasto é pequeno', () => {
  const ok = days([...BASE(20, 2), ['2026-11-07', 20, 2], ['2026-11-08', 20, 2], ['2026-11-09', 20, 2]]);
  assert.deepEqual(computeAlerts([camp('Normal', ok)], TODAY), []);
  const small = days([...BASE(20, 2), ['2026-11-07', 5, 0], ['2026-11-08', 5, 0], ['2026-11-09', 5, 0]]);
  assert.deepEqual(computeAlerts([camp('Pequena', small)], TODAY), []);
});

test('mensagem de alertas', () => {
  const text = buildAlertsMessage('Malibu', [{ message: '*A*: x' }, { message: '*B*: y' }]);
  assert.match(text, /Alertas de campanha — Malibu/);
  assert.match(text, /• \*A\*: x\n• \*B\*: y/);
});

test('runCampaignAlerts: manda uma vez por dia, só se ligado e com alerta', async () => {
  const claims = new Set();
  const sent = [];
  const campaignDays = days([...BASE(20, 2)]); // vai gerar "sem entrega"
  const db = {
    query: async (sql, params = []) => {
      if (/FROM clients cl/.test(sql)) return { rows: [{ id: 9, name: 'Malibu' }] };
      if (/FROM daily_metrics/.test(sql)) {
        return { rows: Object.entries(campaignDays).map(([date, v]) => ({ campaign_id: 'c1', name: 'Rodízio', status: 'ACTIVE', date, spend: v.spend })) };
      }
      if (/FROM whatsapp_contacts/.test(sql)) return { rows: [] };
      if (/INSERT INTO owner_reports/.test(sql)) {
        const k = `${params[0]}:${params[1]}`;
        if (claims.has(k)) return { rows: [] };
        claims.add(k);
        return { rows: [{ client_id: 9 }] };
      }
      return { rows: [] };
    }
  };
  const mk = (followup, now = new Date('2026-11-10T13:00:00Z')) => ({
    db, now: () => now,
    loadSettings: async () => ({ followup: { ...DEFAULT_FOLLOWUP_SETTINGS, ...followup } }),
    sendRaw: async (clientId, phone, body) => { sent.push({ phone, body }); }
  });
  assert.equal(await runCampaignAlerts(mk({})), 0); // desligado
  assert.equal(await runCampaignAlerts(mk({ alerts_enabled: true })), 0); // sem telefone
  assert.equal(await runCampaignAlerts(mk({ alerts_enabled: true, alert_phones: '62999990000' }, new Date('2026-11-10T10:00:00Z'))), 0); // 07h local
  assert.equal(await runCampaignAlerts(mk({ alerts_enabled: true, alert_phones: '62999990000' })), 1);
  assert.equal(await runCampaignAlerts(mk({ alerts_enabled: true, alert_phones: '62999990000' })), 0); // já mandou hoje
  assert.equal(sent.length, 1);
  assert.equal(sent[0].phone, '5562999990000');
});
