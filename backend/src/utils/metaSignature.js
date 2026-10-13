import crypto from 'node:crypto';

// A Meta assina o corpo cru de cada chamada de webhook com o App Secret do app
// (HMAC-SHA256, cabeçalho "X-Hub-Signature-256: sha256=<hex>"). Sem conferir isso,
// qualquer um que descubra a URL do webhook consegue injetar contatos/mensagens falsas.
export function isValidMetaSignature(rawBody, signatureHeader, appSecret) {
  if (!rawBody || !appSecret || typeof signatureHeader !== 'string') return false;
  if (!signatureHeader.startsWith('sha256=')) return false;

  const received = signatureHeader.slice('sha256='.length);
  if (!/^[0-9a-f]{64}$/i.test(received)) return false;

  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(received, 'hex'), Buffer.from(expected, 'hex'));
}
