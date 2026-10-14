import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconnectAllBaileysClients, connectClient, getConnectionState, sendViaBaileys, decideOwnership } from './baileysClient.js';

function makeFakeBaileysModule() {
  let makeWASocketCalls = 0;
  const fakeSock = {
    ev: { on: () => {} }
  };
  return {
    module: {
      default: () => { makeWASocketCalls++; return fakeSock; },
      useMultiFileAuthState: async () => ({ state: {}, saveCreds: () => {} }),
      DisconnectReason: { loggedOut: 401 }
    },
    getCallCount: () => makeWASocketCalls
  };
}

function makeFakeDb(rows) {
  return { query: async () => ({ rows }) };
}

test('reconnectAllBaileysClients chama connect pra cada cliente configurado como baileys', async () => {
  const db = makeFakeDb([{ client_id: 5 }, { client_id: 9 }]);
  const calledWith = [];
  const connect = async (clientId) => { calledWith.push(clientId); };

  const result = await reconnectAllBaileysClients({ db, connect });

  assert.deepEqual(calledWith, [5, 9]);
  assert.deepEqual(result, [5, 9]);
});

test('reconnectAllBaileysClients nao interrompe os outros se reconectar um cliente falhar', async () => {
  const db = makeFakeDb([{ client_id: 5 }, { client_id: 9 }]);
  const calledWith = [];
  const connect = async (clientId) => {
    calledWith.push(clientId);
    if (clientId === 5) throw new Error('sessão inválida');
  };

  await reconnectAllBaileysClients({ db, connect });

  assert.deepEqual(calledWith, [5, 9]);
});

test('reconnectAllBaileysClients sem nenhum cliente baileys configurado nao chama connect', async () => {
  const db = makeFakeDb([]);
  let called = false;
  const connect = async () => { called = true; };

  const result = await reconnectAllBaileysClients({ db, connect });

  assert.equal(called, false);
  assert.deepEqual(result, []);
});

test('connectClient chamado duas vezes ao mesmo tempo pro mesmo cliente so abre UM socket (evita a corrida que derruba a conexao)', async () => {
  const { module: fakeBaileys, getCallCount } = makeFakeBaileysModule();

  const [resultA, resultB] = await Promise.all([
    connectClient('test-race-client-1', { baileys: fakeBaileys }),
    connectClient('test-race-client-1', { baileys: fakeBaileys })
  ]);

  assert.equal(getCallCount(), 1);
  assert.equal(resultA, resultB);
});

test('connectClient descarta um socket preso em "connecting" ha tempo demais e tenta de novo', async () => {
  const endCalls = [];
  let makeWASocketCalls = 0;
  const sockets = [];
  const fakeBaileys = {
    default: () => {
      makeWASocketCalls++;
      const sock = { ev: { on: () => {} }, end: async (err) => { endCalls.push(err); } };
      sockets.push(sock);
      return sock;
    },
    useMultiFileAuthState: async () => ({ state: {}, saveCreds: () => {} }),
    DisconnectReason: { loggedOut: 401 }
  };

  let now = 1000000;
  const clock = () => now;

  await connectClient('test-stale-client-1', { baileys: fakeBaileys, now: clock });
  assert.equal(makeWASocketCalls, 1);

  now += 31000; // passa do limite de staleness (30s) sem nunca abrir nem fechar
  await connectClient('test-stale-client-1', { baileys: fakeBaileys, now: clock });

  assert.equal(makeWASocketCalls, 2);
  assert.equal(endCalls.length, 1);
});

test('connectClient NAO descarta um socket "connecting" ha pouco tempo', async () => {
  let makeWASocketCalls = 0;
  const fakeBaileys = {
    default: () => { makeWASocketCalls++; return { ev: { on: () => {} }, end: async () => {} }; },
    useMultiFileAuthState: async () => ({ state: {}, saveCreds: () => {} }),
    DisconnectReason: { loggedOut: 401 }
  };

  let now = 2000000;
  const clock = () => now;

  await connectClient('test-stale-client-2', { baileys: fakeBaileys, now: clock });
  now += 5000; // bem antes do limite de staleness
  await connectClient('test-stale-client-2', { baileys: fakeBaileys, now: clock });

  assert.equal(makeWASocketCalls, 1);
});

