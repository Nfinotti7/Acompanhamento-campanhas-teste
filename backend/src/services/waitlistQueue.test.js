import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildQueue, seatingInterval, estimateWait, daySummary,
  transitionEntry, enterQueue, afterQueueChange, addManualEntry, loadQueueState
} from './waitlistQueue.js';

const NOW = new Date('2026-10-15T23:00:00Z');
const minAgo = (m) => new Date(NOW.getTime() - m * 60000).toISOString();

test('buildQueue numera quem espera por ordem de chegada e ignora chamados e antigos', () => {
  const q = buildQueue([
    { id: 1, status: 'waiting', joined_at: minAgo(30) },
    { id: 2, status: 'called', joined_at: minAgo(40), called_at: minAgo(2) },
    { id: 3, status: 'waiting', joined_at: minAgo(10) },
    { id: 4, status: 'waiting', joined_at: minAgo(60 * 13) }, // mais de 12h: fora
    { id: 5, status: 'seated', joined_at: minAgo(50) },
    { id: 6, status: 'awaiting_size', joined_at: minAgo(1) }
  ], NOW);
  assert.deepEqual(q.waiting.map((e) => [e.id, e.position]), [[1, 1], [3, 2]]);
  assert.deepEqual(q.called.map((e) => e.id), [2]);
  assert.deepEqual(q.awaitingSize.map((e) => e.id), [6]);
});

test('seatingInterval usa o padrão com menos de 3 baixas e a média das últimas 2h depois', () => {
  assert.equal(seatingInterval([minAgo(5), minAgo(15)], { now: NOW, defaultMinutes: 8 }), 8);
  assert.equal(seatingInterval([minAgo(30), minAgo(20), minAgo(10)], { now: NOW, defaultMinutes: 8 }), 10);
  // baixa de 3h atrás não entra; intervalo gigante é limitado a 30
  assert.equal(seatingInterval([minAgo(180), minAgo(100), minAgo(10), minAgo(5)], { now: NOW, defaultMinutes: 8 }), 17.5);
});

test('estimateWait arredonda pra múltiplo de 5, mínimo 5', () => {
  assert.equal(estimateWait(1, 3), 5);
  assert.equal(estimateWait(3, 8), 25);
  assert.equal(estimateWait(2, 10), 20);
});

test('daySummary conta entradas, sentados, desistências e espera média', () => {
  const s = daySummary([
    { status: 'seated', joined_at: minAgo(40), finished_at: minAgo(20) },
    { status: 'seated', joined_at: minAgo(30), finished_at: minAgo(20) },
    { status: 'no_show', joined_at: minAgo(30) },
    { status: 'left', joined_at: minAgo(30) },
    { status: 'waiting', joined_at: minAgo(5) }
  ], NOW);
  assert.deepEqual(s, { total: 5, seated: 2, gaveUp: 2, avgWaitMinutes: 15 });
});

// fake-db por padrão de SQL; cada handler pode ser função (params) => result
function fakeDb(handlers) {
  const calls = [];
  return {
    calls,
    query: async (sql, params = []) => {
      calls.push({ sql, params });
      for (const [pattern, result] of handlers) {
        if (pattern.test(sql)) return typeof result === 'function' ? result(params, sql) : result;
      }
      return { rows: [] };
    }
  };
}

const deps = (extra = {}) => {
  const sent = [];
  const events = [];
  return {
    sent, events,
    deps: {
      send: async (msg) => { sent.push(msg); return 'wamid'; },
      broadcast: (clientId, name, data) => events.push({ clientId, name, data }),
      now: () => NOW,
      ...extra
    }
  };
};

test('transitionEntry chamar manda "mesa pronta" uma vez e atualiza a tela', async () => {
  const entry = { id: 9, client_id: 1, contact_id: 3, name: 'Ana Souza', status: 'called' };
  const db = fakeDb([[/UPDATE waitlist_entries SET status/, { rows: [entry] }]]);
  const { sent, events, deps: d } = deps();
  const result = await transitionEntry(db, { clientId: 1, entryId: 9, action: 'call' }, d);
  assert.equal(result.id, 9);
  assert.equal(sent.length, 1);
  assert.match(sent[0].body, /^Ana, sua mesa está pronta!.*10 minutos/);
  assert.equal(events.at(-1).name, 'waitlist');
});

test('transitionEntry sem linha atualizada (outra recepcionista já fez) não manda nada', async () => {
  const db = fakeDb([[/UPDATE waitlist_entries SET status/, { rows: [] }]]);
  const { sent, deps: d } = deps();
  const result = await transitionEntry(db, { clientId: 1, entryId: 9, action: 'call' }, d);
  assert.equal(result, null);
  assert.equal(sent.length, 0);
});

