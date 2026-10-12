import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

async function main() {
  const [sourceClientId, idsArg] = process.argv.slice(2);
  const ids = idsArg.split(',');

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  let cfg;
  try {
    const r = await pool.query(`SELECT config_json FROM credentials WHERE client_id = $1 AND platform = 'google'`, [sourceClientId]);
    cfg = JSON.parse(r.rows[0].config_json);
  } finally {
    await pool.end();
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cfg.client_id,
      client_secret: cfg.client_secret,
      refresh_token: cfg.refresh_token,
      grant_type: 'refresh_token'
    })
  });
  const tokenData = await tokenRes.json();

  for (const id of ids) {
    const headers = {
      Authorization: `Bearer ${tokenData.access_token}`,
      'Content-Type': 'application/json',
      ...(cfg.developer_token ? { 'developer-token': cfg.developer_token } : {})
    };
    const res = await fetch(`https://googleads.googleapis.com/v25/customers/${id}/googleAds:search`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: 'SELECT customer.id, customer.descriptive_name, customer.status, customer.manager FROM customer LIMIT 1' })
    });
    const data = await res.json();
    if (!res.ok) {
      console.log(id, '-> ERRO', JSON.stringify(data.error?.message || data));
    } else {
      const c = data.results?.[0]?.customer;
      console.log(id, '->', c ? `${c.descriptiveName} (status: ${c.status}, manager: ${c.manager})` : 'sem dados');
    }
  }
}

main().catch((err) => {
  console.error('Erro:', err.message);
  process.exit(1);
});
