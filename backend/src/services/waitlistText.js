// Textos e leitura das mensagens do robô da fila (Na Mesa). Tudo puro, sem banco.

export const DEFAULT_MESSAGES = {
  askSize: 'Oi, {nome}! Pra quantas pessoas?',
  askSizeAgain: 'Não entendi 😅 Me manda só o número de pessoas, por exemplo: 4',
  joined: 'Pronto, {nome}! Você está na fila. Posição: {posicao}. Espera estimada: ~{espera} min. Mande qualquer mensagem pra ver sua posição, ou SAIR pra sair da fila.',
  status: '{nome}, sua posição na fila é {posicao}. Espera estimada: ~{espera} min. Mande SAIR pra sair da fila.',
  near: 'Só {faltam} na sua frente. Fique por perto!',
  called: '{nome}, sua mesa está pronta! Dirija-se à recepção. Seguramos por {tolerancia} minutos.',
  calledReminder: '{nome}, sua mesa já está pronta! É só ir até a recepção.',
  noShow: 'Como não te encontramos, liberamos a vaga. Se ainda quiser, mande FILA.',
  left: 'Tudo bem, você saiu da fila. Se quiser voltar, é só mandar FILA.'
};

export const MESSAGE_KEYS = Object.keys(DEFAULT_MESSAGES);

function normalize(text) {
  return String(text || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim();
}

// Só "FILA" sozinho ou o código que o QR põe na mensagem pronta. Frase comum
// ("tem fila hoje?") não pode acordar o robô num número que também atende gente.
export function isJoinCommand(text) {
  const t = normalize(text).replace(/[.!?]+$/, '').trim();
  return t === 'fila' || /\bcod\.?\s*fila\b/.test(t);
}

export function isLeaveCommand(text) {
  const t = normalize(text).replace(/[.!?]+$/, '').trim();
  return /^(sair|cancelar|cancela|desistir|desisto)( da fila)?$/.test(t);
}

const NUMBER_WORDS = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6,
  sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12
};

function readNumber(token) {
  if (/^\d+$/.test(token)) return parseInt(token, 10);
  return NUMBER_WORDS[token] ?? null;
}

function inRange(n) {
  return Number.isInteger(n) && n >= 1 && n <= 30 ? n : null;
}

export function parsePartySize(text) {
  const t = normalize(text);
  if (!t) return null;

  const plus = t.match(/eu e mais (\d+|[a-z]+)/);
  if (plus) {
    const n = readNumber(plus[1]);
    if (n !== null) return inRange(n + 1);
  }
  const digits = t.match(/\d+/);
  if (digits) return inRange(parseInt(digits[0], 10));
  if (/\bcasal\b/.test(t)) return 2;
  if (/\bso eu\b|\bsozinh[oa]\b/.test(t)) return 1;
  for (const word of t.split(/[^a-z]+/)) {
    if (word in NUMBER_WORDS) return inRange(NUMBER_WORDS[word]);
  }
  return null;
}

// wa_id do WhatsApp: só dígitos, com DDI. Número brasileiro digitado sem 55 ganha o 55.
export function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) return digits;
  return null;
}

export function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || '';
}

export function formatGroupsAhead(n) {
  return n === 1 ? '1 grupo' : `${n} grupos`;
}

export function renderMessage(template, vars = {}) {
  const text = String(template || '')
    .replace(/\{(\w+)\}/g, (_, key) => (vars[key] ?? '').toString())
    // Nome vazio: "Oi, !" vira "Oi!" e ", sua mesa" vira "Sua mesa".
    .replace(/\s*,\s*([!?.])/g, '$1')
    .replace(/^\s*,\s*/, '');
  return text.charAt(0).toUpperCase() + text.slice(1);
}
