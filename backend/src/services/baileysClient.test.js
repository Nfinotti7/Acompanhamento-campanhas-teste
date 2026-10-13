import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconnectAllBaileysClients, connectClient } from './baileysClient.js';

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
