import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scopeGroupClient } from './authMiddleware.js';

const group = { id: 1, role: 'client', clientId: 5, clientIds: [5, 7, 8, 9] };

test('login de grupo troca pro restaurante pedido quando ele e do grupo', () => {
  assert.equal(scopeGroupClient(group, { query: { clientId: '7' } }).clientId, 7);
  assert.equal(scopeGroupClient(group, { query: {}, body: { clientId: 8 } }).clientId, 8);
  assert.equal(scopeGroupClient(group, { query: {}, headers: { 'x-client-id': '9' } }).clientId, 9);
});

test('login de grupo ignora restaurante fora do grupo e fica no padrao', () => {
  assert.equal(scopeGroupClient(group, { query: { clientId: '13' } }).clientId, 5);
  assert.equal(scopeGroupClient(group, { query: {} }).clientId, 5);
});

test('usuario comum e admin nao sao afetados', () => {
  const single = { id: 2, role: 'client', clientId: 5 };
  assert.equal(scopeGroupClient(single, { query: { clientId: '7' } }).clientId, 5);
  const admin = { id: 3, role: 'admin', clientIds: [5] };
  assert.equal(scopeGroupClient(admin, { query: { clientId: '7' } }), admin);
});
