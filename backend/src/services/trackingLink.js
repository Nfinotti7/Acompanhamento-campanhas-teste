// Link Rastreável: furtherads.online/r/<slug> grava o clique (UTMs, fbclid, gclid) com um
// código curto e redireciona pro wa.me com a mensagem pronta terminando em "(cód. XXXXX)".
// Quando essa mensagem chega (Baileys ou Cloud API), o código liga a conversa ao clique.

// Sem 0/O, 1/I/L: o código é lido e às vezes redigitado por gente.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 5;

export function generateCode(random = Math.random) {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  }
  return code;
}

export function buildTrackedMessage(message, code) {
  const base = (message || '').trim() || 'Olá!';
  return `${base} (cód. ${code})`;
}

// Aceita "cód. ABCDE", "cod ABCDE", "COD.ABCDE" -- o lead pode editar a mensagem.
const CODE_PATTERN = new RegExp(`c[óo]d\\.?\\s*([${CODE_ALPHABET}]{${CODE_LENGTH}})\\b`, 'i');

export function extractTrackingCode(body) {
  if (!body) return null;
  const match = String(body).match(CODE_PATTERN);
  return match ? match[1].toUpperCase() : null;
}

export function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

export function buildWaMeUrl(phone, text) {
  return `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(text)}`;
}

// Slug do link: minúsculas, números e hífen.
export function slugify(value) {
  return String(value || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

const TRACKED_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid'];

// Parâmetros do clique: os da URL acessada têm prioridade sobre os padrão do link
// (o anúncio pode acrescentar utm_campaign etc. por cima do link base).
export function collectClickParams(query = {}, linkDefaults = {}) {
  const params = {};
  for (const key of TRACKED_PARAMS) {
    const fromUrl = typeof query[key] === 'string' ? query[key].trim().slice(0, 500) : '';
    params[key] = fromUrl || linkDefaults[key] || null;
  }
  return params;
}

// Origem da conversa a partir do clique, no modelo do dashboard
// (source do contato: 'ad' = Meta Ads, 'google_ads', 'outras').
export function classifyClickSource(click) {
  const source = (click.utm_source || '').toLowerCase();
  if (click.gclid || /google|adwords|gads/.test(source)) return 'google_ads';
  if (click.fbclid || /facebook|instagram|^fb$|^ig$|meta/.test(source)) return 'ad';
  return 'outras';
}

// Robôs que abrem o link pra montar a prévia (WhatsApp, Facebook, etc.) não são cliques.
export function isPreviewBot(userAgent) {
  return /facebookexternalhit|facebot|whatsapp|telegrambot|twitterbot|slackbot|discordbot|linkedinbot|googlebot|bingbot/i.test(userAgent || '');
}
