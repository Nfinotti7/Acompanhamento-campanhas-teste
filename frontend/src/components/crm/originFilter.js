// Filtros do funil por origem e por data de chegada (1ª mensagem do cliente).

export const PERIOD_OPTIONS = [
  { value: '', label: 'Chegou em qualquer data' },
  { value: 'today', label: 'Chegou hoje' },
  { value: '7', label: 'Chegou nos últimos 7 dias' },
  { value: '30', label: 'Chegou nos últimos 30 dias' }
];

export const ORIGIN_BADGES = {
  anuncio: '📢 Anúncio',
  google: '📢 Google Ads',
  anuncio_antigo: '🕓 Anúncio antigo',
  outras: 'Outras origens',
  organico: 'Orgânico'
};

const GROUP = { anuncio: 'anuncios', google: 'anuncios', anuncio_antigo: 'anuncio_antigo', organico: 'organico', outras: 'organico' };

// Dia em Brasília (UTC-3, sem horário de verão).
const brDay = (date) => new Date(new Date(date).getTime() - 3 * 3600000).toISOString().slice(0, 10);

// "Últimos 7 dias" inclui hoje.
export function filterByPeriod(contacts, period, now = new Date()) {
  if (!period) return contacts;
  const days = period === 'today' ? 1 : Number(period);
  const first = brDay(now.getTime() - (days - 1) * 86400000);
  return contacts.filter((c) => c.first_contact_at && brDay(c.first_contact_at) >= first);
}

export function filterByOrigin(contacts, origin) {
  if (!origin) return contacts;
  return contacts.filter((c) => GROUP[c.origin_category] === origin);
}

export function countByOrigin(contacts) {
  const counts = { total: contacts.length, anuncios: 0, anuncio_antigo: 0, organico: 0 };
  for (const c of contacts) if (GROUP[c.origin_category]) counts[GROUP[c.origin_category]] += 1;
  return counts;
}
