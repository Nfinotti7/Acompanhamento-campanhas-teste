// Configuração do atendente com IA (aiConcierge.js). Mora em reservation_settings.config.ai,
// junto das outras configurações do Balcão. Desligado por padrão.

export const DEFAULT_AI_SETTINGS = {
  enabled: false,
  // Pausa geral (botão no Balcão): a IA continua configurada, mas ninguém fala com ela até retomar.
  paused: false,
  // A atendente só fala com quem chegou por anúncio (source = 'ad'); os demais seguem nos robôs antigos.
  only_ad_leads: true,
  // Nome da atendente: ela se apresenta por ele na primeira resposta de cada conversa.
  name: 'Maria',
  // Com números aqui, só eles falam com a IA (modo de teste); vazio = todo mundo.
  test_phones: [],
  // Números que falam com a IA além dos leads de anúncio (dono, gerente, quem quer ver ela
  // funcionando). Diferente de test_phones, não tira a IA de mais ninguém.
  extra_phones: [],
  tone: 'Fale como alguém da casa recebendo o cliente com carinho: caloroso, simpático e natural, '
    + 'em português do Brasil. Mensagens curtas, no máximo um emoji por mensagem, sem listas longas '
    + 'e sem linguagem formal ("prezado", "informamos"). Chame o cliente pelo primeiro nome.',
  extra: '',
  // Cardápio detalhado (itens e preços) que a IA consulta pra responder "tem onigiri?". Fica
  // no prompt, então textos longos custam mais tokens por resposta.
  menu_details: '',
  // Eventos especiais (Black Friday, feriado, show): [{ title, starts_on, ends_on, details }], datas
  // AAAA-MM-DD. Só entram no prompt enquanto valem ou faltando até EVENT_LOOKAHEAD_DAYS (aiPrompt.js).
  events: []
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
function validateEvents(events) {
  if (events === undefined) return null;
  const msg = 'Eventos especiais: até 20, cada um com nome (até 80), início e fim (fim no mesmo dia ou depois) e detalhes até 1500 caracteres.';
  if (!Array.isArray(events) || events.length > 20) return msg;
  for (const e of events) {
    if (typeof e?.title !== 'string' || !e.title.trim() || e.title.length > 80) return msg;
    if (!ISO_DATE.test(String(e.starts_on)) || !ISO_DATE.test(String(e.ends_on)) || e.ends_on < e.starts_on) return msg;
    if (typeof e.details !== 'string' || e.details.length > 1500) return msg;
  }
  return null;
}

const digits = (value) => String(value || '').replace(/\D/g, '');

// Celular brasileiro: o WhatsApp guarda o mesmo número com ou sem o 9 extra (55 62 9 8147-9128
// ou 55 62 8147-9128; no Malibu, 145 de 149 contatos estão sem). Compara sem o país e sem o 9.
function brPhoneKey(value) {
  let d = digits(value);
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
  if (d.length === 11 && d[2] === '9') d = d.slice(0, 2) + d.slice(3);
  return d;
}

const phoneKeys = (list) => (Array.isArray(list) ? list.map(brPhoneKey).filter(Boolean) : []);
const inPhoneList = (keys, waId) => {
  const wa = brPhoneKey(waId);
  return Boolean(wa) && keys.some((p) => wa === p || wa.endsWith(p) || p.endsWith(wa));
};

export function isAiActiveFor(settings, waId, source) {
  const ai = settings?.ai;
  if (!ai?.enabled || ai.paused) return false;
  const phones = phoneKeys(ai.test_phones);
  // Com lista de teste, só valem os números dela (mesmo sem ser lead de anúncio: é como se testa).
  if (phones.length > 0) return inPhoneList(phones, waId);
  if (!ai.only_ad_leads || source === 'ad') return true;
  // Números liberados: falam com a IA mesmo sem ser lead de anúncio, sem tirar ninguém.
  return inPhoneList(phoneKeys(ai.extra_phones), waId);
}

// Estado da IA numa conversa, pra lista do Balcão: 'on' (atendendo), 'paused' (pausada nessa
// conversa: equipe respondeu ou ela chamou a equipe) ou null (não é atendida pela IA).
export function aiStateFor(settings, { wa_id: waId, bot_paused_until: pausedUntil, source }, now = new Date()) {
  if (!/^\d{8,15}$/.test(String(waId || '')) || !isAiActiveFor(settings, waId, source)) return null;
  return pausedUntil && new Date(pausedUntil).getTime() > now.getTime() ? 'paused' : 'on';
}

// Devolve a mensagem de erro (pra tela) ou null. Quem salva transforma em erro de configuração.
export function validateAiSettings(ai) {
  if (typeof ai?.enabled !== 'boolean' || typeof ai.paused !== 'boolean') return 'Atendente com IA: valor inválido.';
  if (ai.only_ad_leads !== undefined && typeof ai.only_ad_leads !== 'boolean') return 'Atendente com IA: valor inválido.';
  if (!Array.isArray(ai.test_phones) || ai.test_phones.length > 20
      || ai.test_phones.some((p) => !/^\d{8,15}$/.test(String(p)))) {
    return 'Atendente com IA: use até 20 números, só com dígitos (ex.: 5562981479128).';
  }
  if (ai.extra_phones !== undefined && (!Array.isArray(ai.extra_phones) || ai.extra_phones.length > 20
      || ai.extra_phones.some((p) => !/^\d{8,15}$/.test(String(p))))) {
    return 'Números liberados: até 20, só com dígitos (ex.: 5562981479128).';
  }
  if (typeof ai.name !== 'string' || ai.name.length > 40) return 'Nome da atendente: até 40 caracteres.';
  if (typeof ai.tone !== 'string' || ai.tone.length > 1500) return 'Tom de voz: até 1500 caracteres.';
  if (typeof ai.extra !== 'string' || ai.extra.length > 2000) return 'Instruções extras: até 2000 caracteres.';
  if (typeof ai.menu_details !== 'string' || ai.menu_details.length > 8000) return 'Cardápio detalhado: até 8000 caracteres.';
  return validateEvents(ai.events);
}
