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
  assert.equal(canonicalPath('/caixa', { standalone: true }), null);
  assert.equal(appForPath('/painel').key, 'further');
});

test('config do Na Mesa aponta pro manifesto e ícones dele', () => {
  const a = appForPath('/namesa');
  assert.equal(a.manifest, '/namesa.webmanifest');
  assert.equal(a.appleIcon, '/icons/namesa-apple-180.png');
  assert.equal(a.title, 'Na Mesa');
});

// Caixa virou Balcão (22/10). O endereço novo é /balcao; /caixa continua abrindo o mesmo
// app pra quem já tinha instalado (o app instalado guarda o endereço da instalação).
test('/balcao abre o Balcão, com o manifesto novo', () => {
  const a = appForPath('/balcao');
  assert.equal(a.key, 'caixa');
  assert.equal(a.title, 'Balcão');
  assert.equal(a.manifest, '/balcao.webmanifest');
  assert.equal(a.appleIcon, '/icons/caixa-apple-180.png'); // o ícone não mudou
  assert.equal(appForPath('/balcaozinho').key, 'further');
});

test('/caixa: app já instalado fica no endereço dele; no navegador vai pro /balcao', () => {
  assert.equal(appForPath('/caixa').manifest, '/caixa.webmanifest');
  assert.equal(appForPath('/caixa').title, 'Balcão');
  assert.equal(canonicalPath('/caixa', { standalone: true }), null);
  assert.equal(canonicalPath('/caixa', { standalone: false }), '/balcao');
  assert.equal(canonicalPath('/caixa/', { standalone: false }), '/balcao');
});

test('/balcão com til também leva pro /balcao', () => {
  assert.equal(canonicalPath('/balc%C3%A3o'), '/balcao');
  assert.equal(canonicalPath('/balcão'), '/balcao');
  assert.equal(canonicalPath('/balcao'), null);
});
