// Esconde dados pessoais do texto que vai para o Gemini (plano grátis pode usar o conteúdo
// pra melhorar produtos do Google). Só a cópia enviada é alterada: o que fica no banco e
// aparece no Balcão continua com os números reais.
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[A-Za-z]{2,}/g;
const CNPJ = /(?<!\d)(?:\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{14})(?!\d)/g;
const CPF_MASKED = /(?<!\d)\d{3}\.\d{3}\.\d{3}-\d{2}(?!\d)/g;
// Sequência de dígitos com separadores comuns de telefone; só vale com 10 a 13 dígitos
// (data, horário, preço e número de pessoas têm menos).
const DIGIT_RUN = /[+(]?\d[\d\s().-]{8,18}\d/g;

// Celular sem DDD (9 8147-9128): não colide com data, hora nem preço.
const MOBILE_NO_AREA = /(?<!\d)9\s?\d{4}[\s.-]?\d{4}(?!\d)/g;
// Data com ano (25.11.2026, 2026-11-25) e sequência só de números curtos (mesas 12 14 16 18 20)
// somam 10 dígitos mas não são telefone.
const DATE_LIKE = /^\(?(?:\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4}|\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2})/;

function redactDigitRun(match) {
  if (DATE_LIKE.test(match) || !/\d{4}/.test(match)) return match;
  const digits = match.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 13) return match;
  // 11 dígitos colados: celular brasileiro tem 9 depois do DDD; senão é CPF.
  if (digits.length === 11 && /^\d+$/.test(match) && digits[2] !== '9') return '[CPF]';
  return '[telefone]';
}

export function redactPii(text) {
  return String(text ?? '')
    .replace(EMAIL, '[e-mail]')
    .replace(CNPJ, '[CNPJ]')
    .replace(CPF_MASKED, '[CPF]')
    .replace(DIGIT_RUN, redactDigitRun)
    .replace(MOBILE_NO_AREA, '[telefone]');
}

// Histórico no formato do Gemini: reescreve só parts[].text das falas do cliente (role 'user')
// e devolve uma cópia. A fala da casa (ex.: o telefone do restaurante) segue como está, senão o
// modelo repetiria "[telefone]" pro cliente.
export function redactContents(contents) {
  return contents.map((c) => (c.role !== 'user' ? c : {
    ...c,
    parts: c.parts.map((p) => (typeof p.text === 'string' ? { ...p, text: redactPii(p.text) } : p))
  }));
}
