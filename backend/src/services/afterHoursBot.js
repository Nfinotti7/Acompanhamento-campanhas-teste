// Mensagem que chega fora do horário de atendimento: responde uma vez (a cada 12h por
// pessoa), avisa que a equipe retorna e marca a conversa (after_hours_at) pra aparecer
// no Balcão como "chegou fora do horário" até alguém responder. Só pega o que o robô de
// reserva e as respostas automáticas não trataram (whatsappIngest.js).
import db from '../config/db.js';
import { sendToContact } from './whatsappSender.js';
import { isBotPaused } from './botPause.js';
import { loadReservationSettings } from './reservationStore.js';
import { firstName, renderMessage } from './waitlistText.js';
import { DEFAULT_FOLLOWUP_MESSAGES } from './followupText.js';

export const REPEAT_MS = 12 * 3600e3;

const toMinutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

// Janela [from, to) em Brasília; se from > to ela atravessa a meia-noite (23:00 → 10:00).
export function isAfterHours(now, from, to) {
  const local = new Date(now.getTime() - 3 * 3600e3);
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  const a = toMinutes(from);
  const b = toMinutes(to);
  if (a === b) return false;
  return a < b ? minutes >= a && minutes < b : minutes >= a || minutes < b;
}

export async function handleInboundForAfterHours({ clientId, contactId, profileName }, deps = {}) {
  const dbImpl = deps.db || db;
  const now = deps.now ? deps.now() : new Date();
  const send = deps.send || sendToContact;
  const settings = await (deps.loadSettings || loadReservationSettings)(dbImpl, clientId);
  const f = settings.followup;
  if (!f?.after_hours_enabled || !isAfterHours(now, f.after_hours_from, f.after_hours_to)) return 'ignored';
  if (await (deps.isBotPaused || isBotPaused)(dbImpl, { contactId, now })) return 'paused';

  // Marca a conversa mesmo quando já respondeu há pouco: a equipe precisa ver que ficou pendente.
  await dbImpl.query(`UPDATE whatsapp_contacts SET after_hours_at = COALESCE(after_hours_at, ?) WHERE id = ?`, [now, contactId]);
  const { rows } = await dbImpl.query(
    `SELECT 1 FROM info_replies WHERE contact_id = ? AND topic = 'after_hours' AND sent_at > ?`,
    [contactId, new Date(now.getTime() - REPEAT_MS)]
  );
  if (rows.length > 0) return 'repeated';
  await dbImpl.query(`INSERT INTO info_replies (client_id, contact_id, topic) VALUES (?, ?, 'after_hours')`, [clientId, contactId]);
  const body = renderMessage(f.messages?.afterHours?.trim() || DEFAULT_FOLLOWUP_MESSAGES.afterHours, {
    nome: firstName(profileName), ate: f.after_hours_to.replace(/^0/, '').replace(':00', 'h')
  });
  try {
    await send({ clientId, contactId, sentBy: 'bot_fora_horario', body });
  } catch (error) {
    console.error(`Fora do horário: falha ao responder o contato ${contactId}:`, error.message);
    return 'failed';
  }
  return 'answered';
}
