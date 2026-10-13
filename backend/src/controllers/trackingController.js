import db from '../config/db.js';
import {
  generateCode, buildTrackedMessage, buildWaMeUrl, slugify, collectClickParams,
  isPreviewBot, normalizePhone
} from '../services/trackingLink.js';
import { sendCapiEvent, buildCapiEvent } from '../services/metaCapi.js';

function resolveClientId(req) {
  return req.user.role === 'admin'
    ? (req.query.clientId || req.body.clientId || req.user.clientId)
    : req.user.clientId;
}

function withClient(handler, errorMessage) {
  return async (req, res) => {
    try {
      const clientId = resolveClientId(req);
      if (!clientId) return res.status(400).json({ error: 'ID do cliente é obrigatório.' });
      return await handler(req, res, clientId);
    } catch (error) {
      console.error(`${errorMessage}:`, error);
      return res.status(500).json({ error: `${errorMessage}.` });
    }
  };
}

const UTM_FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

// ---- Redirecionamento público: furtherads.online/r/<slug> ----

function notFoundPage(res) {
  return res.status(404).type('html').send('<!doctype html><meta charset="utf-8"><title>Link não encontrado</title><p style="font-family:sans-serif">Link não encontrado.</p>');
}

export async function redirectTrackingLink(req, res) {
  try {
    const { rows } = await db.query(`SELECT * FROM tracking_links WHERE slug = ?`, [req.params.slug]);
    const link = rows[0];
    if (!link) return notFoundPage(res);

    const userAgent = req.get('user-agent') || '';
    // Robô de prévia (o próprio WhatsApp/Facebook abrindo o link pra mostrar o cartão):
    // manda pro WhatsApp sem código e sem gravar clique.
    if (isPreviewBot(userAgent)) {
      return res.redirect(302, buildWaMeUrl(link.phone, link.message || ''));
    }

    const params = collectClickParams(req.query, link);
    let code = null;
    for (let attempt = 0; attempt < 5 && !code; attempt++) {
      const candidate = generateCode();
      const { rows: inserted } = await db.query(
        `INSERT INTO tracking_clicks (client_id, link_id, code, utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid, gclid, user_agent, referrer)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (code) DO NOTHING
         RETURNING code`,
        [link.client_id, link.id, candidate, params.utm_source, params.utm_medium, params.utm_campaign, params.utm_content,
          params.utm_term, params.fbclid, params.gclid, userAgent.slice(0, 300), (req.get('referer') || '').slice(0, 300) || null]
      );
      code = inserted[0]?.code || null;
    }
    if (!code) return res.redirect(302, buildWaMeUrl(link.phone, link.message || ''));

    res.set('Cache-Control', 'no-store');
    return res.redirect(302, buildWaMeUrl(link.phone, buildTrackedMessage(link.message, code)));
  } catch (error) {
    console.error('Tracking redirect error:', error);
    return res.status(500).type('html').send('<!doctype html><meta charset="utf-8"><p style="font-family:sans-serif">Erro ao abrir o link. Tente de novo.</p>');
  }
}

// ---- Links ----

export const listLinks = withClient(async (_req, res, clientId) => {
  const { rows } = await db.query(
    `SELECT l.*,
       (SELECT COUNT(*) FROM tracking_clicks c WHERE c.link_id = l.id)::int AS clicks,
       (SELECT COUNT(*) FROM tracking_clicks c WHERE c.link_id = l.id AND c.contact_id IS NOT NULL)::int AS conversations
     FROM tracking_links l WHERE l.client_id = ? ORDER BY l.created_at DESC`,
    [clientId]
  );
  const { rows: settings } = await db.query(`SELECT display_phone_number FROM whatsapp_settings WHERE client_id = ?`, [clientId]);
  return res.json({ links: rows, defaultPhone: settings[0]?.display_phone_number || '' });
}, 'Erro ao listar links');

function linkFields(body) {
  const fields = {};
  if (body.name !== undefined) fields.name = String(body.name).trim().slice(0, 80);
  if (body.phone !== undefined) fields.phone = normalizePhone(body.phone);
  if (body.message !== undefined) fields.message = String(body.message || '').trim().slice(0, 500) || null;
  for (const key of UTM_FIELDS) {
    if (body[key] !== undefined) fields[key] = String(body[key] || '').trim().slice(0, 200) || null;
  }
  return fields;
}

