// Testes da terceira leva: fidelidade, fora do horário, perguntas frequentes, painel do dono,
// valor da comanda e conversão offline do Google.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLoyaltyQuery, awardVisit, handleInboundForLoyalty } from './loyalty.js';
import { isAfterHours, handleInboundForAfterHours } from './afterHoursBot.js';
import { matchFaq } from './infoText.js';
import { handleInboundForInfo } from './infoBot.js';
import { DEFAULT_INFO_SETTINGS } from './infoText.js';
import { periodRange, buildHeadline, buildOnboarding, derive } from './ownerSummary.js';
import { recordReservationSpend } from './reservationStore.js';
import { conversionActionResource, googleDateTime, buildClickConversion, fireGoogleSale } from './googleOfflineConversions.js';
import { DEFAULT_FOLLOWUP_SETTINGS } from './followupText.js';

// ---------- Fidelidade ----------

test('consulta de saldo', () => {
  for (const ok of ['pontos', 'Meus pontos', 'meu saldo', 'Saldo!', 'clube', 'quantos pontos eu tenho?']) assert.equal(isLoyaltyQuery(ok), true, ok);
  for (const no of ['quero reservar', 'quanto custa', 'pontos de vista eu tenho muitos aqui']) assert.equal(isLoyaltyQuery(no), false, no);
});

function loyaltyEnv({ enabled = true, goal = 3, existing = 0 } = {}) {
  const rows = [];
  for (let i = 0; i < existing; i++) rows.push({ points: 1, reason: 'visit', reservation_id: 100 + i });
  const sent = [];
  const db = {
    query: async (sql, params = []) => {
      if (/INSERT INTO loyalty_points[\s\S]*'visit'/.test(sql)) {
        if (rows.some((r) => r.reason === 'visit' && r.reservation_id === params[2])) return { rows: [] };
        rows.push({ points: 1, reason: 'visit', reservation_id: params[2] });
        return { rows: [{ id: rows.length }] };
      }
      if (/INSERT INTO loyalty_points[\s\S]*'reward'/.test(sql)) { rows.push({ points: params[2], reason: 'reward' }); return { rows: [] }; }
      if (/SUM\(points\)/.test(sql)) return { rows: [{ balance: rows.reduce((s, r) => s + r.points, 0) }] };
      if (/FROM whatsapp_contacts/.test(sql)) return { rows: [{ profile_name: 'Carlos' }] };
      throw new Error('SQL inesperado: ' + sql);
    }
  };
  return {
    rows, sent,
    deps: {
      db, send: async (m) => { sent.push(m); },
      loadSettings: async () => ({ followup: { ...DEFAULT_FOLLOWUP_SETTINGS, loyalty_enabled: enabled, loyalty_goal: goal } }),
      isBotPaused: async () => false
    }
  };
}
const RES = { id: 1, client_id: 9, contact_id: 3, name: 'Carlos Lima' };

test('fidelidade: soma ponto na visita e avisa', async () => {
  const env = loyaltyEnv();
  const r = await awardVisit(RES, env.deps);
  assert.deepEqual(r, { balance: 1, reward: false });
  assert.match(env.sent[0].body, /1 de 3/);
  assert.equal(env.sent[0].sentBy, 'bot_fidelidade');
  assert.equal(await awardVisit(RES, env.deps), null); // mesma visita não conta duas vezes
});

test('fidelidade: ao completar a meta ganha o prêmio e o saldo desconta', async () => {
  const env = loyaltyEnv({ existing: 2 });
  const r = await awardVisit({ ...RES, id: 50 }, env.deps);
  assert.equal(r.reward, true);
  assert.match(env.sent[0].body, /ganhou uma sobremesa/);
  assert.equal(env.rows.reduce((s, x) => s + x.points, 0), 0);
});

test('fidelidade desligada não soma nem responde', async () => {
  const env = loyaltyEnv({ enabled: false });
  assert.equal(await awardVisit(RES, env.deps), null);
  assert.equal(await handleInboundForLoyalty({ clientId: 9, contactId: 3, body: 'pontos' }, env.deps), 'ignored');
  assert.equal(env.sent.length, 0);
});

