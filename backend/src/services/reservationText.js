// Textos e leitura das mensagens do robô de reserva. Tudo puro, sem banco.
// Nenhum texto diz que é robô: quem escreve não precisa saber (decisão do usuário).
import { normalize } from './waitlistText.js';
import { addDays, weekdayOf } from './reservationSlots.js';

export const DEFAULT_RESERVATION_MESSAGES = {
  askSize: 'Olá, {nome}! Quer fazer uma reserva no {restaurante}? Pra quantas pessoas?',
  askSizeAgain: 'Me manda só o número de pessoas, por exemplo: 4',
  askDay: 'Pra qual dia? (ex: hoje, amanhã, sábado, 25/10)',
  askDayAgain: 'Não consegui entender o dia 😅 Pode mandar assim: amanhã, sábado ou 25/10',
  dayUnavailable: 'Pra {dia} não temos reserva. Pra qual outro dia?',
  askTime: 'Pra {dia} tenho: {opcoes}. Qual prefere?',
  askTimeAgain: 'Me manda o número do horário que prefere: {opcoes}',
  noSlotsSuggest: 'Pra {dia} não tenho mais mesa pra {pessoas} pessoas. Tenho {proximoDia}: {opcoes}. Qual prefere?',
  noSlots: 'Pra {dia} não tenho mais mesa pra {pessoas} pessoas.',
  askName: 'A reserva fica em nome de {nome}? Responda SIM ou mande outro nome.',
  askNameEmpty: 'Em nome de quem fica a reserva?',
  confirm: 'Confirmando: {dia}, {hora}, {pessoas} pessoas, em nome de {nomeReserva}. Responda SIM pra confirmar.',
  slotTaken: 'Esse horário acabou de ser reservado. Pra {dia} ainda tenho: {opcoes}. Qual prefere?',
  confirmed: '✅ Reserva confirmada: {dia}, {hora}, {pessoas} pessoas, em nome de {nomeReserva}. A mesa fica guardada até {tolerancia} min depois do horário. Pra mudar o dia ou o horário, responda MUDAR. Pra cancelar, responda CANCELAR.',
  aborted: 'Tudo bem, não fiz a reserva. Se quiser, é só mandar RESERVA.',
  cancelPick: 'Qual reserva você quer cancelar? {opcoes}',
  cancelConfirm: 'Quer cancelar a reserva de {dia}, {hora}? Responda SIM.',
  cancelled: 'Reserva cancelada. Se quiser marcar de novo, é só mandar RESERVA.',
  cancelledByStaff: 'Sua reserva de {dia}, {hora} foi cancelada. Qualquer dúvida, é só responder aqui.',
  handoff: 'Só um instante, já te respondo 🙂',
  adFallbackAsk: 'Quer fazer uma reserva? Responda 1 pra reservar ou 2 pra falar com a gente.',
  changeAsk: 'Claro! Sua reserva está pra {dia}, {hora}, {pessoas} pessoas. Pra quando quer mudar? Pode mandar o dia, o horário ou os dois (ex: sábado 20h).',
  changePick: 'Qual reserva você quer mudar? {opcoes}',
  changeTimeUnavailable: 'Pra {dia}, {hora} não tenho mesa pra {pessoas} pessoas. Tenho: {opcoes}. Qual prefere?',
  changeNoSlots: 'Pra {dia} não tenho mais mesa pra {pessoas} pessoas. Quer tentar outro dia?',
  changeConfirm: 'Mudando sua reserva pra {dia}, {hora}, {pessoas} pessoas, em nome de {nomeReserva}. Responda SIM pra confirmar.',
  changed: '✅ Reserva alterada: {dia}, {hora}, {pessoas} pessoas, em nome de {nomeReserva}. A mesa fica guardada até {tolerancia} min depois do horário.'
};

export const RESERVATION_MESSAGE_KEYS = Object.keys(DEFAULT_RESERVATION_MESSAGES);

function clean(text) {
  return normalize(text).replace(/[.!?,;]+$/, '').trim();
}

// Só o código da mensagem pronta do anúncio, ou "reserva"/"reservar" sozinho. Frase
// comum ("aceitam reserva?") vai pro atendimento.
export function isReservationCommand(text) {
  const t = clean(text);
  return t === 'reserva' || t === 'reservar' || /\bcod\.?\s*reserva\b/.test(t);
}

export function isCancelCommand(text) {
  return /^(cancelar|cancela)( a| minha)?( reserva)?$/.test(clean(text));
}

// Pedido de mudança de quem já tem reserva: "MUDAR", "posso mudar o horário?", "trocar a
// data", "remarcar", "mudar pra 20h". O robô só atende se a pessoa tem reserva marcada.
const CHANGE_VERB = /\b(mudar|muda|alterar|altera|trocar|troca|remarcar|remarca|reagendar|adiar|antecipar)\b/;
const CHANGE_ALONE = /^(mudar|alterar|trocar|remarcar|reagendar)$/;

export function isChangeCommand(text) {
  const t = clean(text);
  if (CHANGE_ALONE.test(t) || /\b(remarcar|remarca|reagendar|adiar|antecipar)\b/.test(t)) return true;
  if (!CHANGE_VERB.test(t)) return false;
  return /\b(horario|hora|data|dia|reserva|hoje|amanha)\b/.test(t) || /\d/.test(t) || mentionsWeekday(t);
}