export const createLink = withClient(async (req, res, clientId) => {
  const fields = linkFields(req.body);
  if (!fields.name) return res.status(400).json({ error: 'Dê um nome pro link.' });
  if (!fields.phone || fields.phone.length < 10) return res.status(400).json({ error: 'Número de WhatsApp inválido (com DDI e DDD, ex: 5511999998888).' });

  const base = slugify(req.body.slug || fields.name) || 'link';
  // Slug é global (a URL não diz o cliente): se já existe, acrescenta um sufixo.
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${generateCode().toLowerCase().slice(0, 3)}`;
    const { rows } = await db.query(
      `INSERT INTO tracking_links (client_id, name, slug, phone, message, utm_source, utm_medium, utm_campaign, utm_content, utm_term)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (slug) DO NOTHING
       RETURNING id, slug`,
      [clientId, fields.name, slug, fields.phone, fields.message ?? null, ...UTM_FIELDS.map((k) => fields[k] ?? null)]
    );
    if (rows.length > 0) return res.status(201).json(rows[0]);
  }
  return res.status(409).json({ error: 'Não consegui gerar um endereço livre pra esse link. Tente outro nome.' });
}, 'Erro ao criar link');

export const updateLink = withClient(async (req, res, clientId) => {
  const fields = linkFields(req.body);
  if (fields.name === '') return res.status(400).json({ error: 'Nome inválido.' });
  if (fields.phone !== undefined && fields.phone.length < 10) return res.status(400).json({ error: 'Número de WhatsApp inválido.' });
  const keys = Object.keys(fields);
  if (keys.length === 0) return res.status(400).json({ error: 'Nada pra atualizar.' });
  const { rows } = await db.query(
    `UPDATE tracking_links SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ? AND client_id = ? RETURNING id`,
    [...keys.map((k) => fields[k]), req.params.id, clientId]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Link não encontrado.' });
  return res.json({ message: 'Link atualizado.' });
}, 'Erro ao atualizar link');

export const deleteLink = withClient(async (req, res, clientId) => {
  const { rows } = await db.query(`DELETE FROM tracking_links WHERE id = ? AND client_id = ? RETURNING id`, [req.params.id, clientId]);
  if (rows.length === 0) return res.status(404).json({ error: 'Link não encontrado.' });
  return res.json({ message: 'Link removido.' });
}, 'Erro ao remover link');

// ---- Meta Conversions API ----

export const getCapiSettings = withClient(async (_req, res, clientId) => {
  const { rows } = await db.query(`SELECT pixel_id, test_event_code, enabled FROM capi_settings WHERE client_id = ?`, [clientId]);
  const { rows: cred } = await db.query(`SELECT config_json FROM credentials WHERE client_id = ? AND platform = 'meta'`, [clientId]);
  let hasMetaToken = false;
  try {
    hasMetaToken = Boolean(JSON.parse(cred[0]?.config_json || '{}').access_token);
  } catch {
    hasMetaToken = false;
  }
  return res.json({ pixelId: rows[0]?.pixel_id || '', testEventCode: rows[0]?.test_event_code || '', enabled: Boolean(rows[0]?.enabled), hasMetaToken });
}, 'Erro ao carregar a configuração da Meta');

export const saveCapiSettings = withClient(async (req, res, clientId) => {
  const pixelId = String(req.body.pixelId || '').replace(/\D/g, '');
  const testEventCode = String(req.body.testEventCode || '').trim().slice(0, 50) || null;
  const enabled = Boolean(req.body.enabled);
  if (enabled && !pixelId) return res.status(400).json({ error: 'Informe o ID do Pixel (conjunto de dados) pra ativar.' });
  await db.query(
    `INSERT INTO capi_settings (client_id, pixel_id, test_event_code, enabled, updated_at)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT (client_id) DO UPDATE SET pixel_id = excluded.pixel_id, test_event_code = excluded.test_event_code,
       enabled = excluded.enabled, updated_at = CURRENT_TIMESTAMP`,
    [clientId, pixelId || null, testEventCode, enabled]
  );
  return res.json({ message: 'Configuração salva.' });
}, 'Erro ao salvar a configuração da Meta');

// Manda um evento de teste (com o código de teste) pra conferir pixel e token na aba
// "Eventos de teste" do Gerenciador de Eventos. Não entra no registro de disparos.
export const sendCapiTest = withClient(async (_req, res, clientId) => {
  const { rows } = await db.query(`SELECT pixel_id, test_event_code FROM capi_settings WHERE client_id = ?`, [clientId]);
  const settings = rows[0];
  if (!settings?.pixel_id) return res.status(400).json({ error: 'Salve o ID do Pixel primeiro.' });
  if (!settings.test_event_code) return res.status(400).json({ error: 'Preencha o código de teste (Gerenciador de Eventos → Eventos de teste) pra não misturar com eventos reais.' });
  const { rows: cred } = await db.query(`SELECT config_json FROM credentials WHERE client_id = ? AND platform = 'meta'`, [clientId]);
  let accessToken = null;
  try {
    accessToken = JSON.parse(cred[0]?.config_json || '{}').access_token || null;
  } catch {
    accessToken = null;
  }
  if (!accessToken) return res.status(400).json({ error: 'Este cliente não tem token da Meta nas credenciais.' });

  const event = buildCapiEvent({
    eventName: 'Lead',
    eventId: `test-${Date.now()}`,
    eventTime: new Date(),
    contact: { id: 0, wa_id: '5500000000000' },
    clientId
  });
  try {
    const result = await sendCapiEvent({ pixelId: settings.pixel_id, accessToken, event, testEventCode: settings.test_event_code });
    return res.json({ message: `Evento de teste enviado (${result.events_received ?? 1} recebido). Confira em "Eventos de teste" no Gerenciador de Eventos.` });
  } catch (error) {
    return res.status(400).json({ error: `A Meta recusou: ${error.message}` });
  }
}, 'Erro ao enviar evento de teste');

export const listConversionEvents = withClient(async (_req, res, clientId) => {
  const { rows } = await db.query(
    `SELECT e.id, e.event_name, e.action_source, e.value, e.status, e.error, e.test_mode, e.created_at,
       wc.profile_name, wc.wa_id
     FROM conversion_events e
     LEFT JOIN whatsapp_contacts wc ON wc.id = e.contact_id
     WHERE e.client_id = ?
     ORDER BY e.created_at DESC LIMIT 100`,
    [clientId]
  );
  return res.json({ events: rows });
}, 'Erro ao listar disparos');
