import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  handleInboundForAi, runAiTurn, DEBOUNCE_MS, MAX_TOOL_ROUNDS, MAX_REPLIES_PER_HOUR
} from './aiConcierge.js';
import { GeminiError } from './geminiClient.js';
import { DEFAULT_AI_SETTINGS } from './aiConfig.js';
import { DEFAULT_RESERVATION_SETTINGS } from './reservationSlots.js';

const NOW = new Date('2026-11-17T15:00:00Z');
const SETTINGS = {
  ...DEFAULT_RESERVATION_SETTINGS,
  tables: [{ seats: 6, count: 2 }],
  info: { menu: 'Cardápio', prices: 'Rodízio R$ 129', hours: '', location: '', other: '', faq: [] },
  ai: { ...DEFAULT_AI_SETTINGS, enabled: true }
};

const usage = { in: 100, out: 10 };
const say = (text) => ({ parts: [{ text }], text, functionCalls: [], usage });
const call = (name, args = {}) => ({ parts: [{ functionCall: { name, args } }], text: '', functionCalls: [{ name, args }], usage });

let nextContact = 1000;
function setup({
  history = [{ direction: 'inbound', body: 'Oi, queria reservar' }],
  results = [say('Oi! Pra quantas pessoas?')],
  pausedSequence = null,
  recentReplies = 0,
  toolImpl = async () => ({ ok: true }),
  sendImpl = null
} = {}) {
  const contactId = nextContact++;
  const state = { generated: [], sent: [], audits: [], tools: [], broadcasts: [], failures: 0, handoffDone: false, pauseChecks: 0 };
  const queue = [...results];
  const db = {
    query: async (sql, params = []) => {
      if (/FROM ai_replies/.test(sql)) return { rows: [{ n: recentReplies }] };
      if (/INSERT INTO ai_replies/.test(sql)) { state.audits.push(params); return { rows: [] }; }
      if (/FROM whatsapp_messages/.test(sql)) return { rows: history };
      return { rows: [] };
    }
  };
  const deps = {
    db,
    now: () => NOW,
    loadSettings: async () => SETTINGS,
    upcomingReservations: async () => [],
    isBotPaused: async () => {
      if (state.handoffDone) return true;
      const i = state.pauseChecks++;
      return pausedSequence ? Boolean(pausedSequence[Math.min(i, pausedSequence.length - 1)]) : false;
    },
    generate: async (req) => {
      state.generated.push(JSON.parse(JSON.stringify(req)));
      const next = queue.shift();
      if (next instanceof Error) throw next;
      return next;
    },
    runTool: async (name, args, ctx) => {
      state.tools.push([name, args, ctx.contactId]);
      if (name === 'handoff_to_staff') state.handoffDone = true;
      return toolImpl(name, args, ctx);
    },
    typing: async () => {},
    send: sendImpl || (async (m) => { state.sent.push(m); return 'wa-1'; }),
    broadcast: (...a) => state.broadcasts.push(a),
    model: 'gemini-teste'
  };
  const args = {
    clientId: 9, contactId, waId: '5562981479128', profileName: 'Wender Vieira', body: 'Oi', restaurantName: 'Malibu Sushibar',
    onFailure: async () => { state.failures += 1; }
  };
  return { deps, args, state, contactId };
}

function fakeTimers() {
  const timers = [];
  return {
    timers,
    setTimeout: (fn, ms) => { const t = { fn, ms, cleared: false }; timers.push(t); return t; },
    clearTimeout: (t) => { t.cleared = true; },
    fireLive: () => Promise.all(timers.filter((t) => !t.cleared).map((t) => t.fn()))
  };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));

test('5 mensagens seguidas viram uma só resposta', async () => {
  const { deps, args, state } = setup();
  const timers = fakeTimers();
  const d = { ...deps, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout };
  for (let i = 0; i < 5; i++) assert.equal(await handleInboundForAi({ ...args, body: `m${i}` }, d), 'queued');
  assert.equal(timers.timers.length, 5);
  assert.ok(timers.timers.every((t) => t.ms === DEBOUNCE_MS));
  assert.equal(timers.timers.filter((t) => !t.cleared).length, 1);
  await timers.fireLive();
  await flush();
  assert.equal(state.generated.length, 1);
  assert.equal(state.sent.length, 1);
});

test('contatos diferentes não se misturam na espera', async () => {
  const a = setup();
  const b = setup();
  const timers = fakeTimers();
  await handleInboundForAi(a.args, { ...a.deps, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout });
  await handleInboundForAi(b.args, { ...b.deps, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout });
  assert.equal(timers.timers.filter((t) => !t.cleared).length, 2);
});

test('ciclo com ferramenta: executa, devolve o resultado ao modelo e envia o texto final', async () => {
  const { deps, args, state } = setup({
    results: [call('check_availability', { date: '2026-11-20', party_size: 4 }), say('Tenho 19h e 19h30, qual prefere?')],
    toolImpl: async () => ({ times: ['19:00', '19:30'] })
  });
  const r = await runAiTurn(args, deps);
  assert.equal(r, 'answered');
  assert.equal(state.tools.length, 1);
  assert.deepEqual(state.tools[0].slice(0, 2), ['check_availability', { date: '2026-11-20', party_size: 4 }]);
  assert.equal(state.generated.length, 2);
  const secondContents = state.generated[1].contents;
  assert.deepEqual(secondContents.at(-1), {
    role: 'user',
    parts: [{ functionResponse: { name: 'check_availability', response: { times: ['19:00', '19:30'] } } }]
  });
  assert.equal(state.sent.length, 1);
  assert.deepEqual(state.sent[0], { clientId: 9, contactId: args.contactId, sentBy: 'bot_ai', body: 'Tenho 19h e 19h30, qual prefere?' });
  assert.match(state.generated[0].system, /Malibu Sushibar/);
});