test('fidelidade: "pontos" responde o saldo', async () => {
  const env = loyaltyEnv({ existing: 2 });
  assert.equal(await handleInboundForLoyalty({ clientId: 9, contactId: 3, profileName: 'Carlos', body: 'meus pontos' }, env.deps), 'answered');
  assert.match(env.sent[0].body, /2 de 3 pontos/);
  assert.match(env.sent[0].body, /Faltam 1/);
});

// ---------- Fora do horário ----------

test('janela de fora do horário, inclusive atravessando a meia-noite', () => {
  const at = (h, m = 0) => new Date(Date.UTC(2026, 10, 4, h + 3, m)); // hora local de Brasília
  assert.equal(isAfterHours(at(23, 30), '23:00', '10:00'), true);
  assert.equal(isAfterHours(at(2), '23:00', '10:00'), true);
  assert.equal(isAfterHours(at(9, 59), '23:00', '10:00'), true);
  assert.equal(isAfterHours(at(10), '23:00', '10:00'), false);
  assert.equal(isAfterHours(at(15), '23:00', '10:00'), false);
  assert.equal(isAfterHours(at(13), '12:00', '14:00'), true); // janela no mesmo dia
});

function afterEnv({ enabled = true, now = new Date('2026-11-04T05:00:00Z'), recent = false, paused = false } = {}) {
  const sent = [];
  const state = { marked: false, replies: [] };
  const db = {
    query: async (sql) => {
      if (/SET after_hours_at/.test(sql)) { state.marked = true; return { rows: [] }; }
      if (/FROM info_replies/.test(sql)) return { rows: recent ? [{ 1: 1 }] : [] };
      if (/INSERT INTO info_replies/.test(sql)) { state.replies.push(1); return { rows: [] }; }
      throw new Error('SQL inesperado: ' + sql);
    }
  };
  return {
    sent, state,
    deps: {
      db, now: () => now, send: async (m) => { sent.push(m); },
      loadSettings: async () => ({ followup: { ...DEFAULT_FOLLOWUP_SETTINGS, after_hours_enabled: enabled } }),
      isBotPaused: async () => paused
    }
  };
}

test('fora do horário: responde uma vez e marca a conversa', async () => {
  const env = afterEnv(); // 02:00 local
  assert.equal(await handleInboundForAfterHours({ clientId: 9, contactId: 3, profileName: 'Ana Souza' }, env.deps), 'answered');
  assert.match(env.sent[0].body, /Oi, Ana!/);
  assert.match(env.sent[0].body, /a partir das 10h/);
  assert.equal(env.state.marked, true);
});

test('fora do horário: não repete em 12h, mas continua marcando', async () => {
  const env = afterEnv({ recent: true });
  assert.equal(await handleInboundForAfterHours({ clientId: 9, contactId: 3 }, env.deps), 'repeated');
  assert.equal(env.sent.length, 0);
  assert.equal(env.state.marked, true);
});

test('dentro do horário, desligado ou pausado: ignora', async () => {
  assert.equal(await handleInboundForAfterHours({ clientId: 9, contactId: 3 }, afterEnv({ now: new Date('2026-11-04T18:00:00Z') }).deps), 'ignored');
  assert.equal(await handleInboundForAfterHours({ clientId: 9, contactId: 3 }, afterEnv({ enabled: false }).deps), 'ignored');
  assert.equal(await handleInboundForAfterHours({ clientId: 9, contactId: 3 }, afterEnv({ paused: true }).deps), 'paused');
});

// ---------- Perguntas frequentes ----------

const FAQ = [
  { keywords: 'vegano, vegetariano, sem carne', answer: 'Temos opções vegetarianas: *temaki de legumes*.' },
  { keywords: 'estacionamento, manobrista', answer: 'Temos estacionamento gratuito.' },
  { keywords: 'criança', answer: '' }
];

