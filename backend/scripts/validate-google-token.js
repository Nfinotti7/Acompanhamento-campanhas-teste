// Valida as credenciais Google salvas no banco para um client_id: troca o refresh_token
// por um access_token e faz uma chamada simples à Google Ads API. Não imprime segredos.
//
// Uso: node validate-google-token.js <clientId>

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

async function main() {
  const [clientId] = process.argv.slice(2);
  if (!clientId) {
    console.error('Uso: node validate-google-token.js <clientId>');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  let cfg;
  try {
    const r = await pool.query(
      `SELECT config_json FROM credentials WHERE client_id = $1 AND platform = 'google'`,
      [clientId]
    );
    if (r.rowCount === 0) {
      console.error('Credencial google não encontrada.');
      process.exit(1);
    }
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

  if (!tokenRes.ok) {
    console.error('FALHA ao trocar refresh_token por access_token:', tokenData.error, tokenData.error_description || '');
    process.exit(1);
  }
  console.log('OK: access_token obtido com sucesso (expira em', tokenData.expires_in, 's)');

  const customerId = cfg.customer_id.replace(/-/g, '');
  const loginCustomerId = (cfg.login_customer_id || '').replace(/-/g, '');

  const headers = {
    Authorization: `Bearer ${tokenData.access_token}`,
    'Content-Type': 'application/json'
  };
  if (loginCustomerId) headers['login-customer-id'] = loginCustomerId;
  if (cfg.developer_token) headers['developer-token'] = cfg.developer_token;

  const adsRes = await fetch(`https://googleads.googleapis.com/v25/customers/${customerId}/googleAds:search`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query: 'SELECT campaign.id, campaign.name FROM campaign LIMIT 5' })
  });
  const rawText = await adsRes.text();
  let adsData;
  try {
    adsData = JSON.parse(rawText);
  } catch {
    console.error('FALHA na chamada à Google Ads API. Status:', adsRes.status, adsRes.statusText);
    console.error('Resposta (primeiros 500 chars):', rawText.slice(0, 500));
    process.exit(1);
  }

  if (!adsRes.ok) {
    console.error('FALHA na chamada à Google Ads API:', JSON.stringify(adsData.error || adsData));
    process.exit(1);
  }

  console.log('OK: Google Ads API respondeu. Campanhas encontradas:', (adsData.results || []).length);
  for (const r of adsData.results || []) {
    console.log(' -', r.campaign?.id, r.campaign?.name);
  }
}

main().catch((err) => {
  console.error('Erro:', err.message);
  process.exit(1);
});
