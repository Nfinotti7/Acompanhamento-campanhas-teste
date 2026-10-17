import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconnectAllBaileysClients, connectClient, getConnectionState, sendViaBaileys, decideOwnership, resetClient, requestPairingCode, connectionHealth, checkConnections } from './baileysClient.js';

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

test('desconectado pelo celular (logout): apaga a sessao velha e recomeca do zero, pra gerar QR novo', async () => {
  let connectionUpdateHandler = null;
  let makeWASocketCalls = 0;
  const fakeBaileys = {
    default: () => { makeWASocketCalls++; return { ev: { on: (event, handler) => { if (event === 'connection.update') connectionUpdateHandler = handler; } } }; },
    useMultiFileAuthState: async () => ({ state: {}, saveCreds: () => {} }),
    DisconnectReason: { loggedOut: 401 }
  };
  const removed = [];
  const scheduled = [];
  const deps = { baileys: fakeBaileys, setTimeout: (fn, ms) => scheduled.push({ fn, ms }), removeSession: (id) => removed.push(String(id)) };

  await connectClient('test-logout-1', deps);
  await connectionUpdateHandler({ connection: 'close', lastDisconnect: { error: { output: { statusCode: 401 } } } });

  // Sem apagar, a proxima tentativa reusaria as credenciais invalidas e nunca pediria QR.
  assert.deepEqual(removed, ['test-logout-1']);
  assert.equal(scheduled.length, 1);
  await scheduled[0].fn();
  assert.equal(makeWASocketCalls, 2);
});

test('resetClient (desconectar / trocar numero) desliga o aparelho, apaga a sessao e abre conexao nova', async () => {
  let makeWASocketCalls = 0;
  const calls = [];
  const fakeBaileys = {
    default: () => {
      makeWASocketCalls++;
      return { ev: { on: () => {} }, logout: async () => calls.push('logout'), end: async () => calls.push('end') };
    },
    useMultiFileAuthState: async () => ({ state: {}, saveCreds: () => {} }),
    DisconnectReason: { loggedOut: 401 }
  };
  const deps = { baileys: fakeBaileys, removeSession: (id) => calls.push('remove:' + id) };

  await connectClient('test-reset-1', deps);
  await resetClient('test-reset-1', deps);

  assert.deepEqual(calls.slice(0, 2), ['logout', 'remove:test-reset-1']);
  assert.equal(makeWASocketCalls, 2);
  assert.equal(getConnectionState('test-reset-1').status, 'connecting');
});

