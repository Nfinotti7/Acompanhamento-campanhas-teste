import db from '../config/db.js';
import { ensureConnection, getSharedConnectionState, resetClient, requestPairingCode, PairingError } from '../services/baileysClient.js';
import { RelayError } from '../services/processRelay.js';

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

    await ensureConnection(clientId);
    return res.json(await getSharedConnectionState(clientId));
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
    return res.json(await getSharedConnectionState(clientId));
  } catch (error) {
    if (error instanceof RelayError) return res.status(503).json({ error: error.message });
    console.error('Reset Baileys error:', error);
    return res.status(500).json({ error: 'Erro ao reiniciar a conexão do WhatsApp.' });
  }
}

// Código de pareamento (conectar sem escanear QR, pelo número do telefone).
export async function pairingCodeBaileys(req, res) {
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
    const code = await requestPairingCode(clientId, req.body?.phone);
    return res.json({ code });
  } catch (error) {
    if (error instanceof PairingError || (error instanceof RelayError && error.userFacing)) {
      return res.status(400).json({ error: error.message });
    }
    if (error instanceof RelayError) return res.status(503).json({ error: error.message });
    console.error('Pairing code error:', error);
    return res.status(500).json({ error: 'Não foi possível gerar o código. Tente de novo.' });
  }
}
