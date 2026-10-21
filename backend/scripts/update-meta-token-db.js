// Atualiza SOMENTE o campo access_token nas credenciais Meta do cliente informado,
// preservando os demais campos (ad_account_id, pixel_id, webhook_secret) sem nunca
// ler ou imprimir o valor atual deles.
//
// Uso: node update-meta-token-db.js <clientId> <caminho-do-arquivo-com-o-token>

import fs from 'node:fs';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

async function main() {
  const [clientId, tokenFilePath] = process.argv.slice(2);
  if (!clientId || !tokenFilePath) {
    console.error('Uso: node update-meta-token-db.js <clientId> <arquivo-com-token>');
    process.exit(1);
  }

  const token = fs.readFileSync(tokenFilePath, 'utf8').trim().replace(/^[^A-Za-z0-9]+/, '');
  if (!token || token.length < 50) {
    console.error('Token inválido ou vazio no arquivo.');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  try {
    const result = await pool.query(
      `UPDATE credentials
       SET config_json = (config_json::jsonb || jsonb_build_object('access_token', $1::text))::text,
           updated_at = CURRENT_TIMESTAMP
       WHERE client_id = $2 AND platform = 'meta'
       RETURNING id`,
      [token, clientId]
    );

    if (result.rowCount === 0) {
      console.error('Nenhuma credencial meta encontrada para esse client_id.');
      process.exit(1);
    }

    console.log(`OK: access_token atualizado (len=${token.length}) para client_id=${clientId}.`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Erro:', err.message);
  process.exit(1);
});
