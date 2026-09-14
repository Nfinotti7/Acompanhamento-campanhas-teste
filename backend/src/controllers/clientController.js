import bcrypt from 'bcryptjs';
import db from '../config/db.js';

export async function listClients(req, res) {
  try {
    let clients;
    if (req.user.role === 'admin') {
      const { rows } = await db.query(`
        SELECT c.*,
          (SELECT COUNT(*) FROM campaigns WHERE client_id = c.id) as total_campaigns,
          (SELECT SUM(spend) FROM daily_metrics WHERE client_id = c.id) as total_spend
        FROM clients c
        ORDER BY c.name ASC
      `);
      clients = rows;
    } else {
      const { rows } = await db.query('SELECT * FROM clients WHERE id = ?', [req.user.clientId]);
      clients = rows;
    }

    return res.json({ clients });
  } catch (error) {
    console.error('List clients error:', error);
    return res.status(500).json({ error: 'Erro ao listar clientes.' });
  }
}

export async function createClient(req, res) {
  try {
    const { name, company, logo_url, clientUserEmail, clientUserPassword } = req.body;

    if (!name || !company) {
      return res.status(400).json({ error: 'Nome e empresa são obrigatórios.' });
    }

    const { rows } = await db.query(
      'INSERT INTO clients (name, company, logo_url) VALUES (?, ?, ?) RETURNING id',
      [name, company, logo_url || null]
    );
    const newClientId = rows[0].id;

    // Optional client user creation
    if (clientUserEmail && clientUserPassword) {
      const salt = bcrypt.genSaltSync(10);
      const hash = bcrypt.hashSync(clientUserPassword, salt);
      await db.query(
        'INSERT INTO users (name, email, password_hash, role, client_id) VALUES (?, ?, ?, ?, ?)',
        [name, clientUserEmail, hash, 'client', newClientId]
      );
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

export async function deleteClient(req, res) {
  try {
    const clientId = req.params.id;

    const { rows } = await db.query('SELECT id FROM clients WHERE id = ?', [clientId]);
    if (!rows[0]) {
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }

    await db.withTransaction(async (tx) => {
      await tx.query('DELETE FROM daily_metrics WHERE client_id = ?', [clientId]);
      await tx.query('DELETE FROM campaigns WHERE client_id = ?', [clientId]);
      await tx.query('DELETE FROM credentials WHERE client_id = ?', [clientId]);
      await tx.query('DELETE FROM leads WHERE client_id = ?', [clientId]);
      await tx.query('DELETE FROM attribution_events WHERE client_id = ?', [clientId]);
      await tx.query('DELETE FROM users WHERE client_id = ?', [clientId]);
      await tx.query('DELETE FROM clients WHERE id = ?', [clientId]);
    });

    return res.json({ message: 'Cliente removido com sucesso.' });
  } catch (error) {
    console.error('Delete client error:', error);
    return res.status(500).json({ error: 'Erro ao remover cliente.' });
  }
}
