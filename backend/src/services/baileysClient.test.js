import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconnectAllBaileysClients } from './baileysClient.js';

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
