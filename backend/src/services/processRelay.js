// Ponte entre processos do servidor, pelo Postgres.
//
// O Hostinger às vezes roda DOIS processos do Node ao mesmo tempo e reparte as
// requisições entre eles (22/10: dois "rodando na porta 5000" com 48 ms de diferença).
// Só um processo pode ter a sessão do WhatsApp (o dono, ver owner.json em
// baileysClient.js). Sem esta ponte, toda requisição que caía no outro processo falhava
// com "Conexão WhatsApp não está ativa", e o Caixa ligado nele não recebia mensagem ao vivo.
//
// - Pedidos ao dono (enviar, reset, código de pareamento): quem não é dono grava em
//   baileys_relay e espera; o dono pega, executa e grava o resultado.
// - Status da conexão: o dono grava em baileys_status; os outros leem dali.
// - Eventos ao vivo (SSE): cada evento vai pra sse_relay; os outros processos repassam
//   pros Caixas conectados neles.
//
// Não dá pra usar LISTEN/NOTIFY: o DATABASE_URL é o pooler de transação do Supabase
// (porta 6543), que não mantém a sessão. Por isso é consulta periódica.
import db from '../config/db.js';
import { INSTANCE_ID } from './instance.js';

export class RelayError extends Error {
  constructor(message, { userFacing = false } = {}) {
    super(message);
    this.userFacing = userFacing;
  }
}

const REQUEST_POLL_MS = 300;
const REQUEST_TIMEOUT_MS = 25000;
// Pedido que ninguém pegou nesse tempo não é mais executado: quem pediu já desistiu e
// mostrou erro, e enviar depois faria a mensagem sair repetida quando a pessoa tentar de novo.
const PENDING_MAX_AGE_SECONDS = 20;
const STATUS_STALE_SECONDS = 60;

function defaults(deps) {
  return {
    db: deps.db || db,
    now: deps.now || Date.now,
    sleep: deps.sleep || ((ms) => new Promise((r) => setTimeout(r, ms))),
    instanceId: deps.instanceId || INSTANCE_ID
  };
}

// ---- Pedidos ao dono ----

export async function requestFromOwner(kind, clientId, payload = {}, deps = {}) {
  const { db: dbImpl, now, sleep } = defaults(deps);
  const timeoutMs = deps.timeoutMs || REQUEST_TIMEOUT_MS;
  const { rows } = await dbImpl.query(
    `INSERT INTO baileys_relay (client_id, kind, payload) VALUES (?, ?, ?) RETURNING id`,
    [String(clientId), kind, JSON.stringify(payload)]
  );
  const id = rows[0].id;
  const deadline = now() + timeoutMs;

  while (now() < deadline) {
    await sleep(deps.pollMs || REQUEST_POLL_MS);
    const { rows: found } = await dbImpl.query(
      `SELECT status, result, error, error_user_facing FROM baileys_relay WHERE id = ?`,
      [id]
    );
    const row = found[0];
    if (row?.status === 'done') return row.result || {};
    if (row?.status === 'error') throw new RelayError(row.error, { userFacing: row.error_user_facing });
  }

  const { rows: expired } = await dbImpl.query(
    `UPDATE baileys_relay SET status = 'expired' WHERE id = ? AND status = 'pending' RETURNING id`,
    [id]
  );
  if (expired.length) throw new RelayError('O servidor do WhatsApp não respondeu. Tente de novo em alguns segundos.');
  throw new RelayError('O WhatsApp demorou pra confirmar. Confira na conversa se a mensagem saiu antes de enviar de novo.');
}

