// Clube de fidelidade pelo WhatsApp: +1 ponto por visita (reserva marcada "Chegou"), meta
// configurável, prêmio avisado na hora. Desligado até o restaurante aprovar
// (followup.loyalty_enabled, em Reservas → Configurar). O cliente consulta o saldo
// mandando "pontos".
import db from '../config/db.js';
import { sendToContact } from './whatsappSender.js';
import { isBotPaused } from './botPause.js';
import { loadReservationSettings } from './reservationStore.js';
import { firstName, renderMessage, normalize } from './waitlistText.js';
import { DEFAULT_FOLLOWUP_MESSAGES } from './followupText.js';

const QUERY = /^(meus pontos|meu saldo|meu saldo de pontos|saldo|saldo de pontos|pontos|quantos pontos (eu )?tenho|clube|clube de fidelidade|fidelidade|programa de fidelidade|meus pontos de fidelidade)$/;

export function isLoyaltyQuery(text) {
  const t = normalize(text).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  return QUERY.test(t);
}

function resolveDeps(deps) {
  return {
    db: deps.db || db,
    send: deps.send || sendToContact,
    loadSettings: deps.loadSettings || loadReservationSettings,
    isBotPaused: deps.isBotPaused || isBotPaused,
    now: deps.now ? deps.now() : new Date()
  };
}

export async function loyaltyBalance(dbImpl, contactId) {
  const { rows } = await dbImpl.query(`SELECT COALESCE(SUM(points), 0) AS balance FROM loyalty_points WHERE contact_id = ?`, [contactId]);
  return Number(rows[0]?.balance) || 0;
}

function text(f, key, vars) {
  return renderMessage(f.messages?.[key]?.trim() || DEFAULT_FOLLOWUP_MESSAGES[key], vars);
}

function varsFor(f, name, points) {
  return {
    nome: firstName(name), pontos: points, meta: f.loyalty_goal, faltam: Math.max(0, f.loyalty_goal - points), premio: f.loyalty_reward
  };
}

// Chamado quando a equipe marca a reserva como "Chegou". Idempotente por reserva.
export async function awardVisit(reservation, deps = {}) {
  const d = resolveDeps(deps);
  if (!reservation?.contact_id) return null;
  const settings = await d.loadSettings(d.db, reservation.client_id);
  const f = settings.followup;
  if (!f?.loyalty_enabled) return null;
  const { rows } = await d.db.query(
    `INSERT INTO loyalty_points (client_id, contact_id, points, reason, reservation_id)
     VALUES (?, ?, 1, 'visit', ?) ON CONFLICT (reservation_id) WHERE reason = 'visit' DO NOTHING RETURNING id`,
    [reservation.client_id, reservation.contact_id, reservation.id]
  );
  if (rows.length === 0) return null; // já contou essa visita
  const { rows: contact } = await d.db.query(`SELECT profile_name FROM whatsapp_contacts WHERE id = ?`, [reservation.contact_id]);
  const name = reservation.name || contact[0]?.profile_name;
  let balance = await loyaltyBalance(d.db, reservation.contact_id);
  let key = 'loyaltyEarned';
  if (balance >= f.loyalty_goal) {
    await d.db.query(
      `INSERT INTO loyalty_points (client_id, contact_id, points, reason) VALUES (?, ?, ?, 'reward')`,
      [reservation.client_id, reservation.contact_id, -f.loyalty_goal]
    );
    key = 'loyaltyReward';
    balance = f.loyalty_goal;
  }
  try {
    await d.send({
      clientId: reservation.client_id, contactId: reservation.contact_id, sentBy: 'bot_fidelidade',
      body: text(f, key, varsFor(f, name, balance))
    });
  } catch (error) {
    console.error(`Fidelidade: falha ao avisar o contato ${reservation.contact_id}:`, error.message);
  }
  return { balance, reward: key === 'loyaltyReward' };
}

// "pontos" / "meu saldo": responde o saldo. Qualquer outra coisa segue adiante.
export async function handleInboundForLoyalty({ clientId, contactId, profileName, body }, deps = {}) {
  if (!isLoyaltyQuery(body)) return 'ignored';
  const d = resolveDeps(deps);
  const settings = await d.loadSettings(d.db, clientId);
  const f = settings.followup;
  if (!f?.loyalty_enabled) return 'ignored';
  if (await d.isBotPaused(d.db, { contactId, now: d.now })) return 'paused';
  const balance = await loyaltyBalance(d.db, contactId);
  await d.send({ clientId, contactId, sentBy: 'bot_fidelidade', body: text(f, 'loyaltyBalance', varsFor(f, profileName, balance)) });
  return 'answered';
}