test('perguntas frequentes casam por palavra-chave', () => {
  assert.deepEqual(matchFaq('Vocês têm opção vegana ou vegetariana?', FAQ), [0]);
  assert.deepEqual(matchFaq('tem estacionamento aí?', FAQ), [1]);
  assert.deepEqual(matchFaq('vegetarianos e estacionamento', FAQ), [0, 1]);
  assert.deepEqual(matchFaq('bom dia', FAQ), []);
  assert.deepEqual(matchFaq('aceita criança', FAQ), []); // sem resposta não conta
});

test('infoBot responde a pergunta frequente e não repete', async () => {
  const sent = [];
  const replies = [];
  const db = {
    query: async (sql, params = []) => {
      if (/FROM info_replies/.test(sql)) return { rows: replies.map((topic) => ({ topic })) };
      if (/INSERT INTO info_replies/.test(sql)) { replies.push(params[2]); return { rows: [] }; }
      return { rows: [] };
    }
  };
  const deps = {
    db, now: () => new Date('2026-11-04T15:00:00Z'), typing: async () => {}, send: async (m) => { sent.push(m); },
    loadSettings: async () => ({ bot_enabled: false, info: { ...DEFAULT_INFO_SETTINGS, enabled: true, faq: FAQ } }),
    isBotPaused: async () => false, upcomingReservations: async () => []
  };
  const say = (body) => handleInboundForInfo({ clientId: 9, contactId: 3, waId: '5562999990000', profileName: 'Ana', body }, deps);
  assert.equal(await say('Tem opção vegana?'), 'answered');
  assert.match(sent[0].body, /temaki de legumes/);
  assert.equal(await say('e vegetariana?'), 'repeated');
  assert.equal(sent.length, 1);
});

// ---------- Painel do dono ----------

test('períodos', () => {
  const week = periodRange('week', '2026-11-03');
  assert.deepEqual([week.from, week.to], ['2026-10-27', '2026-11-02']);
  assert.deepEqual([week.previous.from, week.previous.to], ['2026-10-20', '2026-10-26']);
  const last = periodRange('last_month', '2026-11-03');
  assert.deepEqual([last.from, last.to], ['2026-10-01', '2026-10-31']);
  assert.deepEqual([last.previous.from, last.previous.to], ['2026-09-30', '2026-09-30'].length ? [last.previous.from, last.previous.to] : []);
  assert.equal(last.previous.to, '2026-09-30');
  const month = periodRange('month', '2026-11-03');
  assert.deepEqual([month.from, month.to], ['2026-11-01', '2026-11-03']);
  assert.equal(periodRange('last_month', '2026-01-10').from, '2025-12-01');
});

const STATS = {
  conversations: 84, people: 96, reservations: 31, arrived: 24, noShow: 4, cancelled: 5, unmarked: 0, spend: 1260,
  impressions: 48200, clicks: 910, topics: { menu: 22, prices: 0, hours: 0, location: 15, questions: 0 },
  response: { unanswered: 2 }
};

test('frases do painel do dono: conversa, alcance e assuntos antes de reserva', () => {
  const lines = buildHeadline(STATS, { ...STATS, conversations: 60, impressions: 40000 });
  assert.match(lines[0], /84 pessoas chamaram.*\+40%/);
  assert.match(lines[1], /vistos 48\.200 vezes.*\+21%.*910 cliques \(1,9% de quem viu clicou\)/);
  assert.ok(lines.some((l) => /Cada conversa custou R\$\s15,00/.test(l)));
  assert.ok(lines.some((l) => /O que mais procuraram: cardápio \(22\), localização \(15\)/.test(l)));
  assert.ok(lines.some((l) => /31 reservas \(96 pessoas\)/.test(l)));
  assert.ok(lines.some((l) => /86% de quem tinha reserva compareceu/.test(l)));
  assert.ok(lines.some((l) => /2 conversas ficaram sem resposta/.test(l)));
  assert.ok(lines.every((l) => !/ROAS|investid[oa]\.?$/.test(l)));
  const d = derive(STATS);
  assert.equal(d.costPerConversation, 15);
  assert.equal(d.roas, undefined);
});