test('ferramentas sem fim: falha, cai nos robôs antigos e não envia nada', async () => {
  const { deps, args, state } = setup({ results: Array(10).fill(null).map(() => call('check_availability', { date: '2026-11-20', party_size: 2 })) });
  const r = await runAiTurn(args, deps);
  assert.equal(r, 'failed');
  assert.equal(state.generated.length, MAX_TOOL_ROUNDS + 1);
  assert.equal(state.failures, 1);
  assert.equal(state.sent.length, 0);
});

test('contato pausado: não chama o Gemini', async () => {
  const { deps, args, state } = setup({ pausedSequence: [true] });
  assert.equal(await runAiTurn(args, deps), 'paused');
  assert.equal(state.generated.length, 0);
  assert.equal(state.sent.length, 0);
});

test('a equipe responde durante a chamada ao Gemini: não envia', async () => {
  const { deps, args, state } = setup({ pausedSequence: [false, true] });
  assert.equal(await runAiTurn(args, deps), 'paused');
  assert.equal(state.generated.length, 1);
  assert.equal(state.sent.length, 0);
});

test('Gemini com erro (inclui resposta vazia/bloqueada): falha uma vez e não envia', async () => {
  const { deps, args, state } = setup({ results: [new GeminiError('Gemini: resposta vazia ou bloqueada (SAFETY).')] });
  assert.equal(await runAiTurn(args, deps), 'failed');
  assert.equal(state.failures, 1);
  assert.equal(state.sent.length, 0);
  assert.equal(state.audits.at(-1).at(-1), 'failed');
});

test('handoff: envia a mensagem final mesmo com a IA já pausada pelo repasse', async () => {
  const { deps, args, state } = setup({
    results: [call('handoff_to_staff', { reason: 'grupo de 10, aniversário' }), say('Só um momento, vou verificar a disponibilidade de mesa pra vocês 🙂')]
  });
  const r = await runAiTurn(args, deps);
  assert.equal(r, 'handoff');
  assert.equal(state.sent.length, 1);
  assert.match(state.sent[0].body, /só um momento/i);
  const audit = state.audits.at(-1);
  assert.ok(audit.includes('grupo de 10, aniversário'));
  assert.equal(audit.at(-1), 'handoff');
});

test('limite por hora: não chama o Gemini e avisa a equipe', async () => {
  const { deps, args, state, contactId } = setup({ recentReplies: MAX_REPLIES_PER_HOUR });
  assert.equal(await runAiTurn(args, deps), 'throttled');
  assert.equal(state.generated.length, 0);
  assert.equal(state.sent.length, 0);
  assert.deepEqual(state.broadcasts, [[9, 'reservation', { contactId, needsAttention: true }]]);
});

test('cada rodada grava auditoria com tokens, ferramentas e status', async () => {
  const { deps, args, state, contactId } = setup({
    results: [call('check_availability', { date: '2026-11-20', party_size: 2 }), say('Tenho 19h.')]
  });
  await runAiTurn(args, deps);
  assert.equal(state.audits.length, 1);
  const [clientId, cId, model, tokensIn, tokensOut, latency, tools, handoff, status] = state.audits[0];
  assert.deepEqual([clientId, cId, model, tokensIn, tokensOut], [9, contactId, 'gemini-teste', 200, 20]);
  assert.equal(typeof latency, 'number');
  assert.deepEqual(tools, ['check_availability']);
  assert.equal(handoff, null);
  assert.equal(status, 'answered');
});

test('falha depois de uma ferramenta com efeito não cai nos robôs: avisa a equipe', async () => {
  const { deps, args, state, contactId } = setup({
    results: [call('create_reservation', { name: 'Ana', date: '2026-11-20', time: '19:00', party_size: 2 }), new GeminiError('Gemini: erro HTTP 429.')]
  });
  assert.equal(await runAiTurn(args, deps), 'failed');
  assert.equal(state.failures, 0);
  assert.deepEqual(state.broadcasts, [[9, 'reservation', { contactId, needsAttention: true }]]);
});

test('conversa que já termina com resposta da casa não gera outra', async () => {
  const { deps, args, state } = setup({
    history: [{ direction: 'inbound', body: 'Oi' }, { direction: 'outbound', body: 'Oi! Tudo bem?' }]
  });
  assert.equal(await runAiTurn(args, deps), 'skipped');
  assert.equal(state.generated.length, 0);
});

test('erro ao enviar: falha sem acionar os robôs antigos', async () => {
  const { deps, args, state } = setup({ sendImpl: async () => { throw new Error('sem conexão'); } });
  assert.equal(await runAiTurn(args, deps), 'failed');
  assert.equal(state.failures, 0);
});