test('transitionEntry "sentou" não manda mensagem', async () => {
  const db = fakeDb([[/UPDATE waitlist_entries SET status/, { rows: [{ id: 9, client_id: 1, contact_id: 3, status: 'seated' }] }]]);
  const { sent, deps: d } = deps();
  await transitionEntry(db, { clientId: 1, entryId: 9, action: 'seat' }, d);
  assert.equal(sent.length, 0);
});

test('transitionEntry "não veio" respeita notify_no_show desligado', async () => {
  const db = fakeDb([
    [/UPDATE waitlist_entries SET status/, { rows: [{ id: 9, client_id: 1, contact_id: 3, status: 'no_show' }] }],
    [/FROM waitlist_settings/, { rows: [{ notify_no_show: false }] }]
  ]);
  const { sent, deps: d } = deps();
  await transitionEntry(db, { clientId: 1, entryId: 9, action: 'noShow' }, d);
  assert.equal(sent.length, 0);
});

test('a falha no envio não impede a ação de ser gravada', async () => {
  const db = fakeDb([[/UPDATE waitlist_entries SET status/, { rows: [{ id: 9, client_id: 1, contact_id: 3, status: 'called' }] }]]);
  const { deps: d } = deps({ send: async () => { throw new Error('Baileys caiu'); } });
  const result = await transitionEntry(db, { clientId: 1, entryId: 9, action: 'call' }, d);
  assert.equal(result.id, 9);
});

test('afterQueueChange avisa "quase lá" uma vez só por entrada', async () => {
  let claimed = false;
  const entries = [
    { id: 1, client_id: 1, contact_id: 11, status: 'waiting', joined_at: minAgo(30), notified_near: true },
    { id: 2, client_id: 1, contact_id: 12, status: 'waiting', joined_at: minAgo(20), notified_near: true },
    { id: 3, client_id: 1, contact_id: 13, name: 'Bia', status: 'waiting', joined_at: minAgo(10), notified_near: false },
    { id: 4, client_id: 1, contact_id: 14, status: 'waiting', joined_at: minAgo(5), notified_near: false }
  ];
  const db = fakeDb([
    [/SELECT \* FROM waitlist_entries/, { rows: entries }],
    [/SET notified_near = true/, (params) => {
      if (params[0] !== 3 || claimed) return { rows: [] };
      claimed = true;
      return { rows: [{ id: 3 }] };
    }]
  ]);
  const { sent, deps: d } = deps();
  await afterQueueChange(db, 1, d);
  await afterQueueChange(db, 1, d);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].contactId, 13);
  assert.match(sent[0].body, /2 grupos/);
});

test('enterQueue já perto da vez marca notified_near e não manda "quase lá" em seguida', async () => {
  let entries = [{ id: 5, client_id: 1, contact_id: 13, name: 'Caio', status: 'awaiting_size', joined_at: minAgo(1), notified_near: false }];
  const db = fakeDb([
    [/SET status = 'waiting'/, () => {
      entries = [{ ...entries[0], status: 'waiting', party_size: 4, joined_at: NOW.toISOString() }];
      return { rows: entries };
    }],
    [/SELECT \* FROM waitlist_entries/, () => ({ rows: entries })],
    [/SET notified_near = true/, () => {
      if (entries[0].notified_near) return { rows: [] };
      entries = [{ ...entries[0], notified_near: true }];
      return { rows: [{ id: 5 }] };
    }]
  ]);
  const { sent, events, deps: d } = deps();
  await enterQueue(db, { clientId: 1, entryId: 5, partySize: 4, needsCheck: false }, d);
  assert.equal(sent.length, 1);
  assert.match(sent[0].body, /^Pronto, Caio! Você está na fila\. Posição: 1\. Espera estimada: ~10 min/);
  assert.equal(events.at(-1).data.reason, 'joined');
});

test('addManualEntry sem telefone não cria contato nem manda mensagem', async () => {
  const db = fakeDb([
    [/INSERT INTO waitlist_entries/, { rows: [{ id: 8 }] }],
    [/SET status = 'waiting'/, { rows: [{ id: 8, client_id: 1, contact_id: null, status: 'waiting' }] }]
  ]);
  const { sent, deps: d } = deps();
  await addManualEntry(db, { clientId: 1, name: 'Mesa do Zé', phone: '', partySize: 3 }, d);
  assert.equal(sent.length, 0);
  assert.ok(!db.calls.some((c) => /INSERT INTO whatsapp_contacts/.test(c.sql)));
});

