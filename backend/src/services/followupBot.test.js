import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runReminders, runReviewRequests, handleInboundForFollowup } from './followupBot.js';
import { DEFAULT_FOLLOWUP_SETTINGS } from './followupText.js';

// Sábado 7/11/2026, reserva às 19:00 em Brasília (22:00Z) para 4 pessoas.
const START = new Date('2026-11-07T22:00:00Z');
const base = {
  id: 1, client_id: 9, contact_id: 3, name: 'Carlos Eduardo Lima', profile_name: 'Carlos', wa_id: '5562999990000',
  restaurant_name: 'Malibu', party_size: 4, starts_at: START, ends_at: new Date('2026-11-08T00:00:00Z'),
  created_at: new Date('2026-11-05T12:00:00Z'), status: 'confirmed', reminder_sent_at: null, client_confirmed_at: null,
  review_requested_at: null, rating: null
};

function setup({ reservation = {}, followup = {}, now, paused = false, sendFails = false } = {}) {
  const r = { ...base, ...reservation };
  const state = { r, sent: [], paused, broadcasts: [], pausedCalls: 0 };
  const db = {
    query: async (sql, params = []) => {
      if (/^\s*SELECT r\.\*/.test(sql)) {
        // O filtro de status mora no SQL; o fake repete as regras principais.
        if (/r\.status = 'arrived'/.test(sql)) {
          const ok = state.r.status === 'arrived' || (state.r.status === 'confirmed' && state.r.client_confirmed_at);
          return { rows: ok ? [state.r] : [] };
        }
        return { rows: state.r.status === 'confirmed' ? [state.r] : [] };
      }
      if (/SET reminder_sent_at = \? WHERE id = \? AND reminder_sent_at IS NULL/.test(sql)) {
        if (state.r.reminder_sent_at) return { rows: [] };
        state.r.reminder_sent_at = params[0];
        return { rows: [{ id: state.r.id }] };
      }
      if (/SET reminder_sent_at = NULL/.test(sql)) { state.r.reminder_sent_at = null; return { rows: [] }; }
      if (/SET review_requested_at = \? WHERE id = \? AND review_requested_at IS NULL/.test(sql)) {
        if (state.r.review_requested_at) return { rows: [] };
        state.r.review_requested_at = params[0];
        return { rows: [{ id: state.r.id }] };
      }
      if (/SET review_requested_at = NULL/.test(sql)) { state.r.review_requested_at = null; return { rows: [] }; }
      if (/SELECT id FROM reservations[\s\S]*review_requested_at IS NOT NULL/.test(sql)) {
        return { rows: state.r.review_requested_at && state.r.rating === null ? [{ id: state.r.id }] : [] };
      }
      if (/SET rating = \?/.test(sql)) { state.r.rating = params[0]; return { rows: [] }; }
      if (/SELECT id, starts_at FROM reservations/.test(sql)) {
        return { rows: state.r.reminder_sent_at && !state.r.client_confirmed_at ? [{ id: state.r.id, starts_at: state.r.starts_at }] : [] };
      }
      if (/SET client_confirmed_at = \?/.test(sql)) { state.r.client_confirmed_at = params[0]; return { rows: [] }; }
      throw new Error('SQL inesperado: ' + sql);
    }
  };
  const deps = {
    db,
    now: () => now,
    send: async (m) => { if (sendFails) throw new Error('WhatsApp desconectado'); state.sent.push(m); return 'w'; },
    broadcast: (...a) => state.broadcasts.push(a),
    loadSettings: async () => ({ followup: { ...DEFAULT_FOLLOWUP_SETTINGS, ...followup } }),
    isBotPaused: async () => state.paused,
    pauseBot: async () => { state.pausedCalls += 1; }
  };
  return { state, deps };
}

const AT_16H = new Date('2026-11-07T19:30:00Z'); // 16:30 local, 2h30 antes

test('lembrete: manda com dia, hora e pessoas, uma vez só', async () => {
  const { state, deps } = setup({ followup: { reminder_enabled: true }, now: AT_16H });
  assert.equal(await runReminders(deps), 1);
  assert.equal(state.sent.length, 1);
  assert.equal(state.sent[0].sentBy, 'bot_lembrete');
  assert.match(state.sent[0].body, /Oi, Carlos!/);
  assert.match(state.sent[0].body, /Malibu/);
  assert.match(state.sent[0].body, /19h/);
  assert.match(state.sent[0].body, /4 pessoas/);
  assert.equal(await runReminders(deps), 0);
  assert.equal(state.sent.length, 1);
});

test('lembrete: desligado, ou cedo demais, não manda', async () => {
  const off = setup({ now: AT_16H });
  assert.equal(await runReminders(off.deps), 0);
  const early = setup({ followup: { reminder_enabled: true }, now: new Date('2026-11-07T17:00:00Z') });
  assert.equal(await runReminders(early.deps), 0);
});

