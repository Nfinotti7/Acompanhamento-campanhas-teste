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

const PATTERNS = {
  menu: /\b(cardapios?|menu)\b/,
  prices: /\b(precos?|valor(es)?|quanto (custa|e|fica|sai|ta|esta)|rodizio|premium|happy hour)\b/,
  hours: /\b(horarios?|funcionamento|que horas (voces )?(abre|abrem|fecha|fecham|funciona)|ate que horas|(abre|abrem|aberto|abertos|funciona|funcionam) (hoje|amanha|domingo|segunda|terca|quarta|quinta|sexta|sabado|feriado))\b/,
  location: /\b(endereco|localizacao|localiza|onde (voces )?(fica|ficam|e|estao|esta)|como (chego|chegar|faco pra chegar)|qual o local|mapa|maps)\b/
};

// Pergunta longa tem outra coisa junto ("tem opção vegana no cardápio?"): fica com a equipe.
const MAX_WORDS = 15;

function clean(text) {
  return normalize(text).replace(/[!?.,;]+/g, ' ').replace(/\s+/g, ' ').trim();
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
