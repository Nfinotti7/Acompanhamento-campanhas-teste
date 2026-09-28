import jwt from 'jsonwebtoken';
import db from '../config/db.js';
import { verifyPin } from '../utils/staffAuth.js';
import { JWT_SECRET } from '../middleware/authMiddleware.js';

export async function listRestaurants(req, res) {
  try {
    const { rows } = await db.query(
      `SELECT c.id, c.name
       FROM clients c
       JOIN whatsapp_settings ws ON ws.client_id = c.id
       WHERE c.active = 1
       ORDER BY c.name`
    );
    return res.json({ restaurants: rows });
  } catch (error) {
    console.error('List restaurants error:', error);
    return res.status(500).json({ error: 'Erro ao listar restaurantes.' });
  }
}

export async function staffLogin(req, res) {
  try {
    const { clientId, pin } = req.body;
    if (!clientId || !pin) {
      return res.status(400).json({ error: 'clientId e pin são obrigatórios.' });
    }

    const { rows } = await db.query('SELECT staff_pin_hash FROM whatsapp_settings WHERE client_id = ?', [clientId]);
    const settings = rows[0];

    if (!settings || !verifyPin(pin, settings.staff_pin_hash)) {
      return res.status(401).json({ error: 'PIN inválido.' });
    }

    const token = jwt.sign({ role: 'staff', clientId: Number(clientId) }, JWT_SECRET, { expiresIn: '12h' });
    return res.json({ token });
  } catch (error) {
    console.error('Staff login error:', error);
    return res.status(500).json({ error: 'Erro ao autenticar.' });
  }
}
