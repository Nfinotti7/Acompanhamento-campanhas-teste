// Regras da fila do Na Mesa: posição, espera estimada, mudanças de status e os
// avisos automáticos (só nos marcos -- ver spec 2026-10-15-namesa-fila-design.md).
import db from '../config/db.js';
import { broadcast } from './sseHub.js';
import { sendToContact } from './whatsappSender.js';
import { DEFAULT_MESSAGES, renderMessage, firstName, formatGroupsAhead, normalizePhone, phoneVariants } from './waitlistText.js';

export const ACTIVE_WINDOW_MS = 12 * 60 * 60 * 1000;
const ACTIVE_STATUSES = ['awaiting_size', 'waiting', 'called'];
const FINISHED_STATUSES = ['seated', 'no_show', 'left', 'removed'];
const RECENT_WINDOW_MS = 2 * 60 * 60 * 1000;
const INTERVAL_WINDOW_MS = 2 * 60 * 60 * 1000;
const MAX_GAP_MINUTES = 30;

const time = (v) => new Date(v).getTime();

export function buildQueue(entries, now = new Date()) {
  const cutoff = now.getTime() - ACTIVE_WINDOW_MS;
  const active = entries.filter((e) => ACTIVE_STATUSES.includes(e.status) && time(e.joined_at) >= cutoff);
  const byJoin = (a, b) => time(a.joined_at) - time(b.joined_at) || a.id - b.id;
  return {
    waiting: active.filter((e) => e.status === 'waiting').sort(byJoin).map((e, i) => ({ ...e, position: i + 1 })),
    called: active.filter((e) => e.status === 'called').sort((a, b) => time(a.called_at) - time(b.called_at)),
    awaitingSize: active.filter((e) => e.status === 'awaiting_size').sort(byJoin)
  };
}

// Minutos entre uma mesa liberada e a próxima, pela média das baixas "sentou" das
// últimas 2h (estilo Yelp: dado real, não chute). Cada intervalo é limitado a 30 min
// pra uma calmaria sem fila não inflar a estimativa.
export function seatingInterval(seatedTimes, { now = new Date(), defaultMinutes }) {
  const recent = seatedTimes
    .map(time)
    .filter((t) => t >= now.getTime() - INTERVAL_WINDOW_MS)
    .sort((a, b) => a - b);
  if (recent.length < 3) return defaultMinutes;
  let total = 0;
  for (let i = 1; i < recent.length; i++) {
    total += Math.min((recent[i] - recent[i - 1]) / 60000, MAX_GAP_MINUTES);
  }
  return total / (recent.length - 1);
}

export function estimateWait(position, interval) {
  return Math.max(5, Math.ceil((position * interval) / 5) * 5);
}

export function daySummary(entries, now = new Date()) {
  const cutoff = now.getTime() - ACTIVE_WINDOW_MS;
  const today = entries.filter((e) => time(e.joined_at) >= cutoff);
  const seated = today.filter((e) => e.status === 'seated');
  const waits = seated.filter((e) => e.finished_at).map((e) => (time(e.finished_at) - time(e.joined_at)) / 60000);
  return {
    total: today.length,
    seated: seated.length,
    gaveUp: today.filter((e) => e.status === 'no_show' || e.status === 'left').length,
    avgWaitMinutes: waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : null
  };
}

export async function loadSettings(dbImpl, clientId) {
  const { rows } = await dbImpl.query('SELECT * FROM waitlist_settings WHERE client_id = ?', [clientId]);
  const row = rows[0] || {};
  return {
    whatsapp_number: row.whatsapp_number || null,
    default_minutes_per_party: row.default_minutes_per_party ?? 8,
    hold_minutes: row.hold_minutes ?? 10,
    near_threshold: row.near_threshold ?? 2,
    notify_no_show: row.notify_no_show ?? true,
    messages: { ...DEFAULT_MESSAGES, ...(row.messages || {}) }
  };
}

