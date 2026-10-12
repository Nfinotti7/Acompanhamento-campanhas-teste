// Descobre o Page ID real de um conjunto de campanhas Meta, usando o mesmo método
// que o syncService já usa para desambiguar contas compartilhadas (fetchCampaignPageId).
import pg from 'pg';
import dotenv from 'dotenv';
import { fetchCampaignPageId } from '../src/services/metaAdsSync.js';

dotenv.config();

const { Pool } = pg;

async function main() {
  const [sourceClientId, pairsArg] = process.argv.slice(2);
  // pairsArg: "label1:campaignId1,label2:campaignId2"
  const pairs = pairsArg.split(',').map((p) => {
    const [label, campaignId] = p.split(':');
    return { label, campaignId };
  });

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  let accessToken;
  try {
    const r = await pool.query(`SELECT config_json::jsonb->>'access_token' as access_token FROM credentials WHERE client_id = $1 AND platform = 'meta'`, [sourceClientId]);
    accessToken = r.rows[0].access_token;
  } finally {
    await pool.end();
  }

  for (const { label, campaignId } of pairs) {
    try {
      const pageId = await fetchCampaignPageId(campaignId, accessToken);
      console.log(label, '->', pageId);
    } catch (err) {
      console.log(label, '-> ERRO', err.message);
    }
  }
}

main().catch((err) => {
  console.error('Erro:', err.message);
  process.exit(1);
});
