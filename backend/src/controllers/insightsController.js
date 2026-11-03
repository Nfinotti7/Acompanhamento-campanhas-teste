// Leituras do painel que cruzam anúncio, conversa e reserva (ranking de criativos, tempo
// de resposta, alertas). Admin escolhe o cliente; o cliente vê só o próprio.
import db from '../config/db.js';
import { resolveDateRange } from './campaignController.js';
import { dayOf } from '../services/reservationSlots.js';
import { upcomingDates } from '../services/seasonality.js';
import {
  loadCreativeRanking, loadResponseTimes, loadCampaignAlertData, computeAlerts
} from '../services/campaignInsights.js';

function resolveClientId(req) {
  return req.user.role === 'admin'
    ? (req.query.clientId || req.user.clientId)
    : req.user.clientId;
}

export async function getInsights(req, res) {
  try {
    const clientId = resolveClientId(req);
    if (!clientId) return res.status(400).json({ error: 'ID do cliente é obrigatório.' });
    const { startStr, endStr } = resolveDateRange(req.query);
    const now = new Date();
    const [creatives, responseTimes, alertData] = await Promise.all([
      loadCreativeRanking(db, clientId, startStr, endStr),
      loadResponseTimes(db, clientId, startStr, endStr, now),
      loadCampaignAlertData(db, clientId, dayOf(now))
    ]);
    return res.json({
      period: { start: startStr, end: endStr },
      creatives,
      responseTimes,
      alerts: computeAlerts(alertData, dayOf(now)),
      upcomingDates: upcomingDates(dayOf(now), 60)
    });
  } catch (error) {
    console.error('Insights error:', error);
    return res.status(500).json({ error: 'Erro ao montar os indicadores.' });
  }
}