export async function loadQueueState(dbImpl, clientId, now = new Date()) {
  const since = new Date(now.getTime() - ACTIVE_WINDOW_MS);
  const { rows: entries } = await dbImpl.query(
    `SELECT * FROM waitlist_entries WHERE client_id = ? AND joined_at >= ? ORDER BY joined_at ASC, id ASC`,
    [clientId, since]
  );
  const settings = await loadSettings(dbImpl, clientId);
  const queue = buildQueue(entries, now);
  const seatedTimes = entries.filter((e) => e.status === 'seated' && e.finished_at).map((e) => e.finished_at);
  const interval = seatingInterval(seatedTimes, { now, defaultMinutes: settings.default_minutes_per_party });
  return {
    waiting: queue.waiting.map((e) => ({ ...e, estimated_wait: estimateWait(e.position, interval) })),
    called: queue.called,
    awaitingSize: queue.awaitingSize,
    settings,
    interval,
    summary: daySummary(entries, now),
    // Quem saiu da fila há pouco (pra desfazer um toque errado), mais recente primeiro.
    recent: entries
      .filter((e) => FINISHED_STATUSES.includes(e.status) && e.finished_at && time(e.finished_at) >= now.getTime() - RECENT_WINDOW_MS)
      .sort((a, b) => time(b.finished_at) - time(a.finished_at))
  };
}

function resolveDeps(deps) {
  return {
    send: deps.send || sendToContact,
    broadcastFn: deps.broadcast || broadcast,
    now: deps.now ? deps.now() : new Date()
  };
}

// Mensagem automática de um marco. Falha de envio (WhatsApp caído) só vai pro log:
// a ação da recepcionista já foi gravada e não pode ser desfeita por causa disso.
async function notifyEntry(entry, key, vars, { settings, send }) {
  if (!entry.contact_id) return false;
  const body = renderMessage(settings.messages[key], {
    nome: firstName(entry.name),
    tolerancia: settings.hold_minutes,
    ...vars
  });
  try {
    await send({ clientId: entry.client_id, contactId: entry.contact_id, body, sentBy: 'bot_fila' });
    return true;
  } catch (error) {
    console.error(`Na Mesa: falha ao enviar "${key}" pra entrada ${entry.id}:`, error.message);
    return false;
  }
}

async function claimNear(dbImpl, entryId) {
  const { rows } = await dbImpl.query(
    `UPDATE waitlist_entries SET notified_near = true WHERE id = ? AND notified_near = false RETURNING id`,
    [entryId]
  );
  return rows.length > 0;
}

export async function afterQueueChange(dbImpl, clientId, deps = {}, reason = 'update') {
  const { send, broadcastFn, now } = resolveDeps(deps);
  const state = await loadQueueState(dbImpl, clientId, now);
  const limit = state.settings.near_threshold + 1;
  for (const entry of state.waiting) {
    if (entry.position > limit || entry.notified_near) continue;
    if (!(await claimNear(dbImpl, entry.id))) continue;
    if (entry.position > 1) {
      await notifyEntry(entry, 'near', { faltam: formatGroupsAhead(entry.position - 1) }, { settings: state.settings, send });
    }
  }
  broadcastFn(clientId, 'waitlist', { reason, changedAt: now.toISOString() });
  return state;
}

// awaiting_size -> waiting. joined_at é renovado aqui: a posição conta a partir de
// quando a pessoa respondeu o número de pessoas.
export async function enterQueue(dbImpl, { clientId, entryId, partySize, needsCheck = false }, deps = {}) {
  const { send, now } = resolveDeps(deps);
  const { rows } = await dbImpl.query(
    `UPDATE waitlist_entries SET status = 'waiting', party_size = ?, needs_check = ?, joined_at = CURRENT_TIMESTAMP
     WHERE id = ? AND client_id = ? AND status = 'awaiting_size' RETURNING *`,
    [partySize, needsCheck, entryId, clientId]
  );
  if (!rows[0]) return null;

  const state = await loadQueueState(dbImpl, clientId, now);
  const me = state.waiting.find((e) => e.id === rows[0].id) || { ...rows[0], position: 1, estimated_wait: estimateWait(1, state.interval) };
  // Já entrou perto da vez: o "Entrou" já diz a posição, não manda "quase lá" logo depois.
  if (me.position <= state.settings.near_threshold + 1) await claimNear(dbImpl, me.id);
  await notifyEntry(me, 'joined', { posicao: me.position, espera: me.estimated_wait }, { settings: state.settings, send });
  await afterQueueChange(dbImpl, clientId, deps, 'joined');
  return me;
}

