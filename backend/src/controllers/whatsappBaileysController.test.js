import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveClientId } from './whatsappBaileysController.js';

test('staff (PIN do restaurante) só enxerga o próprio restaurante, mesmo pedindo outro', () => {
  const req = { user: { role: 'staff', clientId: 13 }, query: { clientId: '5' }, body: {} };
  assert.equal(resolveClientId(req), 13);
});

test('admin escolhe o restaurante pela query', () => {
  const req = { user: { role: 'admin' }, query: { clientId: '5' }, body: {} };
  assert.equal(resolveClientId(req), '5');
});
