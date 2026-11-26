import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveMedia, loadMedia, deleteMedia, offloadDbMedia, storageConfig } from './mediaStore.js';

const CFG = { url: 'https://proj.supabase.co', key: 'sb_secret_x', bucket: 'whatsapp-media' };

function fakeDb(rowsFor = () => []) {
  const calls = [];
  let seq = 0;
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      if (/^\s*INSERT INTO whatsapp_media/.test(sql)) return { rows: [{ id: 40 + (++seq) }] };
      return { rows: rowsFor(sql, params) };
    },
  };
}

function fakeFetch(status = 200, body = Buffer.from('BYTES')) {
  const calls = [];
  const fn = async (url, opts = {}) => {
    calls.push({ url, ...opts });
    return { ok: status < 300, status, arrayBuffer: async () => body, text: async () => 'erro' };
  };
  fn.calls = calls;
  return fn;
}

test('sem configuração de Storage, grava os bytes no banco como antes', async () => {
  const db = fakeDb();
  const fetch = fakeFetch();
  const id = await saveMedia(db, { clientId: 7, contactId: 3, mimeType: 'image/jpeg', data: Buffer.from('abc') }, { config: null, fetch });
  assert.equal(id, 41);
  assert.equal(fetch.calls.length, 0);
  assert.ok(Buffer.isBuffer(db.calls[0].params[3]));
});

test('com Storage, o arquivo sobe pro bucket e o banco guarda só o caminho', async () => {
  const db = fakeDb();
  const fetch = fakeFetch();
  const id = await saveMedia(db, { clientId: 7, contactId: 3, mimeType: 'image/jpeg', data: Buffer.from('abc') }, { config: CFG, fetch });
  assert.equal(id, 41);
  assert.equal(db.calls[0].params[3], null, 'bytes não vão pro banco');
  assert.equal(fetch.calls[0].method, 'POST');
  assert.equal(fetch.calls[0].url, 'https://proj.supabase.co/storage/v1/object/whatsapp-media/7/41');
  assert.equal(fetch.calls[0].headers.apikey, 'sb_secret_x');
  const upd = db.calls.find((c) => /storage_path/.test(c.sql) && /UPDATE/.test(c.sql));
  assert.deepEqual(upd.params, ['7/41', 41]);
});

test('se o upload falhar, cai pro banco e não perde o arquivo', async () => {
  const db = fakeDb();
  const fetch = fakeFetch(500);
  await saveMedia(db, { clientId: 7, contactId: 3, mimeType: 'image/jpeg', data: Buffer.from('abc') }, { config: CFG, fetch, log: () => {} });
  const upd = db.calls.find((c) => /UPDATE whatsapp_media SET data/.test(c.sql));
  assert.ok(upd, 'gravou os bytes no banco');
  assert.ok(Buffer.isBuffer(upd.params[0]));
});

test('leitura: do banco quando tem bytes, do Storage quando tem caminho', async () => {
  const fetch = fakeFetch(200, Buffer.from('DO-STORAGE'));
  const dbBytes = fakeDb(() => [{ mime_type: 'image/png', data: Buffer.from('DO-BANCO'), storage_path: null }]);
  const a = await loadMedia(dbBytes, 5, 7, { config: CFG, fetch });
  assert.equal(a.data.toString(), 'DO-BANCO');
  assert.equal(fetch.calls.length, 0);

  const dbPath = fakeDb(() => [{ mime_type: 'image/png', data: null, storage_path: '7/5' }]);
  const b = await loadMedia(dbPath, 5, 7, { config: CFG, fetch });
  assert.equal(b.data.toString(), 'DO-STORAGE');
  assert.equal(fetch.calls[0].url, 'https://proj.supabase.co/storage/v1/object/whatsapp-media/7/5');

  const dbNone = fakeDb(() => []);
  assert.equal(await loadMedia(dbNone, 5, 7, { config: CFG, fetch }), null);
});

test('apagar remove a linha e o arquivo do bucket', async () => {
  const db = fakeDb((sql) => (/DELETE FROM whatsapp_media/.test(sql) ? [{ storage_path: '7/5' }, { storage_path: null }] : []));
  const fetch = fakeFetch();
  const n = await deleteMedia(db, [5, 6], { config: CFG, fetch });
  assert.equal(n, 2);
  assert.equal(fetch.calls[0].method, 'DELETE');
  assert.equal(fetch.calls[0].url, 'https://proj.supabase.co/storage/v1/object/whatsapp-media');
  assert.deepEqual(JSON.parse(fetch.calls[0].body), { prefixes: ['7/5'] });
});

test('offload move pro Storage o que ainda está no banco', async () => {
  let served = false;
  const db = fakeDb((sql) => {
    if (/SELECT id, client_id, mime_type, data FROM whatsapp_media/.test(sql) && !served) {
      served = true;
      return [{ id: 9, client_id: 7, mime_type: 'image/jpeg', data: Buffer.from('x') }];
    }
    if (/UPDATE whatsapp_media SET storage_path/.test(sql)) return [{ id: 9 }];
    return [];
  });
  const fetch = fakeFetch();
  const n = await offloadDbMedia(db, { config: CFG, fetch });
  assert.equal(n, 1);
  const upd = db.calls.find((c) => /UPDATE whatsapp_media SET storage_path/.test(c.sql));
  assert.match(upd.sql, /data = NULL/);
  assert.deepEqual(upd.params, ['7/9', 9]);
});

test('offload não faz nada sem Storage configurado', async () => {
  const db = fakeDb();
  assert.equal(await offloadDbMedia(db, { config: null, fetch: fakeFetch() }), 0);
  assert.equal(db.calls.length, 0);
});

test('configuração vem do ambiente', () => {
  assert.equal(storageConfig({}), null);
  assert.deepEqual(storageConfig({ SUPABASE_URL: 'https://p.supabase.co/', SUPABASE_SERVICE_KEY: 'k' }),
    { url: 'https://p.supabase.co', key: 'k', bucket: 'whatsapp-media' });
});
