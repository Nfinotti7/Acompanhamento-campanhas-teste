// Conexao "nao-oficial" via WhatsApp Web (Baileys), alternativa temporaria a Cloud API
// oficial da Meta pra clientes com connection_type = 'baileys'. Mantem uma sessao
// por client_id dentro do MESMO processo Node que ja roda o Express -- sem worker
// separado. Sessao fica salva em disco (fora do git) em .baileys_sessions/<clientId>,
// entao sobrevive a reinicios do processo desde que a pasta nao seja apagada.
//
// Risco operacional (avisado ao usuario): se a hospedagem apagar o diretorio do
// projeto a cada deploy, a sessao se perde e precisa escanear o QR code de novo.
// So funciona com UMA instancia do backend rodando por vez -- duas instancias
// tentando abrir a mesma sessao ao mesmo tempo quebram a conexao.
import path from 'node:path';
import QRCode from 'qrcode';
import db from '../config/db.js';
import { ingestWhatsAppEvent } from './whatsappIngest.js';
import { mapBaileysMessageToEvent, isUsableMessage } from './baileysMapper.js';

const SESSIONS_DIR = path.resolve(process.cwd(), '.baileys_sessions');

// Tempo maximo que um socket pode ficar parado em 'connecting' (sem abrir, sem pedir QR,
// sem fechar) antes de ser considerado travado e descartado pra tentar de novo do zero.
// Acontece quando o handshake com o WhatsApp trava sem nunca disparar connection.update.
const STALE_CONNECTING_MS = 30000;

// clientId -> { sock, status: 'connecting'|'qr'|'connected'|'disconnected', qrDataUrl, connectingSince }
const connections = new Map();

// clientId chega como number quando vem do banco (ex: reconexao automatica na subida,
// que le client_id direto do Postgres) e como string quando vem de query string ou
// corpo de requisicao (ex: getBaileysStatus, replyToConversation). Sem normalizar,
// "9" e 9 viram DUAS entradas diferentes nesse Map -- a reconexao automatica abre um
// socket fantasma numa chave, o QR escaneado fica registrado na outra, e enviar
// mensagem olha pra entrada errada (mesma classe de bug ja corrigida em sseHub.js).
function normalizeClientId(clientId) {
  return String(clientId);
}

function getOrInitState(clientId) {
  const key = normalizeClientId(clientId);
  if (!connections.has(key)) {
    connections.set(key, { sock: null, status: 'disconnected', qrDataUrl: null, connectPromise: null, connectingSince: null });
  }
  return connections.get(key);
}

export async function connectClient(clientId, deps = {}) {
  const now = deps.now || Date.now;
  const state = getOrInitState(clientId);

  if (state.sock && state.status === 'connecting' && state.connectingSince && now() - state.connectingSince > STALE_CONNECTING_MS) {
    const staleSock = state.sock;
    state.sock = null;
    state.status = 'disconnected';
    state.connectingSince = null;
    try {
      await staleSock.end(new Error('Timeout: conexão Baileys presa em "connecting", descartando pra tentar de novo.'));
    } catch {
      // socket ja pode estar numa forma invalida -- so seguimos pra tentar de novo
    }
  }

  if (state.sock) return state; // ja conectando/conectado

  // Duas chamadas concorrentes (ex: reconexao automatica na subida + alguem abrindo a
  // pagina de Credenciais ao mesmo tempo) nao podem cada uma abrir o proprio socket --
  // isso faz duas conexoes tentarem autenticar com a MESMA sessao ao mesmo tempo, e o
  // WhatsApp derruba as duas. Quem chega depois so espera a tentativa que ja esta em
  // andamento, em vez de iniciar uma nova.
  if (state.connectPromise) {
    await state.connectPromise;
    return state;
  }

  state.connectPromise = doConnect(clientId, state, deps);
  try {
    await state.connectPromise;
  } finally {
    state.connectPromise = null;
  }
  return state;
}

async function doConnect(clientId, state, deps) {
  // Import dinamico: a lib so e necessaria quando alguem de fato usa o modo Baileys.
  const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = deps.baileys || await import('@whiskeysockets/baileys');

  const { state: authState, saveCreds } = await useMultiFileAuthState(path.join(SESSIONS_DIR, String(clientId)));
  const sock = makeWASocket({ auth: authState, printQRInTerminal: false });
  state.sock = sock;
  state.status = 'connecting';
  state.connectingSince = (deps.now || Date.now)();

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      state.status = 'qr';
      state.qrDataUrl = await QRCode.toDataURL(qr);
      state.connectingSince = null;
    }

    if (connection === 'open') {
      state.status = 'connected';
      state.qrDataUrl = null;
      state.connectingSince = null;
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      console.error(`Baileys close [client ${clientId}] statusCode=${statusCode} loggedOut=${loggedOut} message=${lastDisconnect?.error?.message}`);
      state.lastDisconnectReason = { statusCode, message: lastDisconnect?.error?.message, at: new Date().toISOString() };
      state.sock = null;
      state.status = 'disconnected';
      state.connectingSince = null;
      if (!loggedOut) {
        connectClient(clientId, deps); // reconecta sozinho em quedas que nao sejam logout
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      if (!isUsableMessage(msg)) continue;
      try {
        await ingestWhatsAppEvent(clientId, mapBaileysMessageToEvent(msg));
      } catch (error) {
        console.error('Baileys ingest error:', error);
      }
    }
  });

  return state;
}

// Reestabelece a conexao Baileys de todo cliente configurado como 'baileys' --
// sem isso, depois que o processo reinicia (deploy, crash, etc.) a conexao fica
// parada ate alguem abrir a pagina de Credenciais e disparar getBaileysStatus
// manualmente. Chamado uma vez na subida do servidor (server.js).
export async function reconnectAllBaileysClients(deps = {}) {
  const dbImpl = deps.db || db;
  const connect = deps.connect || connectClient;

  const { rows } = await dbImpl.query(
    `SELECT client_id FROM whatsapp_settings WHERE connection_type = 'baileys'`
  );

  for (const row of rows) {
    try {
      await connect(row.client_id, deps);
    } catch (error) {
      console.error(`Erro ao reconectar Baileys pro cliente ${row.client_id}:`, error);
    }
  }

  return rows.map((r) => r.client_id);
}

export function getConnectionState(clientId) {
  const state = connections.get(normalizeClientId(clientId));
  if (!state) return { status: 'disconnected', qrDataUrl: null };
  return { status: state.status, qrDataUrl: state.qrDataUrl, lastDisconnectReason: state.lastDisconnectReason };
}

export async function sendViaBaileys(clientId, waId, body) {
  const state = connections.get(normalizeClientId(clientId));
  if (!state?.sock || state.status !== 'connected') {
    throw new Error('Conexão WhatsApp (Baileys) não está ativa para este cliente.');
  }
  const jid = waId.includes('@') ? waId : `${waId}@s.whatsapp.net`;
  await state.sock.sendMessage(jid, { text: body });
}
