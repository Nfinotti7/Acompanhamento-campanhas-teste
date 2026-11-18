import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redactPii, redactContents } from './aiRedact.js';

test('redactPii: telefone com máscara', () => {
  assert.equal(redactPii('meu cel é (62) 98147-9128'), 'meu cel é [telefone]');
});

test('redactPii: telefone com +55 e sem máscara', () => {
  assert.equal(redactPii('+55 62 981479128 e 62981479128'), '[telefone] e [telefone]');
});

test('redactPii: CPF com e sem pontuação', () => {
  assert.equal(redactPii('CPF 123.456.789-09 ou 12345678909'), 'CPF [CPF] ou [CPF]');
});

test('redactPii: CNPJ', () => {
  assert.equal(redactPii('CNPJ 12.345.678/0001-95'), 'CNPJ [CNPJ]');
});

test('redactPii: e-mail com ponto final grudado', () => {
  assert.equal(redactPii('manda pra joao.silva@gmail.com.'), 'manda pra [e-mail].');
});

test('redactPii: data, horário, pessoas e preço ficam intactos', () => {
  const text = 'dia 25/11/2026 às 19:30, somos 12 pessoas, R$ 129,00, às 19h30';
  assert.equal(redactPii(text), text);
});

test('redactPii: texto vazio ou não-texto', () => {
  assert.equal(redactPii(''), '');
  assert.equal(redactPii(undefined), '');
});

test('redactContents: reescreve só o texto, sem mutar o original', () => {
  const call = { functionCall: { name: 'check_availability', args: { party_size: 4 } } };
  const input = [
    { role: 'user', parts: [{ text: 'meu email é a@b.com' }] },
    { role: 'model', parts: [call] }
  ];
  const out = redactContents(input);
  assert.equal(out[0].parts[0].text, 'meu email é [e-mail]');
  assert.equal(out[0].role, 'user');
  assert.deepEqual(out[1].parts[0], call);
  assert.equal(input[0].parts[0].text, 'meu email é a@b.com');
});

test('redactPii: data com ano seguida de hora não vira telefone', () => {
  for (const text of ['quero 25.11.2026 20h', 'dia 25-11-2026 19h', '2026-11-25 19:30:00', 'mesas 12 14 16 18 20']) {
    assert.equal(redactPii(text), text);
  }
});

test('redactPii: celular sem DDD também some', () => {
  assert.equal(redactPii('liga 98147-9128'), 'liga [telefone]');
  assert.equal(redactPii('981479128'), '[telefone]');
  assert.equal(redactPii('9 8147-9128'), '[telefone]');
});

test('redactContents: só esconde o que o cliente escreveu, não a fala da casa', () => {
  const out = redactContents([
    { role: 'user', parts: [{ text: 'meu cel 62981479128' }] },
    { role: 'model', parts: [{ text: 'Nosso fone é (62) 3333-4444' }] }
  ]);
  assert.equal(out[0].parts[0].text, 'meu cel [telefone]');
  assert.equal(out[1].parts[0].text, 'Nosso fone é (62) 3333-4444');
});
