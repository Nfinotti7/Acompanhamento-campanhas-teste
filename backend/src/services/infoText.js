// Respostas automáticas do Balcão (cardápio, localização, horário, preços): qual assunto a
// mensagem pergunta. Tudo puro, sem banco. Os textos de cada restaurante ficam na
// configuração de reservas (settings.info), editáveis no Configurar.
import { normalize } from './waitlistText.js';

// Ordem em que as respostas saem quando a mensagem pergunta mais de uma coisa.
export const INFO_TOPICS = ['menu', 'prices', 'hours', 'location'];

export const DEFAULT_INFO_SETTINGS = {
  enabled: false,
  menu: '',
  prices: '',
  hours: '',
  location: '',
  other: 'Claro, pode mandar sua dúvida 🙂',
  reserveHint: 'Quer garantir sua mesa? É só responder RESERVA que eu já faço a reserva pra você.'
};

// Cada assunto aceita as formas mais comuns de perguntar (ver infoText.test.js). O texto
// chega sem acento, minúsculo e com as abreviações expandidas (ABBREVIATIONS).
const PATTERNS = {
  menu: /\b(cardapios?|menus?|pratos|o que (voces )?(servem|tem)|opcoes do rodizio|o que vem no rodizio)\b/,
  // "quanto tempo de espera?" não é preço.
  prices: /\b(precos?|valor(es)?|quanto(?! tempo)|rodizio|premium|happy hour|promocao|promocoes|promo|desconto|por pessoa|crianca paga|criancas pagam|bariatric\w*)\b/,
  hours: /\b(horarios?|funcionamento|expediente|que horas|ate que hora|abre|abrem|aberto|abertos|funciona|funcionam|funcionando|fecha|fecham)\b/,
  location: /\b(endereco|localizacao|localizados?|local|onde|qual (o )?bairro|que bairro|qual bairro|qual (a )?rua|que rua|como (chego|chegar|faco (pra|para) chegar)|chegar ai|ponto de referencia|mapa|maps|waze|pin)\b/
};

// Como os leads escrevem no WhatsApp.
const ABBREVIATIONS = {
  vcs: 'voces', vc: 'voce', q: 'que', oq: 'o que', qto: 'quanto', qnto: 'quanto', qnt: 'quanto', qt: 'quanto',
  hr: 'horario', hrs: 'horario', loc: 'localizacao', end: 'endereco', tb: 'tambem', tbm: 'tambem', pf: 'por favor', pfv: 'por favor'
};

// Pergunta longa tem outra coisa junto ("tem opção vegana no cardápio?"): fica com a equipe.
const MAX_WORDS = 15;

function clean(text) {
  return normalize(text)
    .replace(/[!?.,;:()]+/g, ' ')
    .split(/\s+/)
    .map((word) => ABBREVIATIONS[word] || word)
    .join(' ')
    .trim();
}

export function detectInfoTopics(text) {
  const t = clean(text);
  if (!t || t.split(' ').length > MAX_WORDS) return [];
  return INFO_TOPICS.filter((topic) => PATTERNS[topic].test(t));
}

// "Tenho outra dúvida" (pergunta pronta do anúncio): responde na hora e deixa com a equipe.
export function isOtherQuestion(text) {
  return /^(tenho (uma |outra )?duvida|outra duvida|tenho uma pergunta)$/.test(clean(text));
}
