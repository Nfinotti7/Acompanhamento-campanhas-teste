import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildOwnerReport, isReportTime, lastWeekRange, runWeeklyReports } from './ownerReport.js';
import { DEFAULT_FOLLOWUP_SETTINGS } from './followupText.js';

const range = { from: '2026-10-26', to: '2026-11-01' };
const stats = {
  conversations: 84, fromAds: 61, reservations: 31, people: 96, arrived: 24, noShow: 4, cancelled: 5, unmarked: 3,
  confirmedByClient: 12, ratings: 12, avgRating: 4.6, spend: 1250, topCampaign: { name: 'Reservas Rodízio', count: 9 }
};

test('a segunda-feira depois das 9h em Brasília é hora do relatório', () => {
  assert.equal(isReportTime(new Date('2026-11-02T12:00:00Z')), true); // seg 09:00 local
  assert.equal(isReportTime(new Date('2026-11-02T11:59:00Z')), false); // seg 08:59
  assert.equal(isReportTime(new Date('2026-11-03T15:00:00Z')), false); // terça
  assert.deepEqual(lastWeekRange('2026-11-02'), { from: '2026-10-26', to: '2026-11-01', key: '2026-11-02' });
});

test('texto do relatório', () => {
  const text = buildOwnerReport({ restaurant: 'Malibu', range, stats });
  assert.match(text, /\*Resumo da semana — Malibu\*/);
  assert.match(text, /26\/10 a 01\/11/);
  assert.match(text, /Conversas novas: \*84\* \(61 vindas de anúncio\)/);
  assert.match(text, /Reservas: \*31\* \(96 pessoas\)/);
  assert.match(text, /Compareceram: 24/);
  assert.match(text, /Comparecimento: \*86%\*/);
  assert.match(text, /R\$\s1\.250,00/);
  assert.match(text, /R\$\s40,32\*? por reserva/);
  assert.match(text, /\*4,6\*/);
  assert.match(text, /Reservas Rodízio \(9\)/);
});

test('relatório sem reservas nem investimento fica enxuto', () => {
  const empty = { ...stats, reservations: 0, people: 0, arrived: 0, noShow: 0, cancelled: 0, unmarked: 0, confirmedByClient: 0, ratings: 0, avgRating: null, spend: 0, topCampaign: null };
  const text = buildOwnerReport({ restaurant: 'Malibu', range, stats: empty });
  assert.match(text, /Reservas: nenhuma na semana/);
  assert.doesNotMatch(text, /Investido/);
  assert.doesNotMatch(text, /Avaliação/);
});

function weekly({ now, followup }) {
  const claims = new Set();
  const sent = [];
  const db = {
    query: async (sql, params = []) => {
      if (/FROM clients cl/.test(sql)) return { rows: [{ id: 9, name: 'Malibu' }] };
      if (/INSERT INTO owner_reports/.test(sql)) {
        const key = `${params[0]}:${params[1]}`;
        if (claims.has(key)) return { rows: [] };
        claims.add(key);
        return { rows: [{ client_id: 9 }] };
      }
      if (/DELETE FROM owner_reports/.test(sql)) { claims.clear(); return { rows: [] }; }
      return { rows: [{}] }; // estatísticas zeradas
    }
  };
  return {
    sent,
    deps: {
      db, now: () => now,
      loadSettings: async () => ({ followup: { ...DEFAULT_FOLLOWUP_SETTINGS, ...followup } }),
      sendRaw: async (clientId, phone, body) => { sent.push({ clientId, phone, body }); }
    }
  };
}

test('envia uma vez por semana, pros telefones cadastrados', async () => {
  const { deps, sent } = weekly({
    now: new Date('2026-11-02T13:00:00Z'),
    followup: { report_enabled: true, owner_phones: '(62) 99999-0000, 62988887777' }
  });
  assert.equal(await runWeeklyReports(deps), 1);
  assert.deepEqual(sent.map((s) => s.phone), ['5562999990000', '5562988887777']);
  assert.equal(await runWeeklyReports(deps), 0);
  assert.equal(sent.length, 2);
});

test('não envia fora da segunda, desligado ou sem telefone', async () => {
  const tue = weekly({ now: new Date('2026-11-03T13:00:00Z'), followup: { report_enabled: true, owner_phones: '62999990000' } });
  assert.equal(await runWeeklyReports(tue.deps), 0);
  const off = weekly({ now: new Date('2026-11-02T13:00:00Z'), followup: { owner_phones: '62999990000' } });
  assert.equal(await runWeeklyReports(off.deps), 0);
  const noPhone = weekly({ now: new Date('2026-11-02T13:00:00Z'), followup: { report_enabled: true } });
  assert.equal(await runWeeklyReports(noPhone.deps), 0);
});

test('se nada saiu, libera pra tentar de novo', async () => {
  const { deps } = weekly({ now: new Date('2026-11-02T13:00:00Z'), followup: { report_enabled: true, owner_phones: '62999990000' } });
  deps.sendRaw = async () => { throw new Error('desconectado'); };
  assert.equal(await runWeeklyReports(deps), 0);
  deps.sendRaw = async () => {};
  assert.equal(await runWeeklyReports(deps), 1);
});