// Roda no dono: pega os pedidos pendentes e executa um por vez, na ordem em que chegaram.
// handlers: { send, reset, pairing, connect } -> async (clientId, payload) => resultado.
export async function processRelayQueue(handlers, deps = {}) {
  const { db: dbImpl } = defaults(deps);
  const { rows } = await dbImpl.query(
    `UPDATE baileys_relay SET status = 'processing'
     WHERE id IN (
       SELECT id FROM baileys_relay
       WHERE status = 'pending' AND created_at > now() - make_interval(secs => ?)
       ORDER BY id LIMIT 20
       FOR UPDATE SKIP LOCKED
     )
     RETURNING id, client_id, kind, payload`,
    [PENDING_MAX_AGE_SECONDS]
  );
  rows.sort((a, b) => a.id - b.id);

  for (const row of rows) {
    const handler = handlers[row.kind];
    try {
      if (!handler) throw new Error(`Pedido desconhecido: ${row.kind}`);
      const result = await handler(row.client_id, row.payload || {});
      await dbImpl.query(
        `UPDATE baileys_relay SET status = 'done', result = ?, done_at = now() WHERE id = ?`,
        [JSON.stringify(result ?? {}), row.id]
      );
    } catch (error) {
      await dbImpl.query(
        `UPDATE baileys_relay SET status = 'error', error = ?, error_user_facing = ?, done_at = now() WHERE id = ?`,
        [error.message, Boolean(error.userFacing), row.id]
      );
    }
  }
  return rows.length;
}

// ---- Status da conexão ----

export async function publishStatus(clientId, state, deps = {}) {
  const { db: dbImpl, instanceId } = defaults(deps);
  await dbImpl.query(
    `INSERT INTO baileys_status (client_id, status, qr_data_url, last_disconnect, instance_id, updated_at)
     VALUES (?, ?, ?, ?, ?, now())
     ON CONFLICT (client_id) DO UPDATE SET status = excluded.status, qr_data_url = excluded.qr_data_url,
       last_disconnect = excluded.last_disconnect, instance_id = excluded.instance_id, updated_at = now()`,
    [String(clientId), state.status, state.qrDataUrl || null,
      state.lastDisconnectReason ? JSON.stringify(state.lastDisconnectReason) : null, instanceId]
  );
}

// null quando o dono não publicou nada recente (dono caiu, ou ainda subindo).
export async function readPublishedStatus(clientId, deps = {}) {
  const { db: dbImpl } = defaults(deps);
  const { rows } = await dbImpl.query(
    `SELECT status, qr_data_url, last_disconnect, instance_id
     FROM baileys_status
     WHERE client_id = ? AND updated_at > now() - make_interval(secs => ?)`,
    [String(clientId), STATUS_STALE_SECONDS]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    status: row.status,
    qrDataUrl: row.qr_data_url,
    lastDisconnectReason: row.last_disconnect || undefined,
    ownerInstance: row.instance_id
  };
}

// ---- Eventos ao vivo (SSE) ----

export async function relayEvent(clientId, eventName, data, deps = {}) {
  const { db: dbImpl, instanceId } = defaults(deps);
  await dbImpl.query(
    `INSERT INTO sse_relay (client_id, event_name, data, origin) VALUES (?, ?, ?, ?)`,
    [String(clientId), eventName, JSON.stringify(data ?? null), instanceId]
  );
}

// Lê os eventos gerados pelos OUTROS processos depois de afterId e entrega localmente.
// Devolve o último id visto (passar de volta na próxima chamada).
export async function pollRelayedEvents(afterId, deliver, deps = {}) {
  const { db: dbImpl, instanceId } = defaults(deps);
  if (afterId == null) {
    const { rows } = await dbImpl.query(`SELECT COALESCE(MAX(id), 0) AS id FROM sse_relay`);
    return Number(rows[0].id);
  }
  const { rows } = await dbImpl.query(
    `SELECT id, client_id, event_name, data FROM sse_relay WHERE id > ? AND origin <> ? ORDER BY id LIMIT 500`,
    [afterId, instanceId]
  );
  let last = afterId;
  for (const row of rows) {
    last = Number(row.id);
    try {
      deliver(row.client_id, row.event_name, row.data);
    } catch (error) {
      console.error('Erro ao repassar evento ao vivo:', error.message);
    }
  }
  return last;
}

export async function purgeRelayTables(deps = {}) {
  const { db: dbImpl } = defaults(deps);
  await dbImpl.query(`DELETE FROM baileys_relay WHERE created_at < now() - interval '1 hour'`);
  await dbImpl.query(`DELETE FROM sse_relay WHERE created_at < now() - interval '10 minutes'`);
}
