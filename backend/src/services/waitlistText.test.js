import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_MESSAGES, MESSAGE_KEYS, isJoinCommand, isLeaveCommand, parsePartySize,
  normalizePhone, phoneVariants, firstName, formatGroupsAhead, renderMessage
} from './waitlistText.js';

test('isJoinCommand aceita FILA sozinho e o código do QR', () => {
  assert.ok(isJoinCommand('FILA'));
  assert.ok(isJoinCommand('  fila! '));
  assert.ok(isJoinCommand('Quero entrar na fila (cód. FILA)'));
  assert.ok(isJoinCommand('quero entrar na fila (cod FILA)'));
});

test('isJoinCommand ignora frase comum com a palavra fila', () => {
  assert.ok(!isJoinCommand('tem fila hoje?'));
  assert.ok(!isJoinCommand('quero entrar na fila'));
  assert.ok(!isJoinCommand(''));
  assert.ok(!isJoinCommand(null));
});

test('isLeaveCommand aceita sair, cancelar e desistir', () => {
  for (const t of ['SAIR', 'sair da fila', 'Cancelar', 'cancela', 'desisto', 'Desistir!']) {
    assert.ok(isLeaveCommand(t), t);
  }
  assert.ok(!isLeaveCommand('vou sair daqui a pouco'));
});

test('parsePartySize entende número, palavra e "eu e mais"', () => {
  assert.equal(parsePartySize('4'), 4);
  assert.equal(parsePartySize('somos 4'), 4);
  assert.equal(parsePartySize('4 pessoas'), 4);
  assert.equal(parsePartySize('quatro'), 4);
  assert.equal(parsePartySize('Duas pessoas'), 2);
  assert.equal(parsePartySize('eu e mais 3'), 4);
  assert.equal(parsePartySize('eu e mais dois'), 3);
  assert.equal(parsePartySize('um casal'), 2);
  assert.equal(parsePartySize('só eu'), 1);
});

test('parsePartySize recusa texto sem número e números fora da faixa', () => {
  assert.equal(parsePartySize('oi'), null);
  assert.equal(parsePartySize('0'), null);
  assert.equal(parsePartySize('45'), null);
  assert.equal(parsePartySize(''), null);
});

test('normalizePhone completa o 55 e recusa lixo', () => {
  assert.equal(normalizePhone('(11) 99999-8888'), '5511999998888');
  assert.equal(normalizePhone('5511999998888'), '5511999998888');
  assert.equal(normalizePhone('1133334444'), '551133334444');
  assert.equal(normalizePhone('123'), null);
  assert.equal(normalizePhone(''), null);
});

test('firstName e formatGroupsAhead', () => {
  assert.equal(firstName('Maria Clara Souza'), 'Maria');
  assert.equal(firstName(null), '');
  assert.equal(formatGroupsAhead(1), '1 grupo');
  assert.equal(formatGroupsAhead(2), '2 grupos');
});

test('renderMessage substitui variáveis', () => {
  assert.equal(
    renderMessage('Pronto, {nome}! Posição: {posicao}.', { nome: 'Ana', posicao: 3 }),
    'Pronto, Ana! Posição: 3.'
  );
});

test('renderMessage não deixa "Oi, !" quando o nome está vazio', () => {
  assert.equal(renderMessage(DEFAULT_MESSAGES.askSize, { nome: '' }), 'Oi! Pra quantas pessoas?');
  assert.equal(renderMessage('{nome}, sua mesa está pronta!', { nome: '' }), 'Sua mesa está pronta!');
});

test('todas as chaves de mensagem têm texto padrão', () => {
  for (const key of MESSAGE_KEYS) assert.equal(typeof DEFAULT_MESSAGES[key], 'string');
});

test('phoneVariants cobre o número com e sem o 9º dígito', () => {
  assert.deepEqual(phoneVariants('5511999998888').sort(), ['551199998888', '5511999998888'].sort());
  assert.deepEqual(phoneVariants('551199998888').sort(), ['551199998888', '5511999998888'].sort());
  assert.deepEqual(phoneVariants('551133334444').sort(), ['551133334444', '5511933334444'].sort());
  assert.deepEqual(phoneVariants('447700900123'), ['447700900123']);
  assert.deepEqual(phoneVariants(null), []);
});