// Fala de horário sem dizer qual ("mudar o horário"), pra mostrar a lista do mesmo dia.
export function mentionsTimeWord(text) {
  return /\b(horario|hora)\b/.test(clean(text));
}

export function mentionsDayWord(text) {
  return /\b(data|dia)\b/.test(clean(text));
}

// Horário escrito por extenso numa frase ("sábado 20h", "pra 19:30", "às 21"), sem
// confundir com a data ("25/10"). Número sozinho não vale: pode ser item de lista.
export function extractTime(text) {
  const t = clean(text);
  const m = t.match(/\b(\d{1,2})\s*(?::|h)\s*(\d{2})?\b/) || t.match(/\bas (\d{1,2})\b(?!\s*\/)/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] || '00';
  if (h > 23 || Number(min) > 59) return null;
  return `${String(h).padStart(2, '0')}:${min}`;
}

// Nome completo mandado na hora do resumo ("Ana Luiza Pinheiro silva"): só letras, de 2 a
// 6 palavras e com alguma palavra do nome que já estava na reserva. Sem essa última regra,
// "tudo certo" viraria o nome da reserva.
export function correctedName(text, currentName) {
  const raw = String(text || '').trim().replace(/\s+/g, ' ');
  if (raw.length > 60 || !/^[\p{L}][\p{L}'’\- ]*$/u.test(raw)) return null;
  const words = clean(raw).split(' ');
  if (words.length < 2 || words.length > 6 || isYes(raw)) return null;
  const current = new Set(clean(currentName).split(/\s+/).filter((w) => w.length >= 2));
  if (!words.some((w) => current.has(w))) return null;
  if (clean(raw) === clean(currentName)) return null;
  return raw;
}

const YES_WORDS = new Set(['sim', 's', 'ok', 'okay', 'isso', 'confirmo', 'confirmar', 'confirma', 'pode', 'claro', 'certo', 'yes']);

export function isYes(text) {
  const raw = String(text || '').trim();
  if (/^👍/.test(raw)) return true;
  const first = clean(raw).split(/[\s,.!]+/)[0];
  return YES_WORDS.has(first);
}

const WEEKDAYS = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];

function validDay(y, m, d) {
  const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const parsed = new Date(`${iso}T12:00:00Z`);
  return parsed.getUTCMonth() + 1 === m && parsed.getUTCDate() === d ? iso : null;
}

export function parseDay(text, today) {
  const t = clean(text);
  if (!t) return null;
  if (/\bdepois de amanha\b/.test(t)) return addDays(today, 2);
  if (/\bamanha\b/.test(t)) return addDays(today, 1);
  if (/\bhoje\b/.test(t)) return today;

  const [ty, tm, td] = today.split('-').map(Number);
  const full = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (full) {
    const d = Number(full[1]);
    const m = Number(full[2]);
    if (full[3]) {
      const y = Number(full[3].length === 2 ? `20${full[3]}` : full[3]);
      return validDay(y, m, d);
    }
    const thisYear = validDay(ty, m, d);
    if (!thisYear) return null;
    return thisYear >= today ? thisYear : validDay(ty + 1, m, d);
  }

  const dia = t.match(/\bdia (\d{1,2})\b/);
  if (dia) {
    const d = Number(dia[1]);
    if (d >= td) return validDay(ty, tm, d);
    return tm === 12 ? validDay(ty + 1, 1, d) : validDay(ty, tm + 1, d);
  }

  const words = t.split(/[^a-z]+/);
  const index = WEEKDAYS.findIndex((w) => words.includes(w));
  if (index >= 0) return addDays(today, (index - weekdayOf(today) + 7) % 7);
  return null;
}

export function mentionsWeekday(text) {
  const words = clean(text).split(/[^a-z]+/);
  return WEEKDAYS.some((w) => words.includes(w));
}

export function parseTimeChoice(text, options) {
  const t = clean(text);
  const pick = t.match(/^(\d{1,2})\s*[).]?$/);
  if (pick) {
    const n = Number(pick[1]);
    // "12" com 16 opções: quem responde a hora pelada quer meio-dia, não o item 12.
    const asHour = `${String(n).padStart(2, '0')}:00`;
    if (n >= 10 && options.includes(asHour)) return asHour;
    if (n >= 1 && n <= options.length) return options[n - 1];
  }
  const time = t.match(/(\d{1,2})(?:\s*(?:h|:)\s*(\d{2})?|\s+e\s+(\d{2}))?/);
  if (!time) return null;
  const hhmm = `${time[1].padStart(2, '0')}:${time[2] || time[3] || '00'}`;
  return options.includes(hhmm) ? hhmm : null;
}

export function formatTime(hhmm) {
  const [h, m] = hhmm.split(':');
  return m === '00' ? `${Number(h)}h` : `${Number(h)}h${m}`;
}

const WEEKDAY_LABELS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

export function formatDayLabel(day, today) {
  const [, m, d] = day.split('-');
  const short = `${d}/${m}`;
  if (day === today) return `hoje (${short})`;
  if (day === addDays(today, 1)) return `amanhã (${short})`;
  return `${WEEKDAY_LABELS[weekdayOf(day)]} ${short}`;
}

export function formatOptions(times) {
  return times.map((t, i) => `${i + 1}) ${formatTime(t)}`).join('  ');
}
