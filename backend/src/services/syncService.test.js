import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMetaCredentialsConfig } from './syncService.js';

test('parseMetaCredentialsConfig retorna null para JSON invalido', () => {
  assert.equal(parseMetaCredentialsConfig('{invalido'), null);
});

test('parseMetaCredentialsConfig retorna null quando falta ad_account_id', () => {
  assert.equal(parseMetaCredentialsConfig(JSON.stringify({ access_token: 'tok' })), null);
});

test('parseMetaCredentialsConfig retorna null quando falta access_token', () => {
  assert.equal(parseMetaCredentialsConfig(JSON.stringify({ ad_account_id: 'act_1' })), null);
});

test('parseMetaCredentialsConfig retorna a config quando valida', () => {
  const result = parseMetaCredentialsConfig(JSON.stringify({ ad_account_id: 'act_1', access_token: 'tok' }));
  assert.deepEqual(result, { ad_account_id: 'act_1', access_token: 'tok' });
});