test('resetClient funciona mesmo sem conexao aberta (aparelho ja desconectado)', async () => {
  const removed = [];
  let makeWASocketCalls = 0;
  const fakeBaileys = {
    default: () => { makeWASocketCalls++; return { ev: { on: () => {} } }; },
    useMultiFileAuthState: async () => ({ state: {}, saveCreds: () => {} }),
    DisconnectReason: { loggedOut: 401 }
  };
  await resetClient('test-reset-2', { baileys: fakeBaileys, removeSession: (id) => removed.push(String(id)) });
  assert.deepEqual(removed, ['test-reset-2']);
  assert.equal(makeWASocketCalls, 1);
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

function pairingFakeBaileys(calls, { registered = false } = {}) {
  let handler = null;
  return {
    emitQr: () => handler({ qr: 'qr-teste' }),
    module: {
      default: () => ({
        ev: { on: (event, h) => { if (event === 'connection.update') handler = h; } },
        authState: { creds: { registered } },
        requestPairingCode: async (phone) => { calls.push(phone); return 'ABCD1234'; }
      }),
      useMultiFileAuthState: async () => ({ state: {}, saveCreds: () => {} }),
      DisconnectReason: { loggedOut: 401 }
    }
  };
}

test('requestPairingCode pede o código pro número (com DDI) e devolve formatado ABCD-1234', async () => {
  const calls = [];
  const fake = pairingFakeBaileys(calls);
  await connectClient('test-pair-1', { baileys: fake.module });
  await fake.emitQr();
  const code = await requestPairingCode('test-pair-1', '(11) 99999-8888', { baileys: fake.module });
  assert.equal(code, 'ABCD-1234');
  assert.deepEqual(calls, ['5511999998888']);
});

test('requestPairingCode recusa número inválido e WhatsApp já conectado', async () => {
  const calls = [];
  const fake = pairingFakeBaileys(calls);
  await connectClient('test-pair-2', { baileys: fake.module });
  await fake.emitQr();
  await assert.rejects(requestPairingCode('test-pair-2', '123', { baileys: fake.module }), /número/i);

  const fake2 = pairingFakeBaileys(calls, { registered: true });
  await connectClient('test-pair-3', { baileys: fake2.module });
  await assert.rejects(requestPairingCode('test-pair-3', '11999998888', { baileys: fake2.module }), /já está conectado/i);
  assert.equal(calls.length, 0);
});

// ---- Vigia da conexão zumbi ----
// Em 17/10 a conexão da Mercearia parou de receber mensagens e de confirmar entregas sem
// nunca disparar 'close' (o ping interno do Baileys seguia respondendo). Ficou parada até
// alguém reiniciar o servidor.

test('connectionHealth: conexão ativa e com mensagens confirmadas -> ok', () => {
  const now = 1_000_000;
  assert.equal(connectionHealth({ status: 'connected', lastActivityAt: now - 60_000, pendingAcks: new Map([['a', now - 30_000]]), now }), null);
});

test('connectionHealth: mensagem enviada sem confirmação do WhatsApp em 90s -> zumbi', () => {
  const now = 1_000_000;
  const reason = connectionHealth({ status: 'connected', lastActivityAt: now - 100_000, pendingAcks: new Map([['a', now - 91_000]]), now });
  assert.match(reason, /confirma/);
});

test('connectionHealth: a mesma mensagem com algum evento depois do envio -> ok', () => {
  const now = 1_000_000;
  assert.equal(connectionHealth({ status: 'connected', lastActivityAt: now - 1000, pendingAcks: new Map([['a', now - 91_000]]), now }), null);
});

test('connectionHealth: mensagem sem confirmação mas com outros eventos chegando -> ok (número errado, sem WhatsApp)', () => {
  const now = 1_000_000;
  assert.equal(connectionHealth({ status: 'connected', lastActivityAt: now - 10_000, pendingAcks: new Map([['a', now - 300_000]]), now }), null);
});

test('connectionHealth: 20 min sem nenhum evento -> renova a conexão', () => {
  const now = 10_000_000;
  assert.match(connectionHealth({ status: 'connected', lastActivityAt: now - 20 * 60_000 - 1, pendingAcks: new Map(), now }), /evento/);
  assert.equal(connectionHealth({ status: 'connected', lastActivityAt: now - 19 * 60_000, pendingAcks: new Map(), now }), null);
});

test('connectionHealth: só olha conexão aberta (QR, conectando e standby têm outras regras)', () => {
  const now = 10_000_000;
  for (const status of ['qr', 'connecting', 'standby', 'disconnected']) {
    assert.equal(connectionHealth({ status, lastActivityAt: 0, pendingAcks: new Map([['a', 0]]), now }), null);
  }
});

test('vigia: mensagem sem confirmação descarta o socket zumbi e reconecta com a sessão salva', async () => {
  const handlers = {};
  const sockets = [];
  const fakeBaileys = {
    default: () => {
      const sock = {
        ev: { on: (event, handler) => { handlers[event] = handler; } },
        sendMessage: async () => ({ key: { id: `MSG${sockets.length}` } }),
        end: async () => { sock.ended = true; }
      };
      sockets.push(sock);
      return sock;
    },
    useMultiFileAuthState: async () => ({ state: {}, saveCreds: () => {} }),
    DisconnectReason: { loggedOut: 401 }
  };
  let clock = 5_000_000;
  const scheduled = [];
  const deps = { baileys: fakeBaileys, now: () => clock, setTimeout: (fn, ms) => scheduled.push({ fn, ms }), removeSession: () => { throw new Error('não pode apagar a sessão'); } };

  await connectClient('test-watchdog-1', deps);
  await handlers['connection.update']({ connection: 'open' });
  await sendViaBaileys('test-watchdog-1', '5511999998888', 'oi');

  clock += 60_000;
  await checkConnections(deps);
  assert.equal(sockets[0].ended, undefined, 'ainda dentro do prazo');

  clock += 31_000;
  await checkConnections(deps);
  assert.equal(sockets[0].ended, true);
  assert.equal(getConnectionState('test-watchdog-1').status, 'disconnected');
  assert.match(getConnectionState('test-watchdog-1').lastDisconnectReason.message, /confirma/);
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].ms, 5000);

  await scheduled[0].fn();
  assert.equal(sockets.length, 2, 'abriu um socket novo');
});

test('vigia: confirmação do WhatsApp (messages.update) tira a mensagem da espera', async () => {
  const handlers = {};
  let ended = false;
  const fakeBaileys = {
    default: () => ({
      ev: { on: (event, handler) => { handlers[event] = handler; } },
      sendMessage: async () => ({ key: { id: 'ACKED1' } }),
      end: async () => { ended = true; }
    }),
    useMultiFileAuthState: async () => ({ state: {}, saveCreds: () => {} }),
    DisconnectReason: { loggedOut: 401 }
  };
  let clock = 5_000_000;
  const deps = { baileys: fakeBaileys, now: () => clock, setTimeout: () => {}, applyMessageStatus: async () => {} };

  await connectClient('test-watchdog-2', deps);
  await handlers['connection.update']({ connection: 'open' });
  await sendViaBaileys('test-watchdog-2', '5511999998888', 'oi');
  await handlers['messages.update']([{ key: { id: 'ACKED1', fromMe: true }, update: { status: 2 } }]);

  clock += 120_000;
  await checkConnections(deps);
  assert.equal(ended, false);
});
