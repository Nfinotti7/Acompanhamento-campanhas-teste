// Conversa do robô da fila (Na Mesa). Só age com quem mandou FILA ou já está numa
// fila ativa -- o resto do WhatsApp do restaurante segue pro atendimento humano.
import db from '../config/db.js';
import { sendToContact } from './whatsappSender.js';
import { isJoinCommand, isLeaveCommand, parsePartySize, renderMessage, firstName } from './waitlistText.js';
import {
  findActiveEntryForContact, loadSettings, loadQueueState, enterQueue, transitionEntry, afterQueueChange,
  expireStaleEntries, isUniqueViolation
} from './waitlistQueue.js';

const MAX_SIZE_RETRIES = 2;

export async function handleInboundForWaitlist({ clientId, contactId, waId, profileName, body }, deps = {}) {
  const dbImpl = deps.db || db;
  const send = deps.send || sendToContact;
  const now = deps.now ? deps.now() : new Date();
  const queueDeps = { ...deps, send };
  const text = body || '';

  const entry = await findActiveEntryForContact(dbImpl, { clientId, contactId, waId, now });
  const settings = await loadSettings(dbImpl, clientId);
  // Falha de envio (WhatsApp caído) só vai pro log: o estado da fila já foi gravado e a
  // tela da recepcionista ainda precisa ser avisada.
  const reply = async (key, vars = {}) => {
    try {
      await send({
        clientId,
        contactId,
        body: renderMessage(settings.messages[key], {
          nome: firstName(entry?.name || profileName),
          tolerancia: settings.hold_minutes,
          ...vars
        })
      });
    } catch (error) {
      console.error(`Na Mesa: falha ao responder "${key}" pro contato ${contactId}:`, error.message);
    }
  };

  if (!entry) {
    if (!isJoinCommand(text)) return 'ignored';
    await expireStaleEntries(dbImpl, { clientId, phone: waId, now });
    try {
      await dbImpl.query(
        `INSERT INTO waitlist_entries (client_id, contact_id, name, phone, status, source)
         VALUES (?, ?, ?, ?, 'awaiting_size', 'whatsapp') RETURNING id`,
        [clientId, contactId, profileName || null, waId]
      );
    } catch (error) {
      // Duas mensagens quase juntas (ex: tocou "enviar" duas vezes): o índice único
      // deixa só uma entrar, e só ela responde.
      if (isUniqueViolation(error)) return 'duplicate';
      throw error;
    }
    await reply('askSize');
    await afterQueueChange(dbImpl, clientId, queueDeps);
    return 'asked_size';
  }

  // Entrada manual (recepcionista digitou o telefone): liga ao contato na 1ª mensagem.
  if (!entry.contact_id) {
    await dbImpl.query(`UPDATE waitlist_entries SET contact_id = ? WHERE id = ?`, [contactId, entry.id]);
    entry.contact_id = contactId;
  }

  if (isLeaveCommand(text)) {
    await transitionEntry(dbImpl, { clientId, entryId: entry.id, action: 'leave' }, queueDeps);
    return 'left';
  }

  if (entry.status === 'awaiting_size') {
    const size = parsePartySize(text);
    if (size) {
      await enterQueue(dbImpl, { clientId, entryId: entry.id, partySize: size, needsCheck: false }, queueDeps);
      return 'joined';
    }
    if ((entry.size_attempts || 0) >= MAX_SIZE_RETRIES) {
      await enterQueue(dbImpl, { clientId, entryId: entry.id, partySize: 2, needsCheck: true }, queueDeps);
      return 'joined_unchecked';
    }
    await dbImpl.query(`UPDATE waitlist_entries SET size_attempts = size_attempts + 1 WHERE id = ?`, [entry.id]);
    await reply('askSizeAgain');
    return 'asked_size_again';
  }

  if (entry.status === 'called') {
    await reply('calledReminder');
    return 'called_reminder';
  }

  const state = await loadQueueState(dbImpl, clientId, now);
  const me = state.waiting.find((e) => e.id === entry.id);
  await reply('status', { posicao: me?.position ?? '-', espera: me?.estimated_wait ?? '-' });
  return 'status';
}