test('lembrete: falha no envio libera pra tentar de novo', async () => {
  const { state, deps } = setup({ followup: { reminder_enabled: true }, now: AT_16H, sendFails: true });
  assert.equal(await runReminders(deps), 0);
  assert.equal(state.r.reminder_sent_at, null);
});

test('SIM depois do lembrete confirma a presença e agradece', async () => {
  const { state, deps } = setup({ followup: { reminder_enabled: true }, now: AT_16H });
  await runReminders(deps);
  state.sent.length = 0;
  const result = await handleInboundForFollowup({ clientId: 9, contactId: 3, profileName: 'Carlos', body: 'Sim!' }, deps);
  assert.equal(result, 'presence_confirmed');
  assert.ok(state.r.client_confirmed_at);
  assert.match(state.sent[0].body, /confirmada/i);
});

test('SIM sem lembrete enviado é ignorado', async () => {
  const { state, deps } = setup({ followup: { reminder_enabled: true }, now: AT_16H });
  assert.equal(await handleInboundForFollowup({ clientId: 9, contactId: 3, body: 'sim' }, deps), 'ignored');
  assert.equal(state.sent.length, 0);
});

const AFTER = new Date('2026-11-08T00:40:00Z'); // 21:40 local, depois do fim da reserva

test('avaliação: só quem chegou (ou confirmou presença) recebe', async () => {
  const none = setup({ followup: { review_enabled: true }, now: AFTER });
  assert.equal(await runReviewRequests(none.deps), 0);
  const arrived = setup({ reservation: { status: 'arrived' }, followup: { review_enabled: true }, now: AFTER });
  assert.equal(await runReviewRequests(arrived.deps), 1);
  assert.equal(arrived.state.sent[0].sentBy, 'bot_avaliacao');
  assert.match(arrived.state.sent[0].body, /De 1 a 5/);
  const confirmed = setup({ reservation: { client_confirmed_at: new Date() }, followup: { review_enabled: true }, now: AFTER });
  assert.equal(await runReviewRequests(confirmed.deps), 1);
});

test('avaliação: não atravessa conversa da equipe', async () => {
  const { state, deps } = setup({ reservation: { status: 'arrived' }, followup: { review_enabled: true }, now: AFTER, paused: true });
  assert.equal(await runReviewRequests(deps), 0);
  assert.equal(state.sent.length, 0);
  assert.equal(state.r.review_requested_at, null);
});

test('nota alta: agradece com o link do Google', async () => {
  const { state, deps } = setup({
    reservation: { status: 'arrived' },
    followup: { review_enabled: true, google_review_url: 'https://g.page/r/abc/review' }, now: AFTER
  });
  await runReviewRequests(deps);
  state.sent.length = 0;
  assert.equal(await handleInboundForFollowup({ clientId: 9, contactId: 3, profileName: 'Carlos', body: '5' }, deps), 'rated_high');
  assert.equal(state.r.rating, 5);
  assert.match(state.sent[0].body, /https:\/\/g\.page\/r\/abc\/review/);
  assert.equal(state.pausedCalls, 0);
});

test('nota alta sem link: só agradece', async () => {
  const { state, deps } = setup({ reservation: { status: 'arrived' }, followup: { review_enabled: true }, now: AFTER });
  await runReviewRequests(deps);
  state.sent.length = 0;
  await handleInboundForFollowup({ clientId: 9, contactId: 3, body: '4' }, deps);
  assert.doesNotMatch(state.sent[0].body, /https?:/);
});

test('nota baixa: pede desculpas, pausa o robô e chama a equipe', async () => {
  const { state, deps } = setup({ reservation: { status: 'arrived' }, followup: { review_enabled: true }, now: AFTER });
  await runReviewRequests(deps);
  state.sent.length = 0;
  assert.equal(await handleInboundForFollowup({ clientId: 9, contactId: 3, body: '2' }, deps), 'rated_low');
  assert.equal(state.r.rating, 2);
  assert.equal(state.pausedCalls, 1);
  assert.ok(state.broadcasts.some(([, , data]) => data.needsAttention));
  assert.match(state.sent[0].body, /sinto muito/i);
});

test('número solto sem pergunta de nota pendente é ignorado', async () => {
  const { state, deps } = setup({ followup: { review_enabled: true }, now: AFTER });
  assert.equal(await handleInboundForFollowup({ clientId: 9, contactId: 3, body: '3' }, deps), 'ignored');
  assert.equal(state.sent.length, 0);
});

test('texto comum é ignorado sem nem ler o banco', async () => {
  const { deps } = setup({ now: AFTER });
  deps.db = { query: async () => { throw new Error('não devia consultar'); } };
  assert.equal(await handleInboundForFollowup({ clientId: 9, contactId: 3, body: 'Qual o cardápio?' }, deps), 'ignored');
});
