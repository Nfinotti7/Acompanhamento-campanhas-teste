import pg from 'pg';
import bcrypt from 'bcryptjs';

const { Pool } = pg;

// Postgres returns BIGINT (ex: COUNT(*)) as string by default to avoid precision
// loss above Number.MAX_SAFE_INTEGER. Our counts never get that large, so parse
// them as regular numbers to match the previous SQLite behavior.
pg.types.setTypeParser(20, (val) => parseInt(val, 10));

let pool;
function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
  }
  return pool;
}

function toPgSql(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

async function query(sql, params = []) {
  return getPool().query(toPgSql(sql), params);
}

async function withTransaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const scoped = { query: (sql, params = []) => client.query(toPgSql(sql), params) };
    const result = await fn(scoped);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function initDb() {
  await query(`
    CREATE TABLE IF NOT EXISTS clients (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      company TEXT NOT NULL,
      logo_url TEXT,
      active INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT CHECK(role IN ('admin', 'client')) NOT NULL DEFAULT 'client',
      client_id INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS credentials (
      id SERIAL PRIMARY KEY,
      client_id INTEGER NOT NULL,
      platform TEXT CHECK(platform IN ('google', 'meta')) NOT NULL,
      config_json TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(client_id, platform),
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id SERIAL PRIMARY KEY,
      client_id INTEGER NOT NULL,
      platform TEXT CHECK(platform IN ('google', 'meta')) NOT NULL,
      campaign_id TEXT NOT NULL,
      campaign_name TEXT NOT NULL,
      status TEXT DEFAULT 'ENABLED',
      budget REAL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS daily_metrics (
      id SERIAL PRIMARY KEY,
      campaign_id INTEGER NOT NULL,
      client_id INTEGER NOT NULL,
      platform TEXT NOT NULL,
      date TEXT NOT NULL,
      spend REAL DEFAULT 0,
      clicks INTEGER DEFAULT 0,
      impressions INTEGER DEFAULT 0,
      conversions INTEGER DEFAULT 0,
      conversion_value REAL DEFAULT 0,
      ctr REAL DEFAULT 0,
      cpc REAL DEFAULT 0,
      cpm REAL DEFAULT 0,
      roas REAL DEFAULT 0,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS leads (
      id SERIAL PRIMARY KEY,
      client_id INTEGER NOT NULL,
      name TEXT,
      email TEXT,
      phone TEXT,
      source TEXT,
      medium TEXT,
      campaign TEXT,
      content TEXT,
      gclid TEXT,
      fbclid TEXT,
      ip TEXT,
      conversion_value REAL DEFAULT 0,
      custom_data TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS attribution_events (
      id SERIAL PRIMARY KEY,
      client_id INTEGER NOT NULL,
      event_name TEXT NOT NULL,
      page_url TEXT,
      utm_source TEXT,
      utm_medium TEXT,
      utm_campaign TEXT,
      gclid TEXT,
      fbclid TEXT,
      lead_email TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_campaigns_unique
      ON campaigns(client_id, platform, campaign_id);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_metrics_unique
      ON daily_metrics(campaign_id, date);
  `);

  await seedData();
}

async function seedData() {
  const { rows } = await query('SELECT COUNT(*) as count FROM clients');
  if (rows[0].count > 0) return; // Already seeded

  console.log('Seeding initial data...');

  // 1. Insert Clients
  const insertClient = async (name, company, logo_url) => {
    const { rows } = await query(
      'INSERT INTO clients (name, company, logo_url) VALUES (?, ?, ?) RETURNING id',
      [name, company, logo_url]
    );
    return rows[0].id;
  };

  const client1 = await insertClient('TechStore Brasil', 'TechStore E-commerce', 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100');
  const client2 = await insertClient('Odonto Prime', 'Clínica Odonto Prime', 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=100');
  const client3 = await insertClient('Solaris Energia', 'Solaris Engenharia Solar', 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=100');

  // 2. Insert Users
  const salt = bcrypt.genSaltSync(10);
  const adminPass = bcrypt.hashSync('admin123', salt);
  const clientPass = bcrypt.hashSync('cliente123', salt);

  const insertUser = (name, email, hash, role, clientId) =>
    query('INSERT INTO users (name, email, password_hash, role, client_id) VALUES (?, ?, ?, ?, ?)', [name, email, hash, role, clientId]);

  await insertUser('Gestor Agência Further', 'admin@agenciafurther.com.br', adminPass, 'admin', null);
  await insertUser('Mariana TechStore', 'cliente@techstore.com.br', clientPass, 'client', client1);
  await insertUser('Dr. Roberto Odonto', 'cliente@odontoprime.com.br', clientPass, 'client', client2);
  await insertUser('Carlos Solaris', 'cliente@solaris.com.br', clientPass, 'client', client3);

  // 3. Credentials Seed
  await query(
    'INSERT INTO credentials (client_id, platform, config_json) VALUES (?, ?, ?)',
    [client1, 'google', JSON.stringify({
      developer_token: 'GADS_DEV_TOK_998123',
      client_id: '88723612-gads.apps.googleusercontent.com',
      client_secret: 'GOCSPX-secret_example_991',
      refresh_token: '1//0g_example_refresh_token',
      customer_id: '123-456-7890'
    })]
  );

  await query(
    'INSERT INTO credentials (client_id, platform, config_json) VALUES (?, ?, ?)',
    [client1, 'meta', JSON.stringify({
      access_token: 'EAAXX_meta_access_token_example_12345',
      ad_account_id: 'act_1092837465',
      pixel_id: '9928374615243',
      webhook_secret: 'whsec_meta_secret_9981'
    })]
  );

  // 4. Seed Campaigns
  const insertCampaign = async (clientId, platform, campaignId, campaignName, status, budget) => {
    const { rows } = await query(
      'INSERT INTO campaigns (client_id, platform, campaign_id, campaign_name, status, budget) VALUES (?, ?, ?, ?, ?, ?) RETURNING id',
      [clientId, platform, campaignId, campaignName, status, budget]
    );
    return rows[0].id;
  };

  // Client 1 Campaigns
  const c1_g1 = await insertCampaign(client1, 'google', 'g_camp_101', '[Google Search] TechStore - Eletrônicos Top Sales', 'ENABLED', 250.0);
  const c1_g2 = await insertCampaign(client1, 'google', 'g_camp_102', '[Google PMax] TechStore - Performance Max Geral', 'ENABLED', 400.0);
  const c1_m1 = await insertCampaign(client1, 'meta', 'm_camp_201', '[Meta Conversão] TechStore - Reels Smartphones & Audio', 'ENABLED', 300.0);
  const c1_m2 = await insertCampaign(client1, 'meta', 'm_camp_202', '[Meta Remarketing] TechStore - Carrinho Abandonado', 'ENABLED', 150.0);

  // Client 2 Campaigns
  const c2_g1 = await insertCampaign(client2, 'google', 'g_camp_301', '[Google Search] Odonto Prime - Implantes & Alinhadores', 'ENABLED', 180.0);
  const c2_m1 = await insertCampaign(client2, 'meta', 'm_camp_302', '[Meta Leads] Odonto Prime - Captação Pacientes VIP', 'ENABLED', 200.0);

  // 5. Seed Daily Metrics (Last 30 Days)
  const insertMetric = (campaignId, clientId, platform, date, spend, clicks, impressions, conversions, conversionValue, ctr, cpc, cpm, roas) =>
    query(
      `INSERT INTO daily_metrics (campaign_id, client_id, platform, date, spend, clicks, impressions, conversions, conversion_value, ctr, cpc, cpm, roas)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [campaignId, clientId, platform, date, spend, clicks, impressions, conversions, conversionValue, ctr, cpc, cpm, roas]
    );

  const today = new Date();
  const campaignsList = [
    { id: c1_g1, clientId: client1, platform: 'google', baseSpend: 240, baseClicks: 120, baseConversions: 8, convVal: 1800 },
    { id: c1_g2, clientId: client1, platform: 'google', baseSpend: 380, baseClicks: 210, baseConversions: 15, convVal: 4200 },
    { id: c1_m1, clientId: client1, platform: 'meta', baseSpend: 290, baseClicks: 340, baseConversions: 12, convVal: 2900 },
    { id: c1_m2, clientId: client1, platform: 'meta', baseSpend: 140, baseClicks: 95, baseConversions: 14, convVal: 3800 },
    { id: c2_g1, clientId: client2, platform: 'google', baseSpend: 175, baseClicks: 85, baseConversions: 5, convVal: 2500 },
    { id: c2_m1, clientId: client2, platform: 'meta', baseSpend: 195, baseClicks: 160, baseConversions: 9, convVal: 4500 },
  ];

  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];

    for (const c of campaignsList) {
      // Add slight random fluctuation for realistic charts
      const factor = 0.85 + Math.random() * 0.3;
      const spend = Number((c.baseSpend * factor).toFixed(2));
      const clicks = Math.round(c.baseClicks * factor);
      const impressions = Math.round(clicks * (12 + Math.random() * 8));
      const conversions = Math.round(c.baseConversions * factor);
      const conversion_value = Number((c.convVal * factor).toFixed(2));

      const ctr = Number(((clicks / (impressions || 1)) * 100).toFixed(2));
      const cpc = Number((spend / (clicks || 1)).toFixed(2));
      const cpm = Number(((spend / (impressions || 1)) * 1000).toFixed(2));
      const roas = Number((conversion_value / (spend || 1)).toFixed(2));

      await insertMetric(c.id, c.clientId, c.platform, dateStr, spend, clicks, impressions, conversions, conversion_value, ctr, cpc, cpm, roas);
    }
  }

  // 6. Seed Leads
  const sampleLeads = [
    { client: client1, name: 'Lucas Ferreira', email: 'lucas.f@gmail.com', phone: '(11) 98765-4321', source: 'google', medium: 'cpc', campaign: 'TechStore - Eletrônicos Top Sales', gclid: 'Cj0KCQiA...gads', conv: 450.00 },
    { client: client1, name: 'Amanda Souza', email: 'amanda.souza@outlook.com', phone: '(21) 97654-3210', source: 'meta', medium: 'paid_social', campaign: 'TechStore - Reels Smartphones', fbclid: 'fb.1.169...meta', conv: 1290.00 },
    { client: client1, name: 'Rafael Costa', email: 'rafael.costa@tech.com', phone: '(31) 99123-8877', source: 'google', medium: 'cpc', campaign: 'TechStore - Performance Max', gclid: 'Cj0KCQiB...gads2', conv: 890.00 },
    { client: client2, name: 'Patricia Lima', email: 'patricia.lima@yahoo.com.br', phone: '(11) 96543-2109', source: 'meta', medium: 'cpc', campaign: 'Odonto Prime - Captação Pacientes VIP', fbclid: 'fb.1.998...meta2', conv: 3500.00 },
    { client: client2, name: 'Gabriel Alves', email: 'gabriel.alves@hotmail.com', phone: '(11) 98822-1144', source: 'google', medium: 'cpc', campaign: 'Odonto Prime - Implantes & Alinhadores', gclid: 'Cj0KCQiC...gads3', conv: 5000.00 }
  ];

  for (let idx = 0; idx < sampleLeads.length; idx++) {
    const l = sampleLeads[idx];
    const d = new Date(today);
    d.setHours(d.getHours() - (idx * 5 + 2));
    await query(
      `INSERT INTO leads (client_id, name, email, phone, source, medium, campaign, content, gclid, fbclid, ip, conversion_value, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [l.client, l.name, l.email, l.phone, l.source, l.medium, l.campaign, 'anuncio_v1', l.gclid || null, l.fbclid || null, '189.12.44.101', l.conv, d.toISOString()]
    );
  }

  // 7. Seed Attribution Events
  await query(
    `INSERT INTO attribution_events (client_id, event_name, page_url, utm_source, utm_medium, utm_campaign, gclid, fbclid, lead_email, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [client1, 'page_view', 'https://techstore.com.br/smartphone-xyz', 'google', 'cpc', 'TechStore - Eletrônicos Top Sales', 'Cj0KCQiA...gads', null, 'lucas.f@gmail.com', new Date().toISOString()]
  );
  await query(
    `INSERT INTO attribution_events (client_id, event_name, page_url, utm_source, utm_medium, utm_campaign, gclid, fbclid, lead_email, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [client1, 'purchase', 'https://techstore.com.br/checkout/success', 'google', 'cpc', 'TechStore - Eletrônicos Top Sales', 'Cj0KCQiA...gads', null, 'lucas.f@gmail.com', new Date().toISOString()]
  );
  await query(
    `INSERT INTO attribution_events (client_id, event_name, page_url, utm_source, utm_medium, utm_campaign, gclid, fbclid, lead_email, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [client1, 'lead_form_submit', 'https://techstore.com.br/oferta-reels', 'meta', 'paid_social', 'TechStore - Reels Smartphones', null, 'fb.1.169...meta', 'amanda.souza@outlook.com', new Date().toISOString()]
  );

  console.log('Seed completed successfully!');
}

const db = { query, withTransaction };
export default db;
