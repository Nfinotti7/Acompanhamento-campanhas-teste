import db from '../config/db.js';
import { broadcast } from './sseHub.js';

// Status de mensagem enviada, igual aos tiques do WhatsApp. Os avisos podem chegar fora
// de ordem (webhook/eventos atrasados), então o status só avança, nunca volta.
const RANK = { pending: 1, sent: 2, failed: 2, delivered: 3, read: 4 };

export function shouldApplyStatus(current, next) {
  if (!(next in RANK)) return false;
  if (!current) return true;
  if (next === 'failed') return RANK[current] < RANK.delivered;
  return RANK[next] > (RANK[current] || 0);
}

// proto.WebMessageInfo.Status do Baileys: ERROR=0, PENDING=1, SERVER_ACK=2,
// DELIVERY_ACK=3, READ=4, PLAYED=5 (áudio ouvido).
const BAILEYS_STATUS = ['failed', 'pending', 'sent', 'delivered', 'read', 'read'];

export function baileysStatusToName(code) {
  return BAILEYS_STATUS[code] ?? null;
}

export async function applyMessageStatus({ clientId, waMessageId, status, db: dbImpl = db, broadcast: broadcastFn = broadcast }) {
  if (!waMessageId || !status) return;

  const { rows } = await dbImpl.query(
    `SELECT id, contact_id, status FROM whatsapp_messages WHERE client_id = ? AND wa_message_id = ?`,
    [clientId, waMessageId]
  );
  const message = rows[0];
  if (!message || !shouldApplyStatus(message.status, status)) return;

  await dbImpl.query(`UPDATE whatsapp_messages SET status = ? WHERE id = ?`, [status, message.id]);
  broadcastFn(clientId, 'message', { kind: 'status', contactId: message.contact_id, messageId: message.id, status });
}
