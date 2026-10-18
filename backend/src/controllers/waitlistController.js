import QRCode from 'qrcode';
import db from '../config/db.js';
import { getConnectionState } from '../services/baileysClient.js';
import { DEFAULT_MESSAGES, MESSAGE_KEYS, normalizePhone } from '../services/waitlistText.js';
import { loadQueueState, loadSettings, transitionEntry, addManualEntry, updateEntry } from '../services/waitlistQueue.js';
import { loadReport } from '../services/waitlistReport.js';

export const JOIN_TEXT = 'Quero entrar na fila (cód. FILA)';

function resolveClientId(req) {
  return req.user.role === 'admin'
    ? (req.query.clientId || req.body.clientId || req.user.clientId)
    : req.user.clientId;
}

function handler(fn, errorMessage) {
  return async (req, res) => {
    try {
      const clientId = resolveClientId(req);
      if (!clientId) return res.status(400).json({ error: 'ID do cliente é obrigatório.' });
      return await fn(req, res, clientId);
    } catch (error) {
      console.error(`${errorMessage}:`, error);
      return res.status(500).json({ error: `${errorMessage}.` });
    }
  };
}

async function whatsappStatus(clientId) {
  const { rows } = await db.query('SELECT connection_type FROM whatsapp_settings WHERE client_id = ?', [clientId]);
  if (!rows[0]) return 'not_configured';
  if (rows[0].connection_type !== 'baileys') return 'cloud_api';
  return getConnectionState(clientId).status;
}

export const getQueue = handler(async (req, res, clientId) => {
  const state = await loadQueueState(db, clientId);
  return res.json({
    waiting: state.waiting,
    called: state.called,
    awaitingSize: state.awaitingSize,
    recent: state.recent,
    summary: state.summary,
    settings: { hold_minutes: state.settings.hold_minutes },
    whatsappStatus: await whatsappStatus(clientId)
  });
}, 'Erro ao carregar a fila');

export const getReport = handler(async (req, res, clientId) => {
  return res.json(await loadReport(db, { clientId, day: req.query.day }));
}, 'Erro ao carregar o relatório da fila');

export const addEntry = handler(async (req, res, clientId) => {
  const { name, phone, partySize } = req.body;
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Nome é obrigatório.' });
  try {
    const entry = await addManualEntry(db, { clientId, name: String(name).trim(), phone, partySize });
    return res.status(201).json({ entry });
  } catch (error) {
    if (/inválido|já está na fila/.test(error.message)) return res.status(400).json({ error: error.message });
    throw error;
  }
}, 'Erro ao adicionar na fila');

export const editEntry = handler(async (req, res, clientId) => {
  try {
    const entry = await updateEntry(db, { clientId, entryId: Number(req.params.id), name: req.body.name, partySize: req.body.partySize });
    if (!entry) return res.status(404).json({ error: 'Entrada não encontrada.' });
    return res.json({ entry });
  } catch (error) {
    if (/inválido/.test(error.message)) return res.status(400).json({ error: error.message });
    throw error;
  }
}, 'Erro ao editar entrada');

function transition(action) {
  return handler(async (req, res, clientId) => {
    let entry;
    try {
      entry = await transitionEntry(db, { clientId, entryId: Number(req.params.id), action });
    } catch (error) {
      if (/já está na fila/.test(error.message)) return res.status(409).json({ error: error.message });
      throw error;
    }
    if (!entry) return res.status(409).json({ error: 'Essa pessoa já mudou de situação. A lista foi atualizada.' });
    return res.json({ entry });
  }, 'Erro ao atualizar a fila');
}

export const callEntry = transition('call');
export const seatEntry = transition('seat');
export const noShowEntry = transition('noShow');
export const removeEntry = transition('remove');
export const requeueEntry = transition('requeue');
export const requeueEndEntry = transition('requeueEnd');
export const restoreEntry = transition('restore');

export const getSettings = handler(async (req, res, clientId) => {
  return res.json({ settings: await loadSettings(db, clientId), defaults: DEFAULT_MESSAGES });
}, 'Erro ao carregar configurações da fila');

function intInRange(value, min, max, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

export const saveSettings = handler(async (req, res, clientId) => {
  const current = await loadSettings(db, clientId);
  const body = req.body || {};
  const number = body.whatsapp_number ? normalizePhone(body.whatsapp_number) : null;
  if (body.whatsapp_number && !number) return res.status(400).json({ error: 'Número do WhatsApp inválido.' });

  // Só guarda o texto que difere do padrão; vazio volta pro padrão.
  const messages = {};
  for (const key of MESSAGE_KEYS) {
    const text = typeof body.messages?.[key] === 'string' ? body.messages[key].trim().slice(0, 500) : '';
    if (text && text !== DEFAULT_MESSAGES[key]) messages[key] = text;
  }

  await db.query(
    `INSERT INTO waitlist_settings (client_id, whatsapp_number, default_minutes_per_party, hold_minutes, near_threshold, notify_no_show, messages, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, now())
     ON CONFLICT (client_id) DO UPDATE SET
       whatsapp_number = excluded.whatsapp_number,
       default_minutes_per_party = excluded.default_minutes_per_party,
       hold_minutes = excluded.hold_minutes,
       near_threshold = excluded.near_threshold,
       notify_no_show = excluded.notify_no_show,
       messages = excluded.messages,
       updated_at = now()`,
    [
      clientId,
      number,
      intInRange(body.default_minutes_per_party, 1, 60, current.default_minutes_per_party),
      intInRange(body.hold_minutes, 1, 60, current.hold_minutes),
      intInRange(body.near_threshold, 0, 10, current.near_threshold),
      typeof body.notify_no_show === 'boolean' ? body.notify_no_show : current.notify_no_show,
      JSON.stringify(messages)
    ]
  );
  return res.json({ settings: await loadSettings(db, clientId) });
}, 'Erro ao salvar configurações da fila');

export const getQr = handler(async (req, res, clientId) => {
  const settings = await loadSettings(db, clientId);
  if (!settings.whatsapp_number) {
    return res.status(400).json({ error: 'Cadastre o número do WhatsApp do restaurante antes de gerar o QR.' });
  }
  const link = `https://wa.me/${settings.whatsapp_number}?text=${encodeURIComponent(JOIN_TEXT)}`;
  const dataUrl = await QRCode.toDataURL(link, { width: 600, margin: 2 });
  return res.json({ link, dataUrl });
}, 'Erro ao gerar QR da fila');
