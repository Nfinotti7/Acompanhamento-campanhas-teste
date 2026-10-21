// Pausa do robô num contato: quando alguém da equipe responde (pelo Caixa ou pelo
// celular), o robô para de falar com essa pessoa por um tempo. Renovada a cada nova
// mensagem do atendente.
import { broadcast } from './sseHub.js';

export const PAUSE_MS = 12 * 3600e3;

export async function pauseBot(dbImpl, { clientId, contactId, now = new Date() }, deps = {}) {
  const broadcastFn = deps.broadcast || broadcast;
  const until = new Date(now.getTime() + PAUSE_MS);
  await dbImpl.query(
    `UPDATE whatsapp_contacts SET bot_paused_until = ? WHERE id = ? AND client_id = ?`,
    [until, contactId, clientId]
  );
  // A reserva pela metade fica com o atendente.
  await dbImpl.query(
    `UPDATE reservation_conversations SET status = 'handed_off', updated_at = now()
     WHERE client_id = ? AND contact_id = ? AND status = 'active'`,
    [clientId, contactId]
  );
  broadcastFn(clientId, 'reservation', { contactId: Number(contactId), botPaused: true });
  return until;
}

export async function resumeBot(dbImpl, { clientId, contactId }, deps = {}) {
  const broadcastFn = deps.broadcast || broadcast;
  await dbImpl.query(
    `UPDATE whatsapp_contacts SET bot_paused_until = NULL WHERE id = ? AND client_id = ?`,
    [contactId, clientId]
  );
  broadcastFn(clientId, 'reservation', { contactId: Number(contactId), botPaused: false });
}

export async function isBotPaused(dbImpl, { contactId, now = new Date() }) {
  const { rows } = await dbImpl.query(`SELECT bot_paused_until FROM whatsapp_contacts WHERE id = ?`, [contactId]);
  const until = rows[0]?.bot_paused_until;
  return Boolean(until) && new Date(until).getTime() > now.getTime();
}
