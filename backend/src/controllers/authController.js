import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../config/db.js';
import { JWT_SECRET } from '../middleware/authMiddleware.js';

// Restaurantes de um login de grupo (user_clients). Vazio = usuário comum de um cliente só.
async function getGroupClients(userId) {
  const { rows } = await db.query(
    `SELECT c.id, c.name, c.company FROM user_clients uc
     JOIN clients c ON c.id = uc.client_id
     WHERE uc.user_id = ? ORDER BY c.name ASC`,
    [userId]
  );
  return rows;
}

function publicUser(user, groupClients) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    clientId: user.client_id,
    clientName: user.client_name,
    clientCompany: user.client_company,
    ...(groupClients.length > 0 ? { clients: groupClients } : {})
  };
}

export async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
    }

    const { rows } = await db.query(
      'SELECT u.*, c.name as client_name, c.company as client_company FROM users u LEFT JOIN clients c ON u.client_id = c.id WHERE u.email = ?',
      [email]
    );
    const user = rows[0];

    if (!user) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    const isMatch = bcrypt.compareSync(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    const groupClients = user.role === 'client' ? await getGroupClients(user.id) : [];

    const payload = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      clientId: user.client_id,
      ...(groupClients.length > 0 ? { clientIds: groupClients.map((c) => c.id) } : {})
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

    return res.json({ token, user: publicUser(user, groupClients) });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Erro interno ao realizar login.' });
  }
}

export async function getMe(req, res) {
  try {
    const { rows } = await db.query(
      'SELECT u.id, u.name, u.email, u.role, u.client_id, c.name as client_name, c.company as client_company FROM users u LEFT JOIN clients c ON u.client_id = c.id WHERE u.id = ?',
      [req.user.id]
    );
    const user = rows[0];

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    const groupClients = user.role === 'client' ? await getGroupClients(user.id) : [];
    return res.json({ user: publicUser(user, groupClients) });
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao buscar perfil do usuário.' });
  }
}
