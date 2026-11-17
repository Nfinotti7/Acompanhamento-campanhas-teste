// Configuração do atendente com IA (aiConcierge.js). Mora em reservation_settings.config.ai,
// junto das outras configurações do Balcão. Desligado por padrão.

export const DEFAULT_AI_SETTINGS = {
  enabled: false,
  // Com números aqui, só eles falam com a IA (modo de teste); vazio = todo mundo.
  test_phones: [],
  tone: 'Fale como alguém da casa recebendo o cliente com carinho: caloroso, simpático e natural, '
    + 'em português do Brasil. Mensagens curtas, no máximo um emoji por mensagem, sem listas longas '
    + 'e sem linguagem formal ("prezado", "informamos"). Chame o cliente pelo primeiro nome.',
  extra: ''
};

const digits = (value) => String(value || '').replace(/\D/g, '');

export function isAiActiveFor(settings, waId) {
  const ai = settings?.ai;
  if (!ai?.enabled) return false;
  const phones = Array.isArray(ai.test_phones) ? ai.test_phones.map(digits).filter(Boolean) : [];
  if (phones.length === 0) return true;
  const wa = digits(waId);
  return phones.some((p) => wa.endsWith(p) || p.endsWith(wa));
}

// Devolve a mensagem de erro (pra tela) ou null. Quem salva transforma em erro de configuração.
export function validateAiSettings(ai) {
  if (typeof ai?.enabled !== 'boolean') return 'Atendente com IA: valor inválido.';
  if (!Array.isArray(ai.test_phones) || ai.test_phones.length > 20
      || ai.test_phones.some((p) => !/^\d{8,15}$/.test(String(p)))) {
    return 'Atendente com IA: use até 20 números, só com dígitos (ex.: 5562981479128).';
  }
  if (typeof ai.tone !== 'string' || ai.tone.length > 1500) return 'Tom de voz: até 1500 caracteres.';
  if (typeof ai.extra !== 'string' || ai.extra.length > 2000) return 'Instruções extras: até 2000 caracteres.';
  return null;
}
