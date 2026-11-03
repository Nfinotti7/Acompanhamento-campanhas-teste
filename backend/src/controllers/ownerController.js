// Painel do dono, unidades e implantação. O dono (role client) vê só o próprio
// restaurante; unidades e implantação são do admin.
import db from '../config/db.js';
import { loadReservationSettings } from '../services/reservationStore.js';
import { loadOwnerSummary, loadUnits, loadOnboarding, PERIOD_KINDS } from '../services/ownerSummary.js';

function resolveClientId(req) {
  return req.user.role === 'admin'
    ? (req.query.clientId || req.user.clientId)
    : req.user.clientId;
}

const kindOf = (req) => (PERIOD_KINDS.includes(req.query.period) ? req.query.period : 'week');

function adminOnly(handler, errorMessage) {
  return async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Sem acesso.' });
    try {
      return await handler(req, res);
    } catch (error) {
      console.error(`${errorMessage}:`, error);
      return res.status(500).json({ error: errorMessage });
    }
  };
}

export async function getOwnerSummary(req, res) {
  try {
    const clientId = resolveClientId(req);
    if (!clientId) return res.status(400).json({ error: 'ID do cliente é obrigatório.' });
    const { rows } = await db.query(`SELECT name, company FROM clients WHERE id = ?`, [clientId]);
    const summary = await loadOwnerSummary(db, clientId, kindOf(req));
    return res.json({ client: rows[0] || null, ...summary });
  } catch (error) {
    console.error('Owner summary error:', error);
    return res.status(500).json({ error: 'Erro ao montar o resumo.' });
  }
}

export const getUnits = adminOnly(async (req, res) => res.json(await loadUnits(db, kindOf(req))), 'Erro ao comparar as unidades');

export const getOnboarding = adminOnly(async (req, res) => {
  const clientId = req.query.clientId;
  if (!clientId) return res.status(400).json({ error: 'ID do cliente é obrigatório.' });
  return res.json(await loadOnboarding(db, clientId, loadReservationSettings));
}, 'Erro ao montar a implantação');
