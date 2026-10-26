import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectInfoTopics, isOtherQuestion } from './infoText.js';

test('perguntas prontas do anúncio', () => {
  assert.deepEqual(detectInfoTopics('Quero ver o cardápio'), ['menu']);
  assert.deepEqual(detectInfoTopics('Onde vocês ficam?'), ['location']);
  assert.deepEqual(detectInfoTopics('Qual o horário de funcionamento?'), ['hours']);
});

test('perguntas escritas pelos leads do Malibu', () => {
  assert.deepEqual(detectInfoTopics('Qual endereço!?'), ['location']);
  assert.deepEqual(detectInfoTopics('Qual o valor do rodízio'), ['prices']);
  assert.deepEqual(detectInfoTopics('Qual o valor ?'), ['prices']);
  assert.deepEqual(detectInfoTopics('Trabalham  com rodízio?'), ['prices']);
  assert.deepEqual(detectInfoTopics('Quais os dias de rodízio e o preco'), ['prices']);
  assert.deepEqual(detectInfoTopics('Preço? Localização?'), ['prices', 'location']);
  assert.deepEqual(detectInfoTopics('Quero ver cardápio'), ['menu']);
  assert.deepEqual(detectInfoTopics('vocês abrem hoje?'), ['hours']);
  assert.deepEqual(detectInfoTopics('até que horas vocês ficam abertos?'), ['hours']);
});

test('o que não é pergunta de informação', () => {
  assert.deepEqual(detectInfoTopics('ola'), []);
  assert.deepEqual(detectInfoTopics('Quero fazer uma reserva (cód. RESERVA)'), []);
  assert.deepEqual(detectInfoTopics('2'), []);
  assert.deepEqual(detectInfoTopics('Ok'), []);
  assert.deepEqual(
    detectInfoTopics('Me responderam sobre o preço no Instagram. Obrigada. Gostaria de reservar tmb uma mesa para dois as 12:30 aproximadamente'),
    []
  );
});

test('isOtherQuestion', () => {
  assert.ok(isOtherQuestion('Tenho outra dúvida'));
  assert.ok(isOtherQuestion('tenho uma dúvida!'));
  assert.ok(!isOtherQuestion('tenho uma dúvida sobre o estacionamento'));
});
