import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import db from '../config/db.js';

// Sem 0/O, 1/l/I: a senha é lida por telefone ou WhatsApp e digitada à mão.
const ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generatePassword(length = 10, randomInt = crypto.randomInt) {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

// Só usuários de cliente: a senha do admin não se redefine por aqui.
export async function listClientUsers(req, res) {
  try {
    const { rows } = await db.query(
      `SELECT u.id, u.name, u.email, u.client_id, c.name AS client_name,
              (SELECT COUNT(*) FROM user_clients uc WHERE uc.user_id = u.id) AS group_size
         FROM users u
         LEFT JOIN clients c ON c.id = u.client_id
        WHERE u.role = 'client'
        ORDER BY u.name`
    );
    return res.json({ users: rows });
  } catch (error) {
    console.error('List client users error:', error);
    return res.status(500).json({ error: 'Erro ao listar acessos.' });
  }
}

export async function resetUserPassword(req, res) {
  try {
    const { rows } = await db.query("SELECT id, name, email FROM users WHERE id = ? AND role = 'client'", [req.params.id]);
    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'Usuário de cliente não encontrado.' });

    const password = generatePassword();
    const hash = bcrypt.hashSync(password, bcrypt.genSaltSync(10));
    await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, user.id]);

    console.log(`Senha do usuário ${user.id} (${user.email}) redefinida por admin ${req.user?.id}.`);
    // A senha só existe aqui e nesta resposta; o banco guarda apenas o hash.
    return res.json({ email: user.email, name: user.name, password });
  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({ error: 'Erro ao redefinir a senha.' });
  }
}
