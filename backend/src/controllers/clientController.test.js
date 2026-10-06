import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOptionalText } from './clientController.js';

test('normalizeOptionalText remove espacos nas pontas', () => {
  assert.equal(normalizeOptionalText('  RECREIO -  '), 'RECREIO -');
});

test('normalizeOptionalText transforma string vazia ou so espacos em null', () => {
  assert.equal(normalizeOptionalText(''), null);
  assert.equal(normalizeOptionalText('   '), null);
});

test('normalizeOptionalText trata undefined/null como null', () => {
  assert.equal(normalizeOptionalText(undefined), null);
  assert.equal(normalizeOptionalText(null), null);
});