const TRANSITIONS = {
  call: { from: ['waiting'], to: 'called', set: 'called_at = CURRENT_TIMESTAMP', message: 'called' },
  seat: { from: ['waiting', 'called'], to: 'seated', set: 'finished_at = CURRENT_TIMESTAMP' },
  noShow: { from: ['waiting', 'called'], to: 'no_show', set: 'finished_at = CURRENT_TIMESTAMP', message: 'noShow' },
  remove: { from: ACTIVE_STATUSES, to: 'removed', set: 'finished_at = CURRENT_TIMESTAMP' },
  leave: { from: ACTIVE_STATUSES, to: 'left', set: 'finished_at = CURRENT_TIMESTAMP', message: 'left' },
  // Chamado que volta pra fila: no mesmo lugar (mantém a hora de chegada) ou no fim.
  requeue: { from: ['called'], to: 'waiting', set: 'called_at = NULL', message: 'requeued', withPosition: true },
  requeueEnd: { from: ['called'], to: 'waiting', set: 'called_at = NULL, joined_at = CURRENT_TIMESTAMP, notified_near = false', message: 'requeuedEnd', withPosition: true },
  // Desfazer "Sentou"/"Não veio"/"Remover" marcado por engano: volta pro mesmo lugar, sem mensagem.
  restore: { from: FINISHED_STATUSES, to: 'waiting', set: 'finished_at = NULL, called_at = NULL' }
};

export async function transitionEntry(dbImpl, { clientId, entryId, action }, deps = {}) {
  const t = TRANSITIONS[action];
  if (!t) throw new Error(`Ação inválida: ${action}`);
  const { send, now } = resolveDeps(deps);
  const placeholders = t.from.map(() => '?').join(', ');
  let rows;
  try {
    ({ rows } = await dbImpl.query(
      `UPDATE waitlist_entries SET status = ?, ${t.set}
       WHERE id = ? AND client_id = ? AND status IN (${placeholders}) RETURNING *`,
      [t.to, entryId, clientId, ...t.from]
    ));
  } catch (error) {
    // Voltar pra fila quem já entrou de novo pelo WhatsApp (índice único por telefone).
    if (isUniqueViolation(error)) throw new Error('Essa pessoa já está na fila de novo.');
    throw error;
  }
  const entry = rows[0];
  if (!entry) return null;

  const settings = await loadSettings(dbImpl, clientId);
  let vars = {};
  if (t.withPosition) {
    const state = await loadQueueState(dbImpl, clientId, now);
    const me = state.waiting.find((e) => e.id === entry.id);
    vars = { posicao: me?.position ?? '-', espera: me?.estimated_wait ?? '-' };
    // A mensagem já diz a posição: não manda "quase lá" logo em seguida.
    if (me && me.position <= state.settings.near_threshold + 1) await claimNear(dbImpl, me.id);
  }
  const silent = action === 'noShow' && !settings.notify_no_show;
  if (t.message && !silent) await notifyEntry(entry, t.message, vars, { settings, send });
  await afterQueueChange(dbImpl, clientId, deps);
  return entry;
}

