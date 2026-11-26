// Onde mora o arquivo da mídia do WhatsApp (foto, áudio, PDF, foto de perfil).
//
// Desde 25/11/2026 o arquivo vai pro Supabase Storage (bucket privado) e o banco guarda só
// o caminho em whatsapp_media.storage_path. Os bytes no Postgres encheram o disco do plano
// grátis duas vezes (20/11 e 24/11). Sem SUPABASE_URL/SUPABASE_SERVICE_KEY no ambiente,
// ou se o upload falhar, o arquivo continua indo pro banco (coluna data), como antes.
//
// A regra das 24h não mudou: mediaRetention.js apaga a linha e, por aqui, o arquivo do bucket.

const DEFAULT_BUCKET = 'whatsapp-media';

export function storageConfig(env = process.env) {
  const url = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = env.SUPABASE_SERVICE_KEY || '';
  if (!url || !key) return null;
  return { url, key, bucket: env.MEDIA_BUCKET || DEFAULT_BUCKET };
}

function headers(cfg, extra = {}) {
  // Chave nova (sb_secret_...) vai só no apikey; a antiga (JWT) também no Authorization.
  const h = { apikey: cfg.key, ...extra };
  if (cfg.key.startsWith('eyJ')) h.Authorization = `Bearer ${cfg.key}`;
  return h;
}

const objectUrl = (cfg, path) => `${cfg.url}/storage/v1/object/${cfg.bucket}/${path}`;

function resolve(deps) {
  return {
    cfg: deps.config === undefined ? storageConfig() : deps.config,
    fetch: deps.fetch || globalThis.fetch,
    log: deps.log || console.error,
  };
}

async function upload({ cfg, fetch }, path, data, mimeType) {
  const res = await fetch(objectUrl(cfg, path), {
    method: 'POST',
    headers: headers(cfg, { 'Content-Type': mimeType || 'application/octet-stream', 'x-upsert': 'true' }),
    body: data,
  });
  if (!res.ok) throw new Error(`Storage ${res.status}: ${await res.text().catch(() => '')}`);
}

// Grava a mídia e devolve o id de whatsapp_media.
export async function saveMedia(dbImpl, { clientId, contactId, mimeType, data }, deps = {}) {
  const ctx = resolve(deps);
  const mime = mimeType || 'application/octet-stream';
  const { rows } = await dbImpl.query(
    `INSERT INTO whatsapp_media (client_id, contact_id, mime_type, data, size_bytes)
     VALUES (?, ?, ?, ?, ?)
     RETURNING id`,
    [clientId, contactId, mime, ctx.cfg ? null : data, data.length]
  );
  const id = rows[0].id;
  if (!ctx.cfg) return id;

  const path = `${clientId}/${id}`;
  try {
    await upload(ctx, path, data, mime);
    await dbImpl.query(`UPDATE whatsapp_media SET storage_path = ? WHERE id = ?`, [path, id]);
  } catch (error) {
    ctx.log(`Mídia ${id}: Storage falhou, gravando no banco:`, error.message);
    await dbImpl.query(`UPDATE whatsapp_media SET data = ? WHERE id = ?`, [data, id]);
  }
  return id;
}

// { mime_type, size_bytes, data: Buffer } ou null se não existe (ou já foi apagada).
export async function loadMedia(dbImpl, mediaId, clientId, deps = {}) {
  const ctx = resolve(deps);
  const { rows } = await dbImpl.query(
    `SELECT mime_type, size_bytes, data, storage_path FROM whatsapp_media WHERE id = ? AND client_id = ?`,
    [mediaId, clientId]
  );
  const row = rows[0];
  if (!row) return null;
  if (row.data) return { mime_type: row.mime_type, size_bytes: row.size_bytes, data: Buffer.from(row.data) };
  if (!row.storage_path || !ctx.cfg) return null;

  const res = await ctx.fetch(objectUrl(ctx.cfg, row.storage_path), { headers: headers(ctx.cfg) });
  if (!res.ok) {
    ctx.log(`Mídia ${mediaId}: Storage respondeu ${res.status}`);
    return null;
  }
  return { mime_type: row.mime_type, size_bytes: row.size_bytes, data: Buffer.from(await res.arrayBuffer()) };
}

async function removeObjects(ctx, paths) {
  if (!ctx.cfg || paths.length === 0) return;
  try {
    const res = await ctx.fetch(`${ctx.cfg.url}/storage/v1/object/${ctx.cfg.bucket}`, {
      method: 'DELETE',
      headers: headers(ctx.cfg, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ prefixes: paths }),
    });
    if (!res.ok) ctx.log(`Storage: falha ao apagar ${paths.length} arquivo(s): ${res.status}`);
  } catch (error) {
    ctx.log('Storage: falha ao apagar arquivos:', error.message);
  }
}

// Apaga as linhas e os arquivos do bucket. Devolve quantas linhas saíram.
export async function deleteMedia(dbImpl, ids, deps = {}) {
  if (!ids || ids.length === 0) return 0;
  const ctx = resolve(deps);
  const { rows } = await dbImpl.query(
    `DELETE FROM whatsapp_media WHERE id = ANY(?) RETURNING storage_path`,
    [ids]
  );
  await removeObjects(ctx, rows.map((r) => r.storage_path).filter(Boolean));
  return rows.length;
}

// Move pro Storage os arquivos que ainda estão no banco (os de antes desta mudança e os
// que caíram no fallback). Roda junto com a limpeza de hora em hora.
export async function offloadDbMedia(dbImpl, deps = {}) {
  const ctx = resolve(deps);
  if (!ctx.cfg) return 0;
  let moved = 0;
  for (;;) {
    const { rows } = await dbImpl.query(
      `SELECT id, client_id, mime_type, data FROM whatsapp_media WHERE data IS NOT NULL ORDER BY id LIMIT 20`,
      []
    );
    if (rows.length === 0) return moved;
    let progressed = false;
    for (const row of rows) {
      const path = `${row.client_id}/${row.id}`;
      try {
        await upload(ctx, path, Buffer.from(row.data), row.mime_type);
        const { rows: upd } = await dbImpl.query(
          `UPDATE whatsapp_media SET storage_path = ?, data = NULL WHERE id = ? AND data IS NOT NULL RETURNING id`,
          [path, row.id]
        );
        moved += upd.length;
        progressed = true;
      } catch (error) {
        ctx.log(`Mídia ${row.id}: não subiu pro Storage:`, error.message);
      }
    }
    if (!progressed) return moved;
  }
}
