// Notificações push dos apps instalados (Caixa e Na Mesa): avisam com o app fechado e
// atualizam a bolinha com o número no ícone (o service worker chama setAppBadge).
//
// As chaves VAPID (que identificam este servidor pros serviços de push do Google, Apple
// e Mozilla) são geradas sozinhas na primeira subida e ficam no banco: não precisa
// configurar nada no Hostinger. Trocar as chaves invalida todas as inscrições.
import webpush from 'web-push';
import db from '../config/db.js';

export const PUSH_APPS = ['caixa', 'namesa'];
const SUBJECT = 'https://furtherads.online';
const APP_URL = { caixa: '/balcao', namesa: '/namesa' };

let vapidCache = null;

export async function getVapidKeys(dbImpl = db) {
  if (vapidCache) return vapidCache;
  let { rows } = await dbImpl.query(`SELECT public_key, private_key FROM push_config WHERE id = 1`);
  if (!rows[0]) {
    const keys = webpush.generateVAPIDKeys();
    // Dois processos subindo juntos: o primeiro grava, o outro usa o que foi gravado.
    await dbImpl.query(
      `INSERT INTO push_config (id, public_key, private_key) VALUES (1, ?, ?) ON CONFLICT (id) DO NOTHING`,
      [keys.publicKey, keys.privateKey]
    );
    ({ rows } = await dbImpl.query(`SELECT public_key, private_key FROM push_config WHERE id = 1`));
  }
  vapidCache = { publicKey: rows[0].public_key, privateKey: rows[0].private_key };
  webpush.setVapidDetails(SUBJECT, vapidCache.publicKey, vapidCache.privateKey);
  return vapidCache;
}

export async function saveSubscription({ clientId, app, subscription }, dbImpl = db) {
  await dbImpl.query(
    `INSERT INTO push_subscriptions (client_id, app, endpoint, keys)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (endpoint, app) DO UPDATE SET client_id = excluded.client_id, keys = excluded.keys, updated_at = now()`,
    [clientId, app, subscription.endpoint, JSON.stringify(subscription.keys || {})]
  );
}

export async function removeSubscription({ endpoint, app }, dbImpl = db) {
  await dbImpl.query(`DELETE FROM push_subscriptions WHERE endpoint = ? AND app = ?`, [endpoint, app]);
}

// Manda pra todos os aparelhos inscritos daquele restaurante naquele app. Inscrição que
// o serviço de push diz que não existe mais (404/410: app desinstalado, permissão tirada)
// é apagada.
export async function pushToApp(clientId, app, payload, deps = {}) {
  const dbImpl = deps.db || db;
  const send = deps.send || ((sub, body) => webpush.sendNotification(sub, body, { TTL: 3600, urgency: 'high' }));
  if (!deps.send) await getVapidKeys(dbImpl);
  const { rows } = await dbImpl.query(
    `SELECT id, endpoint, keys FROM push_subscriptions WHERE client_id = ? AND app = ?`,
    [clientId, app]
  );
  const body = JSON.stringify({ url: APP_URL[app], ...payload });
  let delivered = 0;
  for (const row of rows) {
    try {
      await send({ endpoint: row.endpoint, keys: row.keys }, body);
      delivered++;
    } catch (error) {
      if (error.statusCode === 404 || error.statusCode === 410) {
        await dbImpl.query(`DELETE FROM push_subscriptions WHERE id = ?`, [row.id]);
      } else {
        console.error(`Push [client ${clientId}, ${app}]: falha ao enviar (${error.statusCode || error.message})`);
      }
    }
  }
  return delivered;
}

// Mesmo número da lista do Caixa: mensagens recebidas depois da última leitura da conversa.
export async function caixaUnreadCount(clientId, dbImpl = db) {
  const { rows } = await dbImpl.query(
    `SELECT COUNT(*) AS n FROM whatsapp_messages m
     JOIN whatsapp_contacts wc ON wc.id = m.contact_id
     WHERE wc.client_id = ? AND m.direction = 'inbound'
       AND (wc.last_read_at IS NULL OR m.created_at > (wc.last_read_at AT TIME ZONE 'UTC'))`,
    [clientId]
  );
  return Number(rows[0]?.n || 0);
}

export function buildInboundPayload({ contactId, profileName, waId, body, unread }) {
  return {
    title: profileName || `+${waId}`,
    body: String(body || '').slice(0, 180),
    tag: `msg-${contactId}`,
    badge: unread
  };
}

export function buildJoinedPayload({ name, partySize, waitingCount }) {
  const who = name || 'Alguém';
  return {
    title: 'Entrou na fila',
    body: `${who}${partySize ? `, ${partySize} ${partySize === 1 ? 'pessoa' : 'pessoas'}` : ''}. ${waitingCount} ${waitingCount === 1 ? 'grupo esperando' : 'grupos esperando'}.`,
    tag: 'fila',
    badge: waitingCount
  };
}

// Em segundo plano: notificação nunca atrasa nem derruba a gravação da mensagem.
export function notifyInboundMessage({ clientId, contactId, profileName, waId, body }) {
  Promise.resolve()
    .then(async () => {
      const unread = await caixaUnreadCount(clientId);
      await pushToApp(clientId, 'caixa', buildInboundPayload({ contactId, profileName, waId, body, unread }));
    })
    .catch((error) => console.error('Push: erro ao avisar mensagem nova:', error.message));
}

export function notifyQueueJoined({ clientId, name, partySize, waitingCount }) {
  pushToApp(clientId, 'namesa', buildJoinedPayload({ name, partySize, waitingCount }))
    .catch((error) => console.error('Push: erro ao avisar entrada na fila:', error.message));
}
