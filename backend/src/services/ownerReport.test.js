import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildOwnerReport, isReportTime, lastWeekRange, runWeeklyReports } from './ownerReport.js';
import { DEFAULT_FOLLOWUP_SETTINGS } from './followupText.js';

const range = { from: '2026-10-26', to: '2026-11-01' };
const stats = {
  conversations: 84, fromAds: 61, reservations: 31, people: 96, arrived: 24, noShow: 4, cancelled: 5, unmarked: 3,
  confirmedByClient: 12, ratings: 12, avgRating: 4.6, spend: 1260, impressions: 48200, clicks: 910,
  topics: { menu: 22, prices: 9, hours: 4, location: 15, questions: 3 },
  topCampaignConversations: { name: 'Reservas Rodízio', count: 40 },
  response: { answered: 70, medianMinutes: 0.4, within5Pct: 0.91, unanswered: 2 }
};

test('a segunda-feira depois das 9h em Brasília é hora do relatório', () => {
  assert.equal(isReportTime(new Date('2026-11-02T12:00:00Z')), true); // seg 09:00 local
  assert.equal(isReportTime(new Date('2026-11-02T11:59:00Z')), false); // seg 08:59
  assert.equal(isReportTime(new Date('2026-11-03T15:00:00Z')), false); // terça
  assert.deepEqual(lastWeekRange('2026-11-02'), { from: '2026-10-26', to: '2026-11-01', key: '2026-11-02' });
});

test('texto do relatório mostra alcance, custo por conversa e assuntos, sem ROAS', () => {
  const text = buildOwnerReport({ restaurant: 'Malibu', range, stats });
  assert.match(text, /\*Resumo da semana — Malibu\*/);
  assert.match(text, /26\/10 a 01\/11/);
  assert.match(text, /Conversas novas: \*84\* \(61 vindas de anúncio\)/);
  assert.match(text, /Anúncios vistos \*48\.200\* vezes, com \*910\* cliques/);
  assert.match(text, /R\$\s1\.260,00 → \*R\$\s15,00\* por conversa/);
  assert.match(text, /O que mais procuraram: cardápio \(22\), localização \(15\), preços \(9\), horário \(4\), outras dúvidas \(3\)/);
  assert.match(text, /Reservas: \*31\* \(96 pessoas\)/);
  assert.match(text, /Comparecimento: \*86%\*/);
  assert.match(text, /Campanha que mais trouxe conversas: Reservas Rodízio \(40\)/);
  assert.doesNotMatch(text, /ROAS|retorno de|Faturamento|por reserva/i);
});

test('sem reservas o relatório não fala de reserva', () => {
  const empty = { ...stats, reservations: 0, people: 0, arrived: 0, noShow: 0, cancelled: 0, unmarked: 0, confirmedByClient: 0, ratings: 0, avgRating: null, topics: {}, impressions: 0, clicks: 0, spend: 0, topCampaignConversations: null, response: {} };
  const text = buildOwnerReport({ restaurant: 'Malibu', range, stats: empty });
  assert.doesNotMatch(text, /Reservas/);
  assert.doesNotMatch(text, /Investido|Anúncios vistos|procuraram|Avaliação/);
  assert.match(text, /Conversas novas: \*84\*/);
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

test('erro ao montar o resumo libera a semana pra tentar de novo', async () => {
  const claims = new Set();
  let breakStats = true;
  const db = {
    query: async (sql, params = []) => {
      if (/FROM clients cl/.test(sql)) return { rows: [{ id: 9, name: 'Malibu' }] };
      if (/INSERT INTO owner_reports/.test(sql)) {
        const k = `${params[0]}:${params[1]}`;
        if (claims.has(k)) return { rows: [] };
        claims.add(k);
        return { rows: [{ client_id: 9 }] };
      }
      if (/DELETE FROM owner_reports/.test(sql)) { claims.clear(); return { rows: [] }; }
      if (breakStats && /FROM whatsapp_contacts/.test(sql)) throw new Error('consulta quebrou');
      return { rows: [{}] };
    }
  };
  const sent = [];
  const deps = {
    db, now: () => new Date('2026-11-02T13:00:00Z'),
    loadSettings: async () => ({ followup: { ...DEFAULT_FOLLOWUP_SETTINGS, report_enabled: true, owner_phones: '62999990000' } }),
    sendRaw: async (clientId, phone, body) => { sent.push(body); }
  };
  assert.equal(await runWeeklyReports(deps), 0);
  assert.equal(claims.size, 0);
  breakStats = false;
  assert.equal(await runWeeklyReports(deps), 1);
  assert.equal(sent.length, 1);
});
