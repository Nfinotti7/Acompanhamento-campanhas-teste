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
      reach INTEGER DEFAULT 0,
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

    CREATE TABLE IF NOT EXISTS whatsapp_settings (
      id SERIAL PRIMARY KEY,
      client_id INTEGER NOT NULL UNIQUE,
      phone_number_id TEXT NOT NULL,
      waba_id TEXT NOT NULL,
      access_token TEXT NOT NULL,
      display_phone_number TEXT,
      staff_pin_hash TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS whatsapp_contacts (
      id SERIAL PRIMARY KEY,
      client_id INTEGER NOT NULL,
      wa_id TEXT NOT NULL,
      profile_name TEXT,
      ctwa_clid TEXT,
      ad_id TEXT,
      ad_headline TEXT,
      ad_body TEXT,
      source TEXT DEFAULT 'organic',
      first_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_message_at TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
      UNIQUE(client_id, wa_id)
    );

    CREATE TABLE IF NOT EXISTS whatsapp_messages (
      id SERIAL PRIMARY KEY,
      client_id INTEGER NOT NULL,
      contact_id INTEGER NOT NULL,
      direction TEXT CHECK(direction IN ('inbound', 'outbound')) NOT NULL,
      body TEXT,
      wa_message_id TEXT UNIQUE,
      sent_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (contact_id) REFERENCES whatsapp_contacts(id) ON DELETE CASCADE,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS real_conversions (
      id SERIAL PRIMARY KEY,
      client_id INTEGER NOT NULL,
      contact_id INTEGER,
      customer_name TEXT NOT NULL,
      phone TEXT,
      amount_spent REAL NOT NULL,
      matched_by TEXT CHECK(matched_by IN ('phone', 'name', 'manual')) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (contact_id) REFERENCES whatsapp_contacts(id) ON DELETE SET NULL,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_campaigns_unique
      ON campaigns(client_id, platform, campaign_id);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_metrics_unique
      ON daily_metrics(campaign_id, date);
  `);

  // Additive schema evolution for tables that already existed before this column was introduced.
  // Never touches existing rows (default 0), never drops/recreates anything.
  await query(`ALTER TABLE daily_metrics ADD COLUMN IF NOT EXISTS reach INTEGER DEFAULT 0`);
  await query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS campaign_prefix TEXT`);
  await query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS page_id TEXT`);
  await query(`ALTER TABLE campaigns ALTER COLUMN client_id DROP NOT NULL`);
  await query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS classification TEXT NOT NULL DEFAULT 'ok'`);
  await query(`ALTER TABLE whatsapp_contacts ADD COLUMN IF NOT EXISTS appointment_at TIMESTAMP`);
  await query(`ALTER TABLE whatsapp_settings ADD COLUMN IF NOT EXISTS remarketing_days INTEGER NOT NULL DEFAULT 3`);
  // appointment_at precisa guardar o instante absoluto (TIMESTAMPTZ), não um horário "sem fuso" —
  // com TIMESTAMP puro, o horário de agendamento lido de volta fica deslocado pelo fuso do servidor.
  await query(`ALTER TABLE whatsapp_contacts ALTER COLUMN appointment_at TYPE TIMESTAMPTZ USING appointment_at AT TIME ZONE 'UTC'`);
  // 'cloud_api' (API oficial da Meta) ou 'baileys' (WhatsApp Web nao-oficial) -- escolhido por cliente.
  await query(`ALTER TABLE whatsapp_settings ADD COLUMN IF NOT EXISTS connection_type TEXT NOT NULL DEFAULT 'cloud_api'`);
  await query(`ALTER TABLE whatsapp_contacts ADD COLUMN IF NOT EXISTS notes TEXT`);
  await query(`ALTER TABLE whatsapp_contacts ADD COLUMN IF NOT EXISTS manual_stage TEXT`);
  await query(`ALTER TABLE whatsapp_contacts ADD COLUMN IF NOT EXISTS manual_stage_set_at TIMESTAMPTZ`);
  // Mídias (fotos, áudios, vídeos, documentos, figurinhas, foto de perfil) ficam no
  // Postgres, não no disco do servidor -- o disco do app pode ser apagado em deploy.
  // Toda mídia pertence a um contato: apagar o contato apaga as mídias dele junto.
  await query(`
    CREATE TABLE IF NOT EXISTS whatsapp_media (
      id SERIAL PRIMARY KEY,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      contact_id INTEGER NOT NULL REFERENCES whatsapp_contacts(id) ON DELETE CASCADE,
      mime_type TEXT NOT NULL,
      data BYTEA NOT NULL,
      size_bytes INTEGER NOT NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await query(`ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS media_id INTEGER REFERENCES whatsapp_media(id) ON DELETE SET NULL`);
  await query(`ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS media_type TEXT`);
  await query(`ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS media_filename TEXT`);
  await query(`ALTER TABLE whatsapp_contacts ADD COLUMN IF NOT EXISTS profile_pic_media_id INTEGER REFERENCES whatsapp_media(id) ON DELETE SET NULL`);
  await query(`ALTER TABLE whatsapp_contacts ADD COLUMN IF NOT EXISTS profile_pic_checked_at TIMESTAMPTZ`);
  // Atribuição: dados do clique no anúncio (referral do webhook oficial). Primeiro toque --
  // um contato que volta por outro anúncio continua atribuído ao primeiro.
  await query(`ALTER TABLE whatsapp_contacts ADD COLUMN IF NOT EXISTS ad_source_url TEXT`);
  await query(`ALTER TABLE whatsapp_contacts ADD COLUMN IF NOT EXISTS ad_referral_json JSONB`);
  await query(`ALTER TABLE whatsapp_contacts ADD COLUMN IF NOT EXISTS tracking_method TEXT`);
  // Tiques do WhatsApp nas mensagens enviadas (pending/sent/delivered/read/failed) e a
  // última vez que a equipe abriu a conversa (base da contagem de não lidas).
  await query(`ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS status TEXT`);
  await query(`ALTER TABLE whatsapp_contacts ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMPTZ`);
  // ad_id -> conta/campanha/conjunto/anúncio, resolvido uma vez pela Marketing API e
  // reaproveitado por todos os contatos vindos do mesmo anúncio.
  await query(`
    CREATE TABLE IF NOT EXISTS meta_ad_cache (
      ad_id TEXT PRIMARY KEY,
      ad_name TEXT,
      adset_id TEXT,
      adset_name TEXT,
      campaign_id TEXT,
      campaign_name TEXT,
      account_id TEXT,
      account_name TEXT,
      fetched_at TIMESTAMPTZ NOT NULL
    )
  `);
  // CRM estilo Kommo (ver services/crmStages.js): etapas, equipe e tags por cliente.
  await query(`
    CREATE TABLE IF NOT EXISTS crm_stages (
      id SERIAL PRIMARY KEY,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#6366f1',
      position INTEGER NOT NULL DEFAULT 0,
      auto_event TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS crm_team_members (
      id SERIAL PRIMARY KEY,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS crm_tags (
      id SERIAL PRIMARY KEY,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#6366f1',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS whatsapp_contact_tags (
      contact_id INTEGER NOT NULL REFERENCES whatsapp_contacts(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES crm_tags(id) ON DELETE CASCADE,
      PRIMARY KEY (contact_id, tag_id)
    )
  `);
  await query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS crm_seeded_at TIMESTAMPTZ`);

  // Na Mesa (fila de espera) -- ver docs/superpowers/specs/2026-10-15-namesa-fila-design.md
  await query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS dashboard_enabled BOOLEAN DEFAULT true`);
  await query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS waitlist_enabled BOOLEAN DEFAULT false`);
  // Data a partir da qual as métricas de anúncio do cliente contam (antes disso era outro gestor).
  await query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS data_start_date DATE`);
  // Login de grupo: um usuário 'client' que enxerga vários restaurantes do mesmo dono.
  await query(`
    CREATE TABLE IF NOT EXISTS user_clients (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, client_id)
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS waitlist_settings (
      client_id INTEGER PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
      whatsapp_number TEXT,
      default_minutes_per_party INTEGER DEFAULT 8,
      hold_minutes INTEGER DEFAULT 10,
      near_threshold INTEGER DEFAULT 2,
      notify_no_show BOOLEAN DEFAULT true,
      messages JSONB DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS waitlist_entries (
      id SERIAL PRIMARY KEY,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      contact_id INTEGER REFERENCES whatsapp_contacts(id) ON DELETE SET NULL,
      name TEXT,
      phone TEXT,
      party_size INTEGER,
      status TEXT NOT NULL CHECK (status IN ('awaiting_size','waiting','called','seated','no_show','left','removed')),
      source TEXT NOT NULL CHECK (source IN ('whatsapp','manual')),
      size_attempts INTEGER DEFAULT 0,
      needs_check BOOLEAN DEFAULT false,
      notified_near BOOLEAN DEFAULT false,
      joined_at TIMESTAMPTZ DEFAULT now(),
      called_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_waitlist_active ON waitlist_entries (client_id, status, joined_at)`);
  // Um registro ativo por telefone: duas mensagens "FILA" quase juntas não viram duas entradas.
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_waitlist_active_phone ON waitlist_entries (client_id, phone)
    WHERE phone IS NOT NULL AND status IN ('awaiting_size', 'waiting', 'called')
  `);
  await query(`ALTER TABLE whatsapp_contacts ADD COLUMN IF NOT EXISTS stage_id INTEGER REFERENCES crm_stages(id) ON DELETE SET NULL`);
  await query(`ALTER TABLE whatsapp_contacts ADD COLUMN IF NOT EXISTS deal_value NUMERIC(12,2)`);
  await query(`ALTER TABLE whatsapp_contacts ADD COLUMN IF NOT EXISTS responsible_id INTEGER REFERENCES crm_team_members(id) ON DELETE SET NULL`);
  // Link Rastreável (services/trackingLink.js): cada link gera um clique com código curto,
  // que volta na primeira mensagem do lead e liga a conversa ao clique.
  await query(`
    CREATE TABLE IF NOT EXISTS tracking_links (
      id SERIAL PRIMARY KEY,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      phone TEXT NOT NULL,
      message TEXT,
      utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, utm_content TEXT, utm_term TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS tracking_clicks (
      id SERIAL PRIMARY KEY,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      link_id INTEGER NOT NULL REFERENCES tracking_links(id) ON DELETE CASCADE,
      code TEXT NOT NULL UNIQUE,
      utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, utm_content TEXT, utm_term TEXT,
      fbclid TEXT, gclid TEXT, user_agent TEXT, referrer TEXT,
      contact_id INTEGER REFERENCES whatsapp_contacts(id) ON DELETE SET NULL,
      matched_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await query(`ALTER TABLE whatsapp_contacts ADD COLUMN IF NOT EXISTS tracking_click_id INTEGER REFERENCES tracking_clicks(id) ON DELETE SET NULL`);
  // Meta Conversions API (services/conversionEvents.js): pixel por cliente, evento por
  // etapa do funil, e o registro de tudo que foi enviado.
  await query(`ALTER TABLE crm_stages ADD COLUMN IF NOT EXISTS meta_event TEXT`);
  await query(`
    CREATE TABLE IF NOT EXISTS capi_settings (
      client_id INTEGER PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
      pixel_id TEXT,
      test_event_code TEXT,
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS conversion_events (
      id SERIAL PRIMARY KEY,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      contact_id INTEGER REFERENCES whatsapp_contacts(id) ON DELETE SET NULL,
      platform TEXT NOT NULL DEFAULT 'meta',
      event_name TEXT NOT NULL,
      event_id TEXT NOT NULL UNIQUE,
      action_source TEXT,
      value NUMERIC(12,2),
      status TEXT NOT NULL DEFAULT 'pending',
      error TEXT,
      test_mode BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Reservas pelo WhatsApp (services/reservationStore.js, reservationBot.js).
  await query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS reservations_enabled BOOLEAN DEFAULT false`);
  // Robô pausado nesse contato até essa hora: um atendente respondeu (services/botPause.js).
  await query(`ALTER TABLE whatsapp_contacts ADD COLUMN IF NOT EXISTS bot_paused_until TIMESTAMPTZ`);
  // Quem enviou a mensagem de saída: 'staff' (Caixa) ou o robô ('bot_reserva').
  await query(`ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS sent_by TEXT`);
  // Número de WhatsApp que só roda em anúncio: contato novo sem o cartão do anúncio conta
  // como Meta Ads, sem campanha (tracking_method 'ads_number').
  await query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS whatsapp_ads_only BOOLEAN DEFAULT false`);
  // Cartão (externalAdReply) que veio na primeira mensagem mas não parece anúncio.
  await query(`ALTER TABLE whatsapp_contacts ADD COLUMN IF NOT EXISTS ad_reply_unmatched_json JSONB`);
  // Respostas automáticas já mandadas (services/infoBot.js): o mesmo assunto não se repete
  // pro mesmo contato em 12h.
  await query(`
    CREATE TABLE IF NOT EXISTS info_replies (
      id SERIAL PRIMARY KEY,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      contact_id INTEGER NOT NULL REFERENCES whatsapp_contacts(id) ON DELETE CASCADE,
      topic TEXT NOT NULL,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_info_replies_contact ON info_replies (contact_id, sent_at)`);
  await query(`
    CREATE TABLE IF NOT EXISTS reservation_settings (
      client_id INTEGER PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
      config JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS reservations (
      id SERIAL PRIMARY KEY,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      contact_id INTEGER REFERENCES whatsapp_contacts(id) ON DELETE SET NULL,
      name TEXT,
      phone TEXT,
      party_size INTEGER NOT NULL,
      table_seats INTEGER NOT NULL,
      starts_at TIMESTAMPTZ NOT NULL,
      ends_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('confirmed','cancelled','arrived','no_show')),
      source TEXT NOT NULL CHECK (source IN ('whatsapp','manual')),
      over_limit BOOLEAN DEFAULT false,
      cancelled_by TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_reservations_client_start ON reservations (client_id, starts_at)`);
  // Conversa do robô em andamento (passo, respostas já dadas). Uma ativa por contato.
  await query(`
    CREATE TABLE IF NOT EXISTS reservation_conversations (
      id SERIAL PRIMARY KEY,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      contact_id INTEGER NOT NULL REFERENCES whatsapp_contacts(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK (status IN ('active','done','handed_off','expired')),
      step TEXT,
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      attempts INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `);
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_reservation_conversation_active ON reservation_conversations (client_id, contact_id)
    WHERE status = 'active'
  `);

  // Ponte entre processos do servidor (services/processRelay.js): o Hostinger às vezes roda
  // dois processos, e só o dono da sessão do WhatsApp consegue enviar.
  await query(`
    CREATE TABLE IF NOT EXISTS baileys_relay (
      id SERIAL PRIMARY KEY,
      client_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','done','error','expired')),
      result JSONB,
      error TEXT,
      error_user_facing BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT now(),
      done_at TIMESTAMPTZ
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_baileys_relay_pending ON baileys_relay (id) WHERE status = 'pending'`);
  await query(`
    CREATE TABLE IF NOT EXISTS baileys_status (
      client_id TEXT PRIMARY KEY,
      status TEXT,
      qr_data_url TEXT,
      last_disconnect JSONB,
      instance_id TEXT,
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `);
  // Sincronização de campanhas em segundo plano (campaignController.syncCampaigns).
  await query(`
    CREATE TABLE IF NOT EXISTS sync_jobs (
      id SERIAL PRIMARY KEY,
      scope TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('running','done','error')),
      message TEXT,
      results JSONB,
      started_at TIMESTAMPTZ DEFAULT now(),
      finished_at TIMESTAMPTZ
    )
  `);

  // Notificações push dos apps instalados (services/pushNotify.js).
  await query(`
    CREATE TABLE IF NOT EXISTS push_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      public_key TEXT NOT NULL,
      private_key TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id SERIAL PRIMARY KEY,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      app TEXT NOT NULL CHECK (app IN ('caixa','namesa')),
      endpoint TEXT NOT NULL,
      keys JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE (endpoint, app)
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS sse_relay (
      id BIGSERIAL PRIMARY KEY,
      client_id TEXT NOT NULL,
      event_name TEXT NOT NULL,
      data JSONB,
      origin TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    )
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
  const adminPass = bcrypt.hashSync('@210722Df', salt);
  const clientPass = bcrypt.hashSync('cliente123', salt);

  const insertUser = (name, email, hash, role, clientId) =>
    query('INSERT INTO users (name, email, password_hash, role, client_id) VALUES (?, ?, ?, ?, ?)', [name, email, hash, role, clientId]);

  await insertUser('Gestor Agência Further', 'furthericgh@gmail.com', adminPass, 'admin', null);
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
