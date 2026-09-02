import db from '../config/db.js';

export function getCredentials(req, res) {
  try {
    const clientId = req.user.role === 'admin' ? (req.params.clientId || req.user.clientId) : req.user.clientId;

    if (!clientId) {
      return res.status(400).json({ error: 'ID do cliente é obrigatório.' });
    }

    const rows = db.prepare('SELECT platform, config_json, updated_at FROM credentials WHERE client_id = ?').all(clientId);

    const credentials = {
      google: null,
      meta: null
    };

    rows.forEach(r => {
      try {
        credentials[r.platform] = JSON.parse(r.config_json);
      } catch (e) {
        credentials[r.platform] = {};
      }
    });

    return res.json({ credentials, clientId });
  } catch (error) {
    console.error('Get credentials error:', error);
    return res.status(500).json({ error: 'Erro ao buscar credenciais.' });
  }
}

export function saveCredentials(req, res) {
  try {
    const clientId = req.user.role === 'admin' ? (req.body.clientId || req.user.clientId) : req.user.clientId;
    const { platform, config } = req.body;

    if (!clientId || !platform || !config) {
      return res.status(400).json({ error: 'Cliente, plataforma e configurações são obrigatórios.' });
    }

    if (!['google', 'meta'].includes(platform)) {
      return res.status(400).json({ error: 'Plataforma deve ser "google" ou "meta".' });
    }

    const jsonString = JSON.stringify(config);
    const stmt = db.prepare(`
      INSERT INTO credentials (client_id, platform, config_json, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(client_id, platform) DO UPDATE SET
        config_json = excluded.config_json,
        updated_at = CURRENT_TIMESTAMP
    `);

    stmt.run(clientId, platform, jsonString);

    return res.json({ message: `Credenciais da plataforma ${platform.toUpperCase()} salvas com sucesso!` });
  } catch (error) {
    console.error('Save credentials error:', error);
    return res.status(500).json({ error: 'Erro ao salvar credenciais.' });
  }
}
