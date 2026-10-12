// Lista as contas do Google Ads acessíveis pelo refresh_token já salvo de um cliente,
// e, pra cada uma, tenta buscar campanhas pra identificar de quem é.
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

async function main() {
  const [sourceClientId] = process.argv.slice(2);
  if (!sourceClientId) {
    console.error('Uso: node list-accessible-google-customers.js <clientId-com-credencial-google>');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  let cfg;
  try {
    const r = await pool.query(`SELECT config_json FROM credentials WHERE client_id = $1 AND platform = 'google'`, [sourceClientId]);
    if (r.rowCount === 0) {
      console.error('Credencial google não encontrada pra esse client_id.');
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
    console.error('Falha ao obter access_token:', tokenData);
    process.exit(1);
  }

  const listRes = await fetch('https://googleads.googleapis.com/v25/customers:listAccessibleCustomers', {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      ...(cfg.developer_token ? { 'developer-token': cfg.developer_token } : {})
    }
  });
  const listData = await listRes.json();
  if (!listRes.ok) {
    console.error('Falha ao listar customers acessiveis:', JSON.stringify(listData));
    process.exit(1);
  }

  console.log('Customers acessiveis diretamente:', JSON.stringify(listData.resourceNames));

  // Tambem lista os customers "geridos" sob o login_customer_id (MCC) atual, se houver
  if (cfg.login_customer_id) {
    const mccId = cfg.login_customer_id.replace(/-/g, '');
    const headers = {
      Authorization: `Bearer ${tokenData.access_token}`,
      'Content-Type': 'application/json',
      'login-customer-id': mccId,
      ...(cfg.developer_token ? { 'developer-token': cfg.developer_token } : {})
    };
    const query = {
      query: `SELECT customer_client.id, customer_client.descriptive_name, customer_client.level, customer_client.status
              FROM customer_client
              WHERE customer_client.level <= 2`
    };
    const gaqlRes = await fetch(`https://googleads.googleapis.com/v25/customers/${mccId}/googleAds:search`, {
      method: 'POST',
      headers,
      body: JSON.stringify(query)
    });
    const gaqlData = await gaqlRes.json();
    if (!gaqlRes.ok) {
      console.error('Falha ao listar clientes da MCC', mccId, ':', JSON.stringify(gaqlData));
    } else {
      console.log(`Contas sob a MCC ${mccId}:`);
      for (const row of gaqlData.results || []) {
        console.log(' -', row.customerClient.id, row.customerClient.descriptiveName, row.customerClient.status, 'nivel', row.customerClient.level);
      }
    }
  }
}

main().catch((err) => {
  console.error('Erro:', err.message);
  process.exit(1);
});
