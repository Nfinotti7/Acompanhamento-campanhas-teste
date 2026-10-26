// Respostas automáticas do Balcão: cardápio, localização, horário e preços, na hora, com
// os textos do restaurante (settings.info, editáveis no Configurar). Roda depois do robô
// de reserva e só quando ele não tratou a mensagem (whatsappIngest.js). Como o robô de
// reserva, para quando a equipe responde (botPause.js) e nunca diz que é robô.
import db from '../config/db.js';
import { sendToContact } from './whatsappSender.js';
import { sendTyping } from './baileysClient.js';
import { isBotPaused } from './botPause.js';
import { loadReservationSettings, upcomingReservationsForContact } from './reservationStore.js';
import { firstName, renderMessage } from './waitlistText.js';
import { detectInfoTopics, isOtherQuestion } from './infoText.js';

// O mesmo assunto não é mandado de novo pro mesmo contato nesse intervalo.
export const REPEAT_WINDOW_MS = 12 * 3600e3;

function resolveDeps(deps) {
  return {
    db: deps.db || db,
    now: deps.now ? deps.now() : new Date(),
    send: deps.send || sendToContact,
    typing: deps.typing || ((clientId, waId) => sendTyping(clientId, waId, 1500 + Math.floor(Math.random() * 1500))),
    loadSettings: deps.loadSettings || loadReservationSettings,
    isBotPaused: deps.isBotPaused || isBotPaused,
    upcomingReservations: deps.upcomingReservations || upcomingReservationsForContact
  };
}

// Uma mensagem por vez em cada contato: "Quero ver o cardápio" mandado 3 vezes seguidas
// recebe uma resposta só.
const queues = new Map();

export function handleInboundForInfo(args, deps = {}) {
  const key = `${args.clientId}:${args.contactId}`;
  const previous = queues.get(key) || Promise.resolve();
  const run = previous.catch(() => {}).then(() => handleOne(args, deps));
  queues.set(key, run);
  run.catch(() => {}).finally(() => { if (queues.get(key) === run) queues.delete(key); });
  return run;
}

async function handleOne({ clientId, contactId, waId, profileName, body, restaurantName = '' }, deps = {}) {
  const d = resolveDeps(deps);
  const q = d.db;

  const settings = await d.loadSettings(q, clientId);
  const info = settings.info || {};
  if (!info.enabled) return 'ignored';

  const other = isOtherQuestion(body);
  const asked = other ? ['other'] : detectInfoTopics(body).filter((topic) => (info[topic] || '').trim());
  if (asked.length === 0) return 'ignored';
  if (await d.isBotPaused(q, { contactId, now: d.now })) return 'paused';

  const { rows } = await q.query(
    `SELECT DISTINCT topic FROM info_replies WHERE contact_id = ? AND sent_at > ?`,
    [contactId, new Date(d.now.getTime() - REPEAT_WINDOW_MS)]
  );
  const recent = new Set(rows.map((r) => r.topic));
  const topics = asked.filter((topic) => !recent.has(topic));
  if (topics.length === 0) return 'repeated';

  // Convite pra reservar no fim, pra quem ainda não tem reserva marcada nem está no meio
  // de uma (aí a pergunta pendente do robô de reserva continua valendo).
  let hint = '';
  if (!other && settings.bot_enabled && (info.reserveHint || '').trim()) {
    const upcoming = await d.upcomingReservations(q, { clientId, contactId, now: d.now });
    const { rows: active } = await q.query(
      `SELECT 1 FROM reservation_conversations WHERE client_id = ? AND contact_id = ? AND status = 'active'`,
      [clientId, contactId]
    );
    if (upcoming.length === 0 && active.length === 0) hint = info.reserveHint.trim();
  }

  const vars = { nome: firstName(profileName), restaurante: restaurantName };
  for (const [i, topic] of topics.entries()) {
    const last = i === topics.length - 1;
    const text = renderMessage(info[topic].trim(), vars) + (last && hint ? `\n\n${hint}` : '');
    // Grava antes de enviar: outra mensagem igual que chegue no meio não responde de novo.
    await q.query(`INSERT INTO info_replies (client_id, contact_id, topic) VALUES (?, ?, ?)`, [clientId, contactId, topic]);
    try {
      await d.typing(clientId, waId);
      // A equipe pode ter respondido durante o "digitando".
      if (await d.isBotPaused(q, { contactId, now: d.now })) return 'paused';
      await d.send({ clientId, contactId, sentBy: 'bot_info', body: text });
    } catch (error) {
      console.error(`Respostas automáticas: falha ao responder "${topic}" pro contato ${contactId}:`, error.message);
      return 'failed';
    }
  }
  return 'answered';
}