test('sem reservas, o resumo do dono não cobra reserva nem marcação', () => {
  const lines = buildHeadline({ ...STATS, reservations: 0, people: 0, arrived: 0, noShow: 0, unmarked: 5 }, STATS);
  assert.ok(lines.every((l) => !/reserva|marcação/i.test(l)));
});

test('implantação: só o obrigatório conta pro progresso', () => {
  const none = buildOnboarding({ campaigns: 0, tables: 0, trackingLinks: 0 });
  assert.equal(none.requiredDone, 0);
  assert.ok(none.requiredTotal >= 4);
  const ok = buildOnboarding({ hasMeta: true, campaigns: 3, hasWhatsApp: true, trackingLinks: 1, reservationsEnabled: true, tables: 4, hasHours: true });
  assert.equal(ok.requiredDone, ok.requiredTotal);
  assert.equal(ok.steps.find((s) => s.key === 'reservations').done, true);
  assert.equal(ok.steps.find((s) => s.key === 'review').done, false);
});

// ---------- Valor da comanda ----------

function spendEnv(reservation) {
  const state = { reservation: { ...reservation }, conversions: [], fired: [], staged: [] };
  const db = {
    query: async (sql, params = []) => {
      if (/SELECT \* FROM reservations/.test(sql)) return { rows: [state.reservation] };
      if (/INSERT INTO real_conversions/.test(sql)) { state.conversions.push({ id: 7, amount: params[4] }); return { rows: [{ id: 7 }] }; }
      if (/UPDATE real_conversions SET amount_spent/.test(sql)) { state.conversions[0].amount = params[0]; return { rows: [] }; }
      if (/UPDATE reservations SET amount_spent/.test(sql)) { Object.assign(state.reservation, { amount_spent: params[0], conversion_id: params[1] }); return { rows: [] }; }
      throw new Error('SQL inesperado: ' + sql);
    }
  };
  const deps = {
    broadcast: () => {}, inBackground: () => {},
    fireSale: (a) => { state.fired.push(a); return Promise.resolve(); },
    moveToAutoStage: async (_db, a) => { state.staged.push(a); }
  };
  return { state, db, deps };
}

test('valor da comanda cria a venda uma vez e depois só atualiza', async () => {
  const env = spendEnv({ id: 5, client_id: 9, contact_id: 3, name: 'Carlos', phone: '5562999990000', conversion_id: null });
  const r = await recordReservationSpend(env.db, { clientId: 9, id: 5, amount: '350.5' }, env.deps);
  assert.equal(r.amount_spent, 350.5);
  assert.equal(env.state.conversions.length, 1);
  assert.equal(env.state.fired.length, 1);
  assert.deepEqual(env.state.staged[0], { clientId: 9, contactId: 3, event: 'venda' });
  await recordReservationSpend(env.db, { clientId: 9, id: 5, amount: 400 }, env.deps);
  assert.equal(env.state.conversions.length, 1);
  assert.equal(env.state.conversions[0].amount, 400);
  assert.equal(env.state.fired.length, 1); // não reenvia o evento
});

test('valor inválido é recusado e zero não cria venda', async () => {
  const env = spendEnv({ id: 5, client_id: 9, contact_id: 3, conversion_id: null });
  await assert.rejects(() => recordReservationSpend(env.db, { clientId: 9, id: 5, amount: 'abc' }, env.deps));
  await assert.rejects(() => recordReservationSpend(env.db, { clientId: 9, id: 5, amount: -3 }, env.deps));
  await recordReservationSpend(env.db, { clientId: 9, id: 5, amount: 0 }, env.deps);
  assert.equal(env.state.conversions.length, 0);
});

// ---------- Google offline ----------

