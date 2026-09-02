import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../config/db.js';
import { JWT_SECRET } from '../middleware/authMiddleware.js';

export function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
    }

    const user = db.prepare('SELECT u.*, c.name as client_name, c.company as client_company FROM users u LEFT JOIN clients c ON u.client_id = c.id WHERE u.email = ?').get(email);

    if (!user) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    const isMatch = bcrypt.compareSync(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    const payload = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      clientId: user.client_id
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

    return res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        clientId: user.client_id,
        clientName: user.client_name,
        clientCompany: user.client_company
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Erro interno ao realizar login.' });
  }
}

export function getMe(req, res) {
  try {
    const user = db.prepare('SELECT u.id, u.name, u.email, u.role, u.client_id, c.name as client_name, c.company as client_company FROM users u LEFT JOIN clients c ON u.client_id = c.id WHERE u.id = ?').get(req.user.id);

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    return res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        clientId: user.client_id,
        clientName: user.client_name,
        clientCompany: user.client_company
      }
    });
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao buscar perfil do usuário.' });
  }
}