// Entrada digitada pela equipe (fila ou reserva por telefone): acha ou cria o contato
// pelo número já normalizado. Sem número, não há contato.
export async function findOrCreateContactByPhone(dbImpl, { clientId, waId, name }) {
  if (!waId) return null;
  const { rows } = await dbImpl.query(
    `INSERT INTO whatsapp_contacts (client_id, wa_id, profile_name, source)
     VALUES (?, ?, ?, 'organic')
     ON CONFLICT (client_id, wa_id) DO UPDATE SET profile_name = COALESCE(whatsapp_contacts.profile_name, excluded.profile_name)
     RETURNING id`,
    [clientId, waId, name || null]
  );
  return rows[0].id;
}

export async function addManualEntry(dbImpl, { clientId, name, phone, partySize }, deps = {}) {
  const rawPhone = String(phone || '').trim();
  const waId = rawPhone ? normalizePhone(rawPhone) : null;
  if (rawPhone && !waId) throw new Error('Telefone inválido. Use DDD + número, ex: (11) 99999-8888.');
  const size = Number(partySize);
  if (!Number.isInteger(size) || size < 1 || size > 30) throw new Error('Número de pessoas inválido.');

  const contactId = await findOrCreateContactByPhone(dbImpl, { clientId, waId, name });

  await expireStaleEntries(dbImpl, { clientId, phone: waId, now: resolveDeps(deps).now });
  let rows;
  try {
    ({ rows } = await dbImpl.query(
      `INSERT INTO waitlist_entries (client_id, contact_id, name, phone, status, source)
       VALUES (?, ?, ?, ?, 'awaiting_size', 'manual') RETURNING id`,
      [clientId, contactId, name || null, waId]
    ));
  } catch (error) {
    if (isUniqueViolation(error)) throw new Error('Esse telefone já está na fila.');
    throw error;
  }
  return enterQueue(dbImpl, { clientId, entryId: rows[0].id, partySize: size, needsCheck: false }, deps);
}

export async function updateEntry(dbImpl, { clientId, entryId, name, partySize }, deps = {}) {
  const size = partySize === undefined || partySize === null || partySize === '' ? null : Number(partySize);
  if (size !== null && (!Number.isInteger(size) || size < 1 || size > 30)) throw new Error('Número de pessoas inválido.');
  const { rows } = await dbImpl.query(
    `UPDATE waitlist_entries
     SET name = COALESCE(?, name), party_size = COALESCE(?, party_size), needs_check = false
     WHERE id = ? AND client_id = ? RETURNING *`,
    [name ? String(name).trim() : null, size, entryId, clientId]
  );
  if (rows[0]) await afterQueueChange(dbImpl, clientId, deps);
  return rows[0] || null;
}

export async function findActiveEntryForContact(dbImpl, { clientId, contactId, waId, now = new Date() }) {
  const since = new Date(now.getTime() - ACTIVE_WINDOW_MS);
  const { rows } = await dbImpl.query(
    `SELECT * FROM waitlist_entries
     WHERE client_id = ? AND status IN ('awaiting_size', 'waiting', 'called') AND joined_at >= ?
       AND (contact_id = ? OR phone = ANY(?))
     ORDER BY joined_at DESC LIMIT 1`,
    [clientId, since, contactId, phoneVariants(waId)]
  );
  return rows[0] || null;
}

// Entrada de outro dia que ficou "ativa" (ninguém deu baixa) sai do caminho antes de
// uma entrada nova -- senão o índice único (um ativo por telefone) bloquearia a volta.
export async function expireStaleEntries(dbImpl, { clientId, phone, now = new Date() }) {
  if (!phone) return;
  await dbImpl.query(
    `UPDATE waitlist_entries SET status = 'removed', finished_at = CURRENT_TIMESTAMP
     WHERE client_id = ? AND phone = ANY(?) AND status IN ('awaiting_size', 'waiting', 'called') AND joined_at < ?`,
    [clientId, phoneVariants(phone), new Date(now.getTime() - ACTIVE_WINDOW_MS)]
  );
}

export function isUniqueViolation(error) {
  return error?.code === '23505';
}
