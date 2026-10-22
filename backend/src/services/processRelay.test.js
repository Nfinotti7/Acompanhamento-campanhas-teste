import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestFromOwner, processRelayQueue, RelayError, pollRelayedEvents } from './processRelay.js';

// Fila baileys_relay em memória, respondendo só às consultas que processRelay.js faz.
function fakeRelayDb() {
  const rows = [];
  const db = {
    rows,
    async query(sql, params = []) {
      const s = sql.replace(/\s+/g, ' ').trim();
      if (s.startsWith('INSERT INTO baileys_relay')) {
        const row = { id: rows.length + 1, client_id: params[0], kind: params[1], payload: JSON.parse(params[2]), status: 'pending' };
        rows.push(row);
        return { rows: [{ id: row.id }] };
      }
      if (s.startsWith('SELECT status, result')) {
        return { rows: rows.filter((r) => r.id === params[0]) };
      }
      if (s.startsWith("UPDATE baileys_relay SET status = 'expired'")) {
        const row = rows.find((r) => r.id === params[0] && r.status === 'pending');
        if (row) row.status = 'expired';
        return { rows: row ? [{ id: row.id }] : [] };
      }
      if (s.startsWith("UPDATE baileys_relay SET status = 'processing'")) {
        const taken = rows.filter((r) => r.status === 'pending');
        taken.forEach((r) => { r.status = 'processing'; });
        return { rows: taken.map((r) => ({ ...r })) };
      }
      if (s.startsWith("UPDATE baileys_relay SET status = 'done'")) {
        const row = rows.find((r) => r.id === params[1]);
        Object.assign(row, { status: 'done', result: JSON.parse(params[0]) });
        return { rows: [] };
      }
      if (s.startsWith("UPDATE baileys_relay SET status = 'error'")) {
        const row = rows.find((r) => r.id === params[2]);
        Object.assign(row, { status: 'error', error: params[0], error_user_facing: params[1] });
        return { rows: [] };
      }
      throw new Error(`consulta inesperada: ${s}`);
    }
  };
  return db;
}

function fakeClock() {
  let t = 0;
  return { now: () => t, sleep: async (ms) => { t += ms; } };
}

test('pedido ao dono: quem não é dono grava o pedido e recebe o resultado que o dono gravou', async () => {
  const db = fakeRelayDb();
  const clock = fakeClock();
  const sent = [];
  // O "dono" atende a fila enquanto quem pediu espera.
  const sleep = async (ms) => {
    await clock.sleep(ms);
    await processRelayQueue({ send: async (clientId, p) => { sent.push({ clientId, ...p }); return { id: 'MSG1' }; } }, { db });
  };

  const result = await requestFromOwner('send', 9, { waId: '5511999998888', body: 'oi' }, { db, now: clock.now, sleep });

  assert.deepEqual(result, { id: 'MSG1' });
  assert.deepEqual(sent, [{ clientId: '9', waId: '5511999998888', body: 'oi' }]);
});

test('pedido ao dono: erro do dono volta como RelayError, com a mensagem dele', async () => {
  const db = fakeRelayDb();
  const clock = fakeClock();
  const sleep = async (ms) => {
    await clock.sleep(ms);
    await processRelayQueue({
      pairing: async () => { const e = new Error('Número inválido.'); e.userFacing = true; throw e; },
      send: async () => { throw new Error('Conexão WhatsApp (Baileys) não está ativa para este cliente.'); }
    }, { db });
  };

  await assert.rejects(
    requestFromOwner('send', 9, {}, { db, now: clock.now, sleep }),
    (e) => e instanceof RelayError && /não está ativa/.test(e.message) && !e.userFacing
  );
  await assert.rejects(
    requestFromOwner('pairing', 9, {}, { db, now: clock.now, sleep }),
    (e) => e instanceof RelayError && e.message === 'Número inválido.' && e.userFacing === true
  );
});

test('pedido ao dono: ninguém atendeu a tempo -> o pedido é cancelado (não sai depois, repetido)', async () => {
  const db = fakeRelayDb();
  const clock = fakeClock();

  await assert.rejects(
    requestFromOwner('send', 9, { body: 'oi' }, { db, ...clock, timeoutMs: 5000 }),
    (e) => e instanceof RelayError && /não respondeu/.test(e.message)
  );
  assert.equal(db.rows[0].status, 'expired');

  // O dono volta depois: o pedido cancelado não é mais executado.
  let called = false;
  await processRelayQueue({ send: async () => { called = true; } }, { db });
  assert.equal(called, false);
});

test('pedido ao dono: o dono pegou mas não terminou a tempo -> avisa pra conferir antes de reenviar', async () => {
  const db = fakeRelayDb();
  const clock = fakeClock();
  const sleep = async (ms) => {
    await clock.sleep(ms);
    db.rows.forEach((r) => { if (r.status === 'pending') r.status = 'processing'; });
  };

  await assert.rejects(
    requestFromOwner('send', 9, { body: 'oi' }, { db, now: clock.now, sleep, timeoutMs: 5000 }),
    (e) => e instanceof RelayError && /Confira na conversa/.test(e.message)
  );
});

test('dono atende os pedidos na ordem em que chegaram', async () => {
  const db = fakeRelayDb();
  for (const body of ['primeira', 'segunda', 'terceira']) {
    await db.query('INSERT INTO baileys_relay (client_id, kind, payload) VALUES (?, ?, ?) RETURNING id', ['9', 'send', JSON.stringify({ body })]);
  }
  db.rows.reverse(); // o banco pode devolver fora de ordem
  const order = [];
  await processRelayQueue({ send: async (_c, p) => { order.push(p.body); return {}; } }, { db });
  assert.deepEqual(order, ['primeira', 'segunda', 'terceira']);
});

test('eventos ao vivo: na primeira leitura só marca onde está (não reentrega o passado)', async () => {
  const db = { query: async () => ({ rows: [{ id: 41 }] }) };
  const delivered = [];
  const last = await pollRelayedEvents(null, (...a) => delivered.push(a), { db });
  assert.equal(last, 41);
  assert.equal(delivered.length, 0);
});

test('eventos ao vivo: entrega o que outros processos geraram e avança o último id', async () => {
  const queries = [];
  const db = {
    query: async (sql, params) => {
      queries.push(params);
      return { rows: [
        { id: 42, client_id: '9', event_name: 'message', data: { contactId: 1 } },
        { id: 44, client_id: '13', event_name: 'waitlist', data: { kind: 'joined' } }
      ] };
    }
  };
  const delivered = [];
  const last = await pollRelayedEvents(41, (...a) => delivered.push(a), { db, instanceId: 'eu' });
  assert.equal(last, 44);
  assert.deepEqual(queries[0], [41, 'eu']); // filtra os eventos do próprio processo
  assert.deepEqual(delivered, [['9', 'message', { contactId: 1 }], ['13', 'waitlist', { kind: 'joined' }]]);
});
