import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePassword } from './userController.js';

test('generatePassword tem o tamanho pedido e só caracteres legíveis', () => {
  const p = generatePassword(12);
  assert.equal(p.length, 12);
  assert.match(p, /^[a-zA-Z2-9]+$/);
  assert.doesNotMatch(p, /[0OlI1]/);
});

test('generatePassword não repete (aleatória)', () => {
  const set = new Set(Array.from({ length: 50 }, () => generatePassword()));
  assert.equal(set.size, 50);
});