test('clientId numerico e em string (ex: vindo de query param vs corpo da requisicao) apontam pra mesma conexao', async () => {
  let connectionUpdateHandler = null;
  const sentMessages = [];
  const fakeSock = {
    ev: {
      on: (event, handler) => {
        if (event === 'connection.update') connectionUpdateHandler = handler;
      }
    },
    sendMessage: async (jid, msg) => { sentMessages.push({ jid, msg }); }
  };
  const fakeBaileys = {
    default: () => fakeSock,
    useMultiFileAuthState: async () => ({ state: {}, saveCreds: () => {} }),
    DisconnectReason: { loggedOut: 401 }
  };

  // Abre a conexao com clientId NUMBER (ex: reconexao automatica, client_id vindo
  // direto do Postgres).
  await connectClient(777, { baileys: fakeBaileys });
  await connectionUpdateHandler({ connection: 'open' });

  // Le o status e manda mensagem com clientId STRING (ex: req.query.clientId,
  // req.body.clientId vindo de JSON) -- tem que enxergar a MESMA conexao que acabou
  // de abrir, nao uma entrada vazia/diferente.
  assert.equal(getConnectionState('777').status, 'connected');
  await sendViaBaileys('777', '5511999998888', 'oi');
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].jid, '5511999998888@s.whatsapp.net');
});

test('reconexao depois de uma queda nao e imediata -- espera um atraso (evita o conflito 440 do WhatsApp)', async () => {
  let connectionUpdateHandler = null;
  let makeWASocketCalls = 0;
  const fakeBaileys = {
    default: () => {
      makeWASocketCalls++;
      return { ev: { on: (event, handler) => { if (event === 'connection.update') connectionUpdateHandler = handler; } } };
    },
    useMultiFileAuthState: async () => ({ state: {}, saveCreds: () => {} }),
    DisconnectReason: { loggedOut: 401 }
  };

  const scheduled = [];
  const fakeSetTimeout = (fn, ms) => { scheduled.push({ fn, ms }); };

  await connectClient('test-reconnect-delay-1', { baileys: fakeBaileys, setTimeout: fakeSetTimeout });
  assert.equal(makeWASocketCalls, 1);

  // Simula uma queda por conflito (440), nao logout.
  await connectionUpdateHandler({ connection: 'close', lastDisconnect: { error: { output: { statusCode: 440 }, message: 'Stream Errored (conflict)' } } });

  // Nao deve ter tentado reconectar na hora -- so agendado pro depois.
  assert.equal(makeWASocketCalls, 1);
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].ms, 5000);

  // So reconecta quando o atraso "passa" (simulado chamando a funcao agendada).
  await scheduled[0].fn();
  assert.equal(makeWASocketCalls, 2);
});

test('logout nao agenda reconexao nenhuma', async () => {
  let connectionUpdateHandler = null;
  const fakeBaileys = {
    default: () => ({ ev: { on: (event, handler) => { if (event === 'connection.update') connectionUpdateHandler = handler; } } }),
    useMultiFileAuthState: async () => ({ state: {}, saveCreds: () => {} }),
    DisconnectReason: { loggedOut: 401 }
  };

  const scheduled = [];
  const fakeSetTimeout = (fn, ms) => { scheduled.push({ fn, ms }); };

  await connectClient('test-reconnect-delay-2', { baileys: fakeBaileys, setTimeout: fakeSetTimeout });
  await connectionUpdateHandler({ connection: 'close', lastDisconnect: { error: { output: { statusCode: 401 } } } });

  assert.equal(scheduled.length, 0);
});

test('decideOwnership: sem dono ou eu mesmo -> owner', () => {
  assert.equal(decideOwnership({ owner: null, instanceId: 'A' }), 'owner');
  assert.equal(decideOwnership({ owner: { instanceId: 'A', heartbeatAt: 0 }, instanceId: 'A', now: 999999 }), 'owner');
});

test('decideOwnership: outro processo vivo e dono -> este cede (fecha a conexao)', () => {
  assert.equal(decideOwnership({ owner: { instanceId: 'B', heartbeatAt: 100000 }, instanceId: 'A', now: 120000 }), 'yield');
});

test('decideOwnership: dono parou de dar sinal ha mais de 1 minuto -> assume', () => {
  assert.equal(decideOwnership({ owner: { instanceId: 'B', heartbeatAt: 0 }, instanceId: 'A', now: 61000 }), 'takeover');
});
