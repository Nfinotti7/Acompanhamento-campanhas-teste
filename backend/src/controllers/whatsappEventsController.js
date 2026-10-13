import { subscribe } from '../services/sseHub.js';

function resolveClientId(req) {
  return req.user.role === 'admin'
    ? (req.query.clientId || req.body.clientId || req.user.clientId)
    : req.user.clientId;
}

export function streamWhatsAppEvents(req, res) {
  const clientId = resolveClientId(req);
  if (!clientId) {
    return res.status(400).json({ error: 'ID do cliente é obrigatório.' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    // Desliga o buffer do proxy reverso (ex: nginx) pra o evento chegar na hora,
    // nao so quando o buffer encher. Sem efeito em proxies que nao usam esse header.
    'X-Accel-Buffering': 'no'
  });
  res.write(': conectado\n\n');

  const unsubscribe = subscribe(clientId, (payload) => res.write(payload));

  const heartbeat = setInterval(() => {
    res.write(': ping\n\n');
  }, 20000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
}