test('formatos do Google', () => {
  assert.equal(googleDateTime(new Date('2026-11-03T14:05:09Z')), '2026-11-03 14:05:09+00:00');
  assert.equal(conversionActionResource('456', '123-456-7890'), 'customers/1234567890/conversionActions/456');
  assert.equal(conversionActionResource('customers/1/conversionActions/2', '9'), 'customers/1/conversionActions/2');
  assert.equal(conversionActionResource('', '9'), null);
  const c = buildClickConversion({ gclid: 'abc', conversionAction: 'customers/1/conversionActions/2', time: new Date('2026-11-03T14:05:09Z'), value: 350, orderId: 'g-sale-7' });
  assert.deepEqual(c, { gclid: 'abc', conversionAction: 'customers/1/conversionActions/2', conversionDateTime: '2026-11-03 14:05:09+00:00', conversionValue: 350, currencyCode: 'BRL', orderId: 'g-sale-7' });
});

function googleEnv({ enabled = true, gclid = 'gclid123', failUpload = false } = {}) {
  const log = [];
  const uploads = [];
  const db = {
    query: async (sql, params = []) => {
      if (/FROM capi_settings cs/.test(sql)) {
        return { rows: [{ google_enabled: enabled, google_conversion_action: '456', gclid,
          config_json: JSON.stringify({ customer_id: '123-456-7890', client_id: 'x', client_secret: 'y', refresh_token: 'z' }) }] };
      }
      if (/INSERT INTO conversion_events/.test(sql)) {
        if (log.some((l) => l.event_id === params[2] && l.status !== 'failed')) return { rows: [] };
        log.push({ id: log.length + 1, event_id: params[2], status: 'pending' });
        return { rows: [{ id: log.length }] };
      }
      if (/UPDATE conversion_events SET status = 'sent'/.test(sql)) { log[params[0] - 1].status = 'sent'; return { rows: [] }; }
      if (/UPDATE conversion_events SET status = 'failed'/.test(sql)) { log[params[1] - 1].status = 'failed'; log[params[1] - 1].error = params[0]; return { rows: [] }; }
      throw new Error('SQL inesperado: ' + sql);
    }
  };
  const fetch = async (url, init) => {
    uploads.push({ url, body: JSON.parse(init.body) });
    if (failUpload) return { ok: false, status: 400, text: async () => JSON.stringify({ error: { message: 'gclid inválido' } }) };
    return { ok: true, status: 200, text: async () => '{}' };
  };
  return { db, log, uploads, deps: { db, fetch, getAccessToken: async () => 'tok' } };
}

test('google: envia a venda com gclid e registra', async () => {
  const env = googleEnv();
  const r = await fireGoogleSale({ clientId: 9, contactId: 3, conversionId: 7, value: 350 }, env.deps);
  assert.equal(r.status, 'sent');
  assert.match(env.uploads[0].url, /customers\/1234567890:uploadClickConversions$/);
  assert.equal(env.uploads[0].body.conversions[0].gclid, 'gclid123');
  assert.equal(env.uploads[0].body.conversions[0].conversionAction, 'customers/1234567890/conversionActions/456');
  assert.equal(env.log[0].status, 'sent');
  assert.equal((await fireGoogleSale({ clientId: 9, contactId: 3, conversionId: 7, value: 350 }, env.deps)).status, 'duplicate');
  assert.equal(env.uploads.length, 1);
});

test('google: sem gclid ou desligado não envia; erro fica registrado', async () => {
  assert.equal((await fireGoogleSale({ clientId: 9, contactId: 3, conversionId: 7, value: 1 }, googleEnv({ gclid: null }).deps)).status, 'disabled');
  assert.equal((await fireGoogleSale({ clientId: 9, contactId: 3, conversionId: 7, value: 1 }, googleEnv({ enabled: false }).deps)).status, 'disabled');
  const bad = googleEnv({ failUpload: true });
  const r = await fireGoogleSale({ clientId: 9, contactId: 3, conversionId: 7, value: 1 }, bad.deps);
  assert.equal(r.status, 'failed');
  assert.match(r.error, /gclid inválido/);
  assert.equal(bad.log[0].status, 'failed');
});
