import db from '../config/db.js';
import { hashPin } from '../utils/staffAuth.js';

export async function getWhatsappSettings(req, res) {
  try {
    const clientId = req.user.role === 'admin' ? (req.params.clientId || req.user.clientId) : req.user.clientId;
    if (!clientId) {
      return res.status(400).json({ error: 'ID do cliente é obrigatório.' });
    }

    const { rows } = await db.query(
      'SELECT client_id, phone_number_id, waba_id, display_phone_number, updated_at FROM whatsapp_settings WHERE client_id = ?',
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
    const { phoneNumberId, wabaId, accessToken, displayPhoneNumber, pin } = req.body;

    if (!clientId || !phoneNumberId || !wabaId) {
      return res.status(400).json({ error: 'clientId, phoneNumberId e wabaId são obrigatórios.' });
    }

    const { rows: existingRows } = await db.query('SELECT id FROM whatsapp_settings WHERE client_id = ?', [clientId]);
    const alreadyExists = existingRows.length > 0;

    if (!alreadyExists && (!accessToken || !pin)) {
      return res.status(400).json({ error: 'accessToken e PIN são obrigatórios no primeiro cadastro deste restaurante.' });
    }

    // Access token nunca é devolvido pela leitura (por segurança), então em
    // atualizações um campo vazio significa "manter o token atual" — não apaga.
    const accessTokenParam = accessToken || null;

    if (pin) {
      const pinHash = await hashPin(pin);
      await db.query(
        `INSERT INTO whatsapp_settings (client_id, phone_number_id, waba_id, access_token, display_phone_number, staff_pin_hash, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT (client_id) DO UPDATE SET
           phone_number_id = excluded.phone_number_id,
           waba_id = excluded.waba_id,
           access_token = COALESCE(excluded.access_token, whatsapp_settings.access_token),
           display_phone_number = excluded.display_phone_number,
           staff_pin_hash = excluded.staff_pin_hash,
           updated_at = CURRENT_TIMESTAMP`,
        [clientId, phoneNumberId, wabaId, accessTokenParam, displayPhoneNumber || null, pinHash]
      );
    } else {
      await db.query(
        `UPDATE whatsapp_settings
         SET phone_number_id = ?, waba_id = ?,
             access_token = COALESCE(?, access_token),
             display_phone_number = ?, updated_at = CURRENT_TIMESTAMP
         WHERE client_id = ?`,
        [phoneNumberId, wabaId, accessTokenParam, displayPhoneNumber || null, clientId]
      );
    }

    return res.json({ message: 'Configurações do WhatsApp salvas com sucesso!' });
  } catch (error) {
    console.error('Save WhatsApp settings error:', error);
    return res.status(500).json({ error: 'Erro ao salvar configurações do WhatsApp.' });
  }
}
