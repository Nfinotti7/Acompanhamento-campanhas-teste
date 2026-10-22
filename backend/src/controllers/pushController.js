import { getVapidKeys, saveSubscription, removeSubscription, PUSH_APPS } from '../services/pushNotify.js';

function resolveClientId(req) {
  return req.user.role === 'admin'
    ? (req.query.clientId || req.body.clientId || req.user.clientId)
    : req.user.clientId;
}

export async function getPushPublicKey(_req, res) {
  try {
    const { publicKey } = await getVapidKeys();
    return res.json({ publicKey });
  } catch (error) {
    console.error('Push public key error:', error);
    return res.status(500).json({ error: 'Notificações indisponíveis.' });
  }
}

// O aparelho autorizou notificações: liga a inscrição dele ao restaurante logado.
export async function subscribePush(req, res) {
  try {
    const clientId = resolveClientId(req);
    const { app, subscription } = req.body || {};
    if (!clientId) return res.status(400).json({ error: 'ID do cliente é obrigatório.' });
    if (!PUSH_APPS.includes(app)) return res.status(400).json({ error: 'App inválido.' });
    if (!subscription?.endpoint || !/^https:\/\//.test(subscription.endpoint)) {
      return res.status(400).json({ error: 'Inscrição inválida.' });
    }
    await saveSubscription({ clientId, app, subscription });
    return res.json({ ok: true });
  } catch (error) {
    console.error('Push subscribe error:', error);
    return res.status(500).json({ error: 'Erro ao ativar notificações.' });
  }
}

// Sair do app: o aparelho para de receber avisos daquele restaurante.
export async function unsubscribePush(req, res) {
  try {
    const { app, endpoint } = req.body || {};
    if (!PUSH_APPS.includes(app) || !endpoint) return res.status(400).json({ error: 'Pedido inválido.' });
    await removeSubscription({ endpoint, app });
    return res.json({ ok: true });
  } catch (error) {
    console.error('Push unsubscribe error:', error);
    return res.status(500).json({ error: 'Erro ao desativar notificações.' });
  }
}
