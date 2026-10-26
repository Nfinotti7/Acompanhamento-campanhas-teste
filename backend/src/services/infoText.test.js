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

// Variações comuns de cada assunto (com abreviação e sem acento, como os leads escrevem).
const VARIATIONS = {
  location: [
    'onde fica?', 'Onde é?', 'onde?', 'fica onde?', 'vcs ficam onde', 'onde vcs ficam?', 'Onde fica o restaurante?',
    'qual a localização', 'manda a localização', 'me manda o endereço pf', 'endereço?', 'Qual o endereço de vocês?',
    'qual bairro?', 'é em qual bairro?', 'que rua é?', 'como faço pra chegar?', 'como chego aí?', 'loc?',
    'manda a loc', 'onde vocês estão localizados?', 'tem ponto de referência?', 'manda no waze', 'manda o pin',
    'Boa noite! Qual o endereço de vocês?', 'local?', 'de onde vocês são?'
  ],
  menu: [
    'cardápio', 'cardapio?', 'menu', 'me manda o cardápio', 'tem cardápio?', 'posso ver o menu?',
    'quais os pratos?', 'o que vocês servem?', 'o que vcs tem?', 'quais as opções do rodízio?', 'manda o link do cardapio'
  ],
  prices: [
    'preço?', 'precos', 'valor?', 'quais os valores', 'quanto custa?', 'quanto é?', 'quanto fica por pessoa?',
    'qto custa o rodizio', 'qnt é o rodízio?', 'quanto tá o rodízio?', 'valor por pessoa', 'tem rodízio?',
    'tem promoção?', 'tem desconto?', 'criança paga?', 'quanto?', 'qual o valor do premium', 'tem happy hour?'
  ],
  hours: [
    'horário?', 'qual o horário de vocês?', 'que horas abre?', 'abre que horas?', 'que horas fecha?', 'fecha que horas?',
    'vocês abrem hoje?', 'abre hoje?', 'tá aberto?', 'estão abertos?', 'estão funcionando hoje?', 'funciona domingo?',
    'abrem segunda?', 'até que horas?', 'até que hora vcs ficam?', 'hr de funcionamento', 'abre pro almoço?',
    'abrem no feriado?'
  ]
};

for (const [topic, phrases] of Object.entries(VARIATIONS)) {
  test(`variações de ${topic}`, () => {
    for (const phrase of phrases) assert.ok(detectInfoTopics(phrase).includes(topic), `"${phrase}" → ${JSON.stringify(detectInfoTopics(phrase))}`);
  });
}

test('variações não trocam de assunto', () => {
  assert.deepEqual(detectInfoTopics('que horas abre?'), ['hours']);
  assert.deepEqual(detectInfoTopics('quanto fica por pessoa?'), ['prices']);
  assert.deepEqual(detectInfoTopics('onde fica?'), ['location']);
  assert.deepEqual(detectInfoTopics('me manda o cardápio'), ['menu']);
  assert.deepEqual(detectInfoTopics('quanto tempo de espera?'), []);
  assert.deepEqual(detectInfoTopics('quanto tempo demora?'), []);
});

test('o que não é pergunta de informação', () => {
  assert.deepEqual(detectInfoTopics('boa noite'), []);
  assert.deepEqual(detectInfoTopics('ok obrigado'), []);
  assert.deepEqual(detectInfoTopics('sim'), []);
  assert.deepEqual(detectInfoTopics('Ana Luiza'), []);
  assert.deepEqual(detectInfoTopics('sábado'), []);
  assert.deepEqual(detectInfoTopics('19h30'), []);
  assert.deepEqual(detectInfoTopics('somos 4'), []);
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
