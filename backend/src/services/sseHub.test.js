import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subscribe, broadcast, listenerCount } from './sseHub.js';

test('broadcast envia o payload formatado em SSE pro writer inscrito', () => {
  const received = [];
  const unsubscribe = subscribe(101, (payload) => received.push(payload));

  broadcast(101, 'message', { contactId: 5, body: 'oi' });

  assert.equal(received.length, 1);
  assert.equal(received[0], 'event: message\ndata: {"contactId":5,"body":"oi"}\n\n');
  unsubscribe();
});

test('broadcast pra um clientId sem nenhum inscrito nao lanca erro', () => {
  assert.doesNotThrow(() => broadcast(999999, 'message', { foo: 'bar' }));
});

test('broadcast nao vaza pra inscritos de outro clientId', () => {
  const receivedA = [];
  const receivedB = [];
  const unsubA = subscribe(201, (p) => receivedA.push(p));
  const unsubB = subscribe(202, (p) => receivedB.push(p));

  broadcast(201, 'message', { x: 1 });

  assert.equal(receivedA.length, 1);
  assert.equal(receivedB.length, 0);
  unsubA();
  unsubB();
});

test('unsubscribe para de receber broadcasts futuros', () => {
  const received = [];
  const unsubscribe = subscribe(301, (p) => received.push(p));
  unsubscribe();

  broadcast(301, 'message', { x: 1 });

  assert.equal(received.length, 0);
});

test('varios inscritos no mesmo clientId recebem o mesmo broadcast', () => {
  const receivedA = [];
  const receivedB = [];
  const unsubA = subscribe(401, (p) => receivedA.push(p));
  const unsubB = subscribe(401, (p) => receivedB.push(p));

  broadcast(401, 'message', { x: 1 });

  assert.equal(receivedA.length, 1);
  assert.equal(receivedB.length, 1);
  unsubA();
  unsubB();
});

test('um writer que lanca erro nao impede os outros inscritos de receberem o broadcast', () => {
  const received = [];
  const unsubA = subscribe(501, () => { throw new Error('conexao fechada'); });
  const unsubB = subscribe(501, (p) => received.push(p));

  assert.doesNotThrow(() => broadcast(501, 'message', { x: 1 }));
  assert.equal(received.length, 1);
  unsubA();
  unsubB();
});

test('listenerCount reflete o numero de inscritos ativos', () => {
  assert.equal(listenerCount(601), 0);
  const unsub = subscribe(601, () => {});
  assert.equal(listenerCount(601), 1);
  unsub();
  assert.equal(listenerCount(601), 0);
});

test('clientId numerico e em string (ex: vindo de query param) apontam pro mesmo canal', () => {
  const received = [];
  const unsubscribe = subscribe('701', (p) => received.push(p));

  broadcast(701, 'message', { x: 1 });

  assert.equal(received.length, 1);
  assert.equal(listenerCount(701), 1);
  unsubscribe();
});
