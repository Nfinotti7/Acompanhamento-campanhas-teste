// Calendário de datas que movimentam restaurante, com a antecedência certa pra começar a
// campanha. Tudo puro: as datas móveis (Páscoa, Carnaval, Dia das Mães...) saem de regra.
import { addDays, weekdayOf } from './reservationSlots.js';

const pad = (n) => String(n).padStart(2, '0');

// Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher).
export function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${pad(month)}-${pad(day)}`;
}

// n-ésimo dia da semana (0 = domingo) de um mês: "2º domingo de maio".
export function nthWeekday(year, month, weekday, n) {
  let day = `${year}-${pad(month)}-01`;
  while (weekdayOf(day) !== weekday) day = addDays(day, 1);
  return addDays(day, 7 * (n - 1));
}

// lead: quantos dias antes vale começar a campanha.
export function datesForYear(year) {
  const easter = easterSunday(year);
  return [
    { key: 'mulher', name: 'Dia Internacional da Mulher', date: `${year}-03-08`, lead: 7, tip: 'Mesa pra grupo de amigas e oferta cortesia pra elas.' },
    { key: 'carnaval', name: 'Carnaval', date: addDays(easter, -47), lead: 10, tip: 'Feriado prolongado: reforçar horário especial e reserva antecipada.' },
    { key: 'sexta-santa', name: 'Sexta-feira Santa', date: addDays(easter, -2), lead: 12, tip: 'Cardápio de peixes e frutos do mar; reservas de almoço em família.' },
    { key: 'pascoa', name: 'Páscoa', date: easter, lead: 12, tip: 'Almoço em família: abrir reservas cedo e destacar menu especial.' },
    { key: 'maes', name: 'Dia das Mães', date: nthWeekday(year, 5, 0, 2), lead: 14, tip: 'Maior data de almoço do ano: reservas lotam, comece cedo e limite horários.' },
    { key: 'namorados', name: 'Dia dos Namorados', date: `${year}-06-12`, lead: 14, tip: 'Mesa pra dois e menu especial: reservas esgotam, comece 2 semanas antes.' },
    { key: 'amigo', name: 'Dia do Amigo', date: `${year}-07-20`, lead: 7, tip: 'Mesa pra grupo e combo compartilhado.' },
    { key: 'pais', name: 'Dia dos Pais', date: nthWeekday(year, 8, 0, 2), lead: 14, tip: 'Almoço em família: destaque rodízio e churrasco, e abra reservas cedo.' },
    { key: 'cliente', name: 'Dia do Cliente', date: `${year}-09-15`, lead: 7, tip: 'Ação de relacionamento: cortesia ou benefício pra quem já frequenta.' },
    { key: 'criancas', name: 'Dia das Crianças', date: `${year}-10-12`, lead: 10, tip: 'Família com criança: brinde infantil e mesa maior.' },
    { key: 'black-friday', name: 'Black Friday', date: nthWeekday(year, 11, 5, 4), lead: 10, tip: 'Vale-presente e combos com desconto pra usar depois.' },
    { key: 'confraternizacao', name: 'Confraternizações de fim de ano', date: `${year}-12-01`, lead: 30, tip: 'Mesas grandes de empresas: comece em novembro com contato direto e orçamento.' },
    { key: 'natal', name: 'Natal', date: `${year}-12-25`, lead: 20, tip: 'Ceia e almoço de Natal: reservas e encomendas abrem cedo.' },
    { key: 'reveillon', name: 'Réveillon', date: `${year}-12-31`, lead: 20, tip: 'Menu fechado com pagamento antecipado de reserva.' }
  ];
}

// Datas dentro da janela [today, today + within], com a data pra começar a campanha.
// status: 'comecar_agora' (já passou do ponto ideal de início), 'em_breve'.
export function upcomingDates(today, withinDays = 60) {
  const year = Number(today.slice(0, 4));
  const all = [...datesForYear(year), ...datesForYear(year + 1)];
  const limit = addDays(today, withinDays);
  return all
    .filter((d) => d.date >= today && d.date <= limit)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => {
      const startOn = addDays(d.date, -d.lead);
      const daysUntil = Math.round((Date.parse(`${d.date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400e3);
      return { ...d, startOn, daysUntil, status: startOn <= today ? 'comecar_agora' : 'em_breve' };
    });
}
