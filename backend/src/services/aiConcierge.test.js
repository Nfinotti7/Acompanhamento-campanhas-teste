import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  handleInboundForAi, runAiTurn, recoverPendingAiReplies, RECOVER_WINDOW_MS, DEBOUNCE_MS, MAX_TOOL_ROUNDS, MAX_REPLIES_PER_HOUR
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

test('promessa de chamar a equipe sem repasse avisa a equipe mesmo assim', async () => {
  const { deps, args, state, contactId } = setup({
    results: [say('Pra grupos maiores eu preciso olhar com a equipe, só um momento 😊')]
  });
  assert.equal(await runAiTurn(args, deps), 'answered');
  assert.equal(state.sent.length, 1);
  assert.deepEqual(state.broadcasts, [[9, 'reservation', { contactId, needsAttention: true }]]);
});

test('resposta comum não avisa a equipe', async () => {
  const { deps, args, state } = setup({ results: [say('Oi! Pra quantas pessoas?')] });
  await runAiTurn(args, deps);
  assert.deepEqual(state.broadcasts, []);
});

test('com repasse feito, a promessa não gera um segundo aviso', async () => {
  const { deps, args, state } = setup({
    results: [call('handoff_to_staff', { reason: 'grupo grande' }), say('Só um momento, vou chamar a equipe 😊')]
  });
  await runAiTurn(args, deps);
  assert.deepEqual(state.broadcasts, []); // quem avisa é a própria ferramenta de repasse (aiTools.js)
});

test('nova mensagem enquanto o Gemini ainda responde: os turnos do contato rodam um de cada vez', async () => {
  const { deps, args, state } = setup({ results: [say('Primeira'), say('Segunda')] });
  let active = 0;
  let maxActive = 0;
  const generate = deps.generate;
  deps.generate = async (req) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 30));
    try { return await generate(req); } finally { active -= 1; }
  };
  const timers = fakeTimers();
  const d = { ...deps, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout };
  await handleInboundForAi(args, d);
  const first = timers.timers[0].fn(); // o primeiro turno começa e demora
  await handleInboundForAi({ ...args, body: 'e mais uma coisa' }, d);
  const second = timers.timers[1].fn(); // a espera da nova mensagem acaba com o primeiro ainda rodando
  await Promise.all([first, second]);
  assert.equal(maxActive, 1);
  assert.equal(state.generated.length, 2);
});

test('a auditoria marca a ferramenta que deu erro (create_reservation!tool_error)', async () => {
  const { deps, args, state } = setup({
    results: [call('create_reservation', { name: 'Ana', date: '2026-11-20', time: '19:00', party_size: 2 }), say('Já aviso a equipe 😊')],
    toolImpl: async () => ({ error: 'tool_error', message: 'x' })
  });
  await runAiTurn(args, deps);
  assert.deepEqual(state.audits[0][6], ['create_reservation!tool_error']);
});

test('comentário interno do modelo não vai para o cliente', async () => {
  const { deps, args, state } = setup({
    results: [say('Vou verificar com a equipe, só um momento! 😊\n*(Handoff acionado devido a dúvida sobre política da casa)*')]
  });
  await runAiTurn(args, deps);
  assert.equal(state.sent[0].body, 'Vou verificar com a equipe, só um momento! 😊');
});

test('nome de ferramenta solto e parênteses comuns: só o interno é removido', async () => {
  const { deps, args, state } = setup({
    results: [say('Posso confirmar (ex.: 18:15)? Usei check_availability para ver.')]
  });
  await runAiTurn(args, deps);
  assert.equal(state.sent[0].body, 'Posso confirmar (ex.: 18:15)? Usei para ver.');
});

test('resposta que só tinha comentário interno vira falha e cai nos robôs antigos', async () => {
  const { deps, args, state } = setup({ results: [say('*(handoff_to_staff acionado)*')] });
  assert.equal(await runAiTurn(args, deps), 'failed');
  assert.equal(state.sent.length, 0);
  assert.equal(state.failures, 1);
});

// --- Recuperar conversas que ficaram sem resposta por causa de um reinício ---
const rowsFor = (...contacts) => contacts.map(([contact_id, client_id, wa_id]) => ({
  contact_id, client_id, wa_id, profile_name: 'Fulano', restaurant_name: 'Malibu Sushibar'
}));

function recoverSetup({ rows, settingsByClient }) {
  const queries = [];
  const enqueued = [];
  const deps = {
    db: { query: async (sql, params) => { queries.push({ sql, params }); return { rows }; } },
    now: () => NOW,
    loadSettings: async (_db, clientId) => settingsByClient[clientId],
    enqueue: async (args) => { enqueued.push(args); return 'queued'; }
  };
  return { deps, queries, enqueued };
}

test('recuperar: responde quem ficou sem resposta nos últimos minutos, só com a IA ligada para o contato', async () => {
  const on = { ...SETTINGS, ai: { ...SETTINGS.ai, enabled: true, test_phones: [] } };
  const off = { ...SETTINGS, ai: { ...SETTINGS.ai, enabled: false } };
  const testMode = { ...SETTINGS, ai: { ...SETTINGS.ai, enabled: true, test_phones: ['62981479196'] } };
  const { deps, queries, enqueued } = recoverSetup({
    rows: rowsFor([1, 9, '5562981112222'], [2, 5, '5562983334444'], [3, 7, '556281479196'], [4, 7, '556281470000'], [5, 9, '120363025246125486']),
    settingsByClient: { 9: on, 5: off, 7: testMode }
  });
  const n = await recoverPendingAiReplies(deps);
  assert.equal(n, 2);
  assert.deepEqual(enqueued.map((a) => a.contactId), [1, 3]); // cliente 5 desligado, 4 fora da lista de teste, 5 é grupo
  assert.deepEqual(enqueued[0], { clientId: 9, contactId: 1, waId: '5562981112222', profileName: 'Fulano', restaurantName: 'Malibu Sushibar' });
  assert.equal(queries.length, 1);
  assert.deepEqual(queries[0].params, [new Date(NOW.getTime() - RECOVER_WINDOW_MS)]);
});

test('recuperar: sem conversas pendentes não faz nada', async () => {
  const { deps, enqueued } = recoverSetup({ rows: [], settingsByClient: {} });
  assert.equal(await recoverPendingAiReplies(deps), 0);
  assert.equal(enqueued.length, 0);
});

test('falha depois de update_reservation também não cai nos robôs: avisa a equipe', async () => {
  const { deps, args, state, contactId } = setup({
    results: [call('update_reservation', { reservation_id: 5, time: '19:30' }), new GeminiError('Gemini: erro HTTP 429.')]
  });
  assert.equal(await runAiTurn(args, deps), 'failed');
  assert.equal(state.failures, 0);
  assert.deepEqual(state.broadcasts, [[9, 'reservation', { contactId, needsAttention: true }]]);
});
