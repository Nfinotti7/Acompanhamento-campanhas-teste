import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPin, verifyPin } from './staffAuth.js';

test('hashPin gera um hash diferente do PIN original', async () => {
  const hash = await hashPin('1234');
  assert.notEqual(hash, '1234');
  assert.ok(hash.length > 20);
});

test('verifyPin retorna true para o PIN correto', async () => {
  const hash = await hashPin('482913');
  assert.equal(verifyPin('482913', hash), true);
});

test('verifyPin retorna false para PIN incorreto', async () => {
  const hash = await hashPin('482913');
  assert.equal(verifyPin('000000', hash), false);
});

test('hashPin rejeita PIN fora do formato (não numérico ou tamanho inválido)', async () => {
  await assert.rejects(() => hashPin('abcd'), /PIN deve ter entre 4 e 8 dígitos numéricos/);
  await assert.rejects(() => hashPin('123'), /PIN deve ter entre 4 e 8 dígitos numéricos/);
  await assert.rejects(() => hashPin('123456789'), /PIN deve ter entre 4 e 8 dígitos numéricos/);
});
