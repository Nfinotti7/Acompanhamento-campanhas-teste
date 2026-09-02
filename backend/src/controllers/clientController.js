import bcrypt from 'bcryptjs';
import db from '../config/db.js';

export function listClients(req, res) {
  try {
    let clients;
    if (req.user.role === 'admin') {
      clients = db.prepare(`
        SELECT c.*, 
          (SELECT COUNT(*) FROM campaigns WHERE client_id = c.id) as total_campaigns,
          (SELECT SUM(spend) FROM daily_metrics WHERE client_id = c.id) as total_spend
        FROM clients c
        ORDER BY c.name ASC
      `).all();
    } else {
      clients = db.prepare('SELECT * FROM clients WHERE id = ?').all(req.user.clientId);
    }

    return res.json({ clients });
  } catch (error) {
    console.error('List clients error:', error);
    return res.status(500).json({ error: 'Erro ao listar clientes.' });
  }
}

export function createClient(req, res) {
  try {
    const { name, company, logo_url, clientUserEmail, clientUserPassword } = req.body;

    if (!name || !company) {
      return res.status(400).json({ error: 'Nome e empresa são obrigatórios.' });
    }

    const insertClient = db.prepare('INSERT INTO clients (name, company, logo_url) VALUES (?, ?, ?)');
    const result = insertClient.run(name, company, logo_url || null);
    const newClientId = result.lastInsertRowid;

    // Optional client user creation
    if (clientUserEmail && clientUserPassword) {
      const salt = bcrypt.genSaltSync(10);
      const hash = bcrypt.hashSync(clientUserPassword, salt);
      const insertUser = db.prepare('INSERT INTO users (name, email, password_hash, role, client_id) VALUES (?, ?, ?, ?, ?)');
      insertUser.run(name, clientUserEmail, hash, 'client', newClientId);
    }

    return res.status(201).json({
      message: 'Cliente cadastrado com sucesso!',
      clientId: newClientId
    });
  } catch (error) {
    console.error('Create client error:', error);
    return res.status(500).json({ error: 'Erro ao criar cliente.' });
  }
}
