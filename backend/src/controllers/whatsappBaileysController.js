import db from '../config/db.js';
import { connectClient, getConnectionState, resetClient } from '../services/baileysClient.js';

export function resolveClientId(req) {
  return req.user.role === 'admin'
    ? (req.query.clientId || req.body.clientId || req.user.clientId)
    : req.user.clientId;
}

// Inicia (ou retoma) a conexão Baileys pro cliente e devolve o status atual —
// 'qr' com a imagem pra escanear, 'connected', 'connecting' ou 'disconnected'.
export async function getBaileysStatus(req, res) {
  try {
    const clientId = resolveClientId(req);
    if (!clientId) {
      return res.status(400).json({ error: 'ID do cliente é obrigatório.' });
    }

    const { rows } = await db.query(
      `SELECT connection_type FROM whatsapp_settings WHERE client_id = ?`,
      [clientId]
    );
    if (rows[0]?.connection_type !== 'baileys') {
      return res.status(400).json({ error: 'Este cliente não está configurado pro modo não-oficial (Baileys).' });
    }

    await connectClient(clientId);
    const state = getConnectionState(clientId);
    return res.json(state);
  } catch (error) {
    console.error('Get Baileys status error:', error);
    return res.status(500).json({ error: 'Erro ao conectar via WhatsApp Web.' });
  }
}

// Desconectar / trocar número (e destravar "conectando" sem fim): desliga o aparelho,
// apaga a sessão e devolve o estado da conexão nova, que logo pede QR. Liberado pra
// equipe do restaurante (PIN), sempre no próprio restaurante.
export async function resetBaileys(req, res) {
  try {
    const clientId = resolveClientId(req);
    if (!clientId) {
      return res.status(400).json({ error: 'ID do cliente é obrigatório.' });
    }
    const { rows } = await db.query(
      `SELECT connection_type FROM whatsapp_settings WHERE client_id = ?`,
      [clientId]
    );
    if (rows[0]?.connection_type !== 'baileys') {
      return res.status(400).json({ error: 'Este cliente não está configurado pro modo não-oficial (Baileys).' });
    }
    await resetClient(clientId);
    return res.json(getConnectionState(clientId));
  } catch (error) {
    console.error('Reset Baileys error:', error);
    return res.status(500).json({ error: 'Erro ao reiniciar a conexão do WhatsApp.' });
  }
}
