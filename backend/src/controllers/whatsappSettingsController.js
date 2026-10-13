import db from '../config/db.js';
import { hashPin } from '../utils/staffAuth.js';

export async function getWhatsappSettings(req, res) {
  try {
    const clientId = req.user.role === 'admin' ? (req.params.clientId || req.user.clientId) : req.user.clientId;
    if (!clientId) {
      return res.status(400).json({ error: 'ID do cliente é obrigatório.' });
    }

    const { rows } = await db.query(
      'SELECT client_id, phone_number_id, waba_id, display_phone_number, connection_type, updated_at FROM whatsapp_settings WHERE client_id = ?',
      [clientId]
    );

    return res.json({ settings: rows[0] || null });
  } catch (error) {
    console.error('Get WhatsApp settings error:', error);
    return res.status(500).json({ error: 'Erro ao buscar configurações do WhatsApp.' });
  }
}

export async function saveWhatsappSettings(req, res) {
  try {
    const clientId = req.body.clientId;
    const { phoneNumberId, wabaId, accessToken, displayPhoneNumber, pin, connectionType } = req.body;
    const normalizedConnectionType = connectionType === 'baileys' ? 'baileys' : 'cloud_api';

    if (!clientId) {
      return res.status(400).json({ error: 'clientId é obrigatório.' });
    }
    // O modo Baileys (WhatsApp Web não-oficial) não usa phone_number_id/waba_id/access_token
    // da Cloud API — a conexão é feita por QR code, não por credencial.
    if (normalizedConnectionType === 'cloud_api' && (!phoneNumberId || !wabaId)) {
      return res.status(400).json({ error: 'phoneNumberId e wabaId são obrigatórios no modo oficial (Cloud API).' });
    }

    const { rows: existingRows } = await db.query('SELECT id FROM whatsapp_settings WHERE client_id = ?', [clientId]);
    const alreadyExists = existingRows.length > 0;

    if (!alreadyExists) {
      if (normalizedConnectionType === 'cloud_api' && (!accessToken || !pin)) {
        return res.status(400).json({ error: 'accessToken e PIN são obrigatórios no primeiro cadastro deste restaurante.' });
      }
      if (normalizedConnectionType === 'baileys' && !pin) {
        return res.status(400).json({ error: 'PIN é obrigatório no primeiro cadastro deste restaurante.' });
      }
    }

    // Access token nunca é devolvido pela leitura (por segurança), então em
    // atualizações um campo vazio significa "manter o token atual" — não apaga.
    // Modo baileys não usa token nenhum (access_token é NOT NULL na tabela, então
    // usa um placeholder, igual phone_number_id/waba_id).
    const accessTokenParam = accessToken || (normalizedConnectionType === 'baileys' && !alreadyExists ? 'baileys' : null);
    const phoneNumberIdParam = phoneNumberId || 'baileys';
    const wabaIdParam = wabaId || 'baileys';

    if (pin && !/^\d{4,8}$/.test(pin)) {
      return res.status(400).json({ error: 'PIN deve ter entre 4 e 8 dígitos numéricos.' });
    }
    const pinHash = pin ? await hashPin(pin) : null;

    if (!alreadyExists) {
      // Linha nova: access_token é NOT NULL, então nesse caminho ele já foi
      // garantido acima (obrigatório no modo cloud_api, ou preenchido com o
      // placeholder 'baileys' no modo baileys) — nunca chega null aqui.
      await db.query(
        `INSERT INTO whatsapp_settings (client_id, phone_number_id, waba_id, access_token, display_phone_number, staff_pin_hash, connection_type, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [clientId, phoneNumberIdParam, wabaIdParam, accessTokenParam, displayPhoneNumber || null, pinHash, normalizedConnectionType]
      );
    } else {
      // Linha já existe: sempre UPDATE (nunca INSERT) pra poder usar COALESCE
      // contra o valor atual do banco — um INSERT ... ON CONFLICT com
      // access_token nulo na lista de VALUES viola o NOT NULL antes mesmo de
      // chegar no ON CONFLICT, mesmo quando o COALESCE do UPDATE nunca usaria
      // esse null.
      await db.query(
        `UPDATE whatsapp_settings
         SET phone_number_id = ?, waba_id = ?,
             access_token = COALESCE(?, access_token),
             display_phone_number = ?,
             staff_pin_hash = COALESCE(?, staff_pin_hash),
             connection_type = ?, updated_at = CURRENT_TIMESTAMP
         WHERE client_id = ?`,
        [phoneNumberIdParam, wabaIdParam, accessTokenParam, displayPhoneNumber || null, pinHash, normalizedConnectionType, clientId]
      );
    }

    return res.json({ message: 'Configurações do WhatsApp salvas com sucesso!' });
  } catch (error) {
    console.error('Save WhatsApp settings error:', error);
    return res.status(500).json({ error: 'Erro ao salvar configurações do WhatsApp.' });
  }
}