test('addManualEntry recusa telefone inválido', async () => {
  const db = fakeDb([]);
  const { deps: d } = deps();
  await assert.rejects(addManualEntry(db, { clientId: 1, name: 'X', phone: '123', partySize: 2 }, d), /Telefone inválido/);
});

test('chamado volta pra fila no mesmo lugar e recebe a posição', async () => {
  let entries = [
    { id: 1, client_id: 1, contact_id: 11, name: 'Ana', status: 'called', joined_at: minAgo(40), called_at: minAgo(2), notified_near: true },
    { id: 2, client_id: 1, contact_id: 12, name: 'Bia', status: 'waiting', joined_at: minAgo(20), notified_near: true }
  ];
  const db = fakeDb([
    [/UPDATE waitlist_entries SET status = \?/, (params, sql) => {
      assert.match(sql, /called_at = NULL/);
      assert.doesNotMatch(sql, /joined_at = CURRENT_TIMESTAMP/);
      entries = entries.map((e) => (e.id === 1 ? { ...e, status: 'waiting', called_at: null } : e));
      return { rows: [entries[0]] };
    }],
    [/SELECT \* FROM waitlist_entries/, () => ({ rows: entries })]
  ]);
  const { sent, deps: d } = deps();
  const r = await transitionEntry(db, { clientId: 1, entryId: 1, action: 'requeue' }, d);
  assert.equal(r.status, 'waiting');
  assert.equal(sent.length, 1);
  assert.match(sent[0].body, /continua na fila\. Posição: 1/);
});

test('chamado mandado pro fim da fila renova a chegada e o aviso de quase lá', async () => {
  let sqlSeen = '';
  const db = fakeDb([
    [/UPDATE waitlist_entries SET status = \?/, (params, sql) => { sqlSeen = sql; return { rows: [{ id: 1, client_id: 1, contact_id: 11, name: 'Ana', status: 'waiting', joined_at: NOW.toISOString() }] }; }],
    [/SELECT \* FROM waitlist_entries/, { rows: [{ id: 1, client_id: 1, contact_id: 11, name: 'Ana', status: 'waiting', joined_at: NOW.toISOString(), notified_near: true }] }]
  ]);
  const { sent, deps: d } = deps();
  await transitionEntry(db, { clientId: 1, entryId: 1, action: 'requeueEnd' }, d);
  assert.match(sqlSeen, /joined_at = CURRENT_TIMESTAMP/);
  assert.match(sqlSeen, /notified_near = false/);
  assert.match(sent[0].body, /voltou pra fila\. Posição: 1/);
});

test('desfazer sentou/não veio volta pra fila sem mandar mensagem', async () => {
  const db = fakeDb([
    [/UPDATE waitlist_entries SET status = \?/, (params) => {
      assert.deepEqual(params.slice(3), ['seated', 'no_show', 'left', 'removed']);
      return { rows: [{ id: 3, client_id: 1, contact_id: 13, status: 'waiting' }] };
    }]
  ]);
  const { sent, deps: d } = deps();
  const r = await transitionEntry(db, { clientId: 1, entryId: 3, action: 'restore' }, d);
  assert.equal(r.status, 'waiting');
  assert.equal(sent.length, 0);
});

test('desfazer quando a pessoa já entrou de novo na fila avisa em vez de duplicar', async () => {
  const db = fakeDb([
    [/UPDATE waitlist_entries SET status = \?/, () => { throw Object.assign(new Error('dup'), { code: '23505' }); }]
  ]);
  const { deps: d } = deps();
  await assert.rejects(transitionEntry(db, { clientId: 1, entryId: 3, action: 'restore' }, d), /já está na fila/);
});

test('loadQueueState lista quem saiu nas últimas 2h, mais recente primeiro', async () => {
  const db = fakeDb([
    [/SELECT \* FROM waitlist_entries/, { rows: [
      { id: 1, status: 'seated', joined_at: minAgo(90), finished_at: minAgo(60) },
      { id: 2, status: 'no_show', joined_at: minAgo(50), finished_at: minAgo(10) },
      { id: 3, status: 'seated', joined_at: minAgo(300), finished_at: minAgo(200) },
      { id: 4, status: 'waiting', joined_at: minAgo(5) }
    ] }]
  ]);
  const state = await loadQueueState(db, 1, NOW);
  assert.deepEqual(state.recent.map((e) => e.id), [2, 1]);
});
