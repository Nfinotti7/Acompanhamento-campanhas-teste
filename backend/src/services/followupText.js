// Lembrete de reserva, pedido de avaliação pós-visita e relatório do dono. Tudo puro (sem
// banco), pra testar sem WhatsApp. O envio mora em followupBot.js e ownerReport.js.
import { normalize } from './waitlistText.js';

const OFFSET_MS = -3 * 3600e3; // Brasília, sem horário de verão

export const DEFAULT_FOLLOWUP_SETTINGS = {
  reminder_enabled: false,
  reminder_hours_before: 3,
  review_enabled: false,
  google_review_url: '',
  report_enabled: false,
  owner_phones: '',
  // Lista de espera de vaga: oferece avisar quando abrir mesa num dia lotado.
  vacancy_enabled: false,
  // Alertas de campanha pro WhatsApp da agência (CPL subindo, anúncio sem entrega).
  alerts_enabled: false,
  alert_phones: '',
  // Fora do horário: responde e deixa anotado pra equipe retomar (afterHoursBot.js).
  after_hours_enabled: false,
  after_hours_from: '23:00',
  after_hours_to: '10:00',
  // Clube de fidelidade (loyalty.js): desligado até combinar com o restaurante.
  loyalty_enabled: false,
  loyalty_goal: 10,
  loyalty_reward: 'uma sobremesa por conta da casa',
  messages: {}
};

export const DEFAULT_FOLLOWUP_MESSAGES = {
  reminder: 'Oi, {nome}! Passando pra lembrar da sua reserva no {restaurante}: {dia}, às {hora}, para {pessoas}. Pode confirmar que você vem? É só responder SIM. Se precisar mudar o horário, responda MUDAR; se não puder vir, CANCELAR.',
  reminderThanks: 'Combinado, {nome}! Presença confirmada. Te esperamos às {hora} 🙂',
  reviewAsk: '{nome}, obrigado por visitar o {restaurante}! De 1 a 5, como foi a sua experiência? É só responder com o número 🙂',
  reviewHigh: 'Que bom saber, {nome}! 🙏 Se puder deixar sua avaliação no Google, ajuda demais a gente: {link}',
  reviewHighNoLink: 'Que bom saber, {nome}! Obrigado pelo carinho, esperamos você de volta em breve 🙂',
  afterHours: 'Oi, {nome}! Recebemos sua mensagem 🙂 No momento estamos fora do horário de atendimento, mas já deixei anotado e retornamos a partir das {ate}.',
  loyaltyBalance: '{nome}, você tem {pontos} de {meta} pontos no nosso clube 🎉 Faltam {faltam} pra ganhar {premio}.',
  loyaltyEarned: 'Obrigado pela visita, {nome}! Mais 1 ponto no nosso clube: agora são {pontos} de {meta} 🎉',
  loyaltyReward: '🎁 Parabéns, {nome}! Você completou {meta} pontos e ganhou {premio}. É só avisar a equipe na sua próxima visita.',
  reviewLow: 'Poxa, sinto muito que não tenha sido perfeito, {nome}. Me conta o que podemos melhorar? Vou chamar alguém do nosso time pra cuidar disso pessoalmente.'
};

export const FOLLOWUP_MESSAGE_KEYS = Object.keys(DEFAULT_FOLLOWUP_MESSAGES);

// Horário de envio: ninguém recebe lembrete de madrugada nem pedido de avaliação tarde da noite.
export const REMINDER_HOURS = { from: 8, to: 21.5 };
export const REVIEW_HOURS = { from: 9, to: 22 };
// O lembrete não sai nos últimos 45 min antes da reserva (já não adianta).
export const REMINDER_CUTOFF_MS = 45 * 60e3;
// O pedido de avaliação vale por até 20h depois do fim da reserva.
export const REVIEW_MAX_AGE_MS = 20 * 3600e3;
// A nota respondida depois disso não é lida como nota.
export const RATING_WINDOW_MS = 48 * 3600e3;

