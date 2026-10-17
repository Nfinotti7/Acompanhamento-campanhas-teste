import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appForPath, canonicalPath } from './apps.js';

test('cada endereço leva ao app certo', () => {
  assert.equal(appForPath('/caixa').key, 'caixa');
  assert.equal(appForPath('/caixa/qualquer').key, 'caixa');
  assert.equal(appForPath('/namesa').key, 'namesa');
  assert.equal(appForPath('/').key, 'further');
  assert.equal(appForPath('/admin').key, 'further');
  assert.equal(appForPath('/caixas').key, 'further');
});

test('a raiz vai pro /painel e os outros endereços ficam', () => {
  assert.equal(canonicalPath('/'), '/painel');
  assert.equal(canonicalPath(''), '/painel');
  assert.equal(canonicalPath('/painel'), null);
  assert.equal(canonicalPath('/caixa'), null);
  assert.equal(appForPath('/painel').key, 'further');
});

test('config do Na Mesa aponta pro manifesto e ícones dele', () => {
  const a = appForPath('/namesa');
  assert.equal(a.manifest, '/namesa.webmanifest');
  assert.equal(a.appleIcon, '/icons/namesa-apple-180.png');
  assert.equal(a.title, 'Na Mesa');
});