function localHour(date) {
  const d = new Date(date.getTime() + OFFSET_MS);
  return d.getUTCHours() + d.getUTCMinutes() / 60;
}

function inHours(date, { from, to }) {
  const h = localHour(date);
  return h >= from && h < to;
}

// Quando o lembrete passa a poder sair: N horas antes, mas nunca antes das 8h do dia.
export function reminderSendAfter(startsAt, hoursBefore) {
  const start = new Date(startsAt);
  const target = new Date(start.getTime() - hoursBefore * 3600e3);
  const local = new Date(target.getTime() + OFFSET_MS);
  const hour = local.getUTCHours() + local.getUTCMinutes() / 60;
  if (hour >= REMINDER_HOURS.from) return target;
  // Madrugada: sai às 8h daquele mesmo dia.
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), REMINDER_HOURS.from) - OFFSET_MS);
}

// Já passou da hora de mandar o lembrete desta reserva? Reserva feita depois do ponto de
// envio (marcou de última hora) não recebe lembrete: seria uma mensagem logo após a reserva.
export function isReminderDue({ startsAt, createdAt, now, hoursBefore }) {
  const start = new Date(startsAt);
  const after = reminderSendAfter(start, hoursBefore);
  if (now.getTime() < after.getTime()) return false;
  if (now.getTime() > start.getTime() - REMINDER_CUTOFF_MS) return false;
  if (createdAt && new Date(createdAt).getTime() > after.getTime()) return false;
  return inHours(now, REMINDER_HOURS);
}

// Pedido de avaliação: depois do fim da reserva, dentro do horário e do prazo.
export function isReviewDue({ endsAt, now }) {
  const ends = new Date(endsAt).getTime();
  if (now.getTime() < ends || now.getTime() > ends + REVIEW_MAX_AGE_MS) return false;
  return inHours(now, REVIEW_HOURS);
}

// "SIM", "confirmo", "tá confirmado", "estarei lá"... Frase longa ou com pedido de mudança
// não conta: vai pra quem tratar.
export function isConfirmReply(text) {
  const t = normalize(text).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t || t.split(' ').length > 6) return false;
  if (/\b(nao|mudar|trocar|remarcar|cancel\w*|desmarcar|atras\w*|adiar)\b/.test(t)) return false;
  return /^(sim|s|ss|simm+|confirmo|confirmado|confirmada|confirmei|ok|okay|okk|certo|combinado|fechado|pode ser|vou sim|vamos sim|estarei la|estaremos la|estamos indo|ta confirmado|esta confirmado|presenca confirmada|com certeza|claro)\b/.test(t)
    || /\bconfirm\w*\b/.test(t);
}

// Nota de 1 a 5: "5", "nota 4", "4 estrelas", "5/5", "⭐⭐⭐⭐". Mais que isso é conversa.
export function parseRating(text) {
  const raw = String(text || '').trim();
  const stars = raw.match(/^(?:⭐️?|🌟){1,5}$/u);
  if (stars) return [...raw.matchAll(/⭐|🌟/gu)].length;
  const t = normalize(raw).replace(/[.!]+$/, '').trim();
  const m = t.match(/^(?:nota\s*)?([1-5])(?:\s*(?:\/\s*5|estrelas?|pontos?))?$/);
  return m ? Number(m[1]) : null;
}

export function pluralPeople(n) {
  return n === 1 ? '1 pessoa' : `${n} pessoas`;
}

// Telefones do dono: separados por vírgula ou quebra de linha. Só dígitos; sem DDI vira 55.
export function parseOwnerPhones(value) {
  const list = Array.isArray(value) ? value : String(value || '').split(/[,;\n]+/);
  const out = [];
  for (const item of list) {
    let digits = String(item).replace(/\D/g, '');
    if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
    if (digits.length >= 12 && digits.length <= 14 && !out.includes(digits)) out.push(digits);
  }
  return out;
}
