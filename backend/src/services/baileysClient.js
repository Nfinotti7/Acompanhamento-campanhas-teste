// Conexao "nao-oficial" via WhatsApp Web (Baileys), alternativa temporaria a Cloud API
// oficial da Meta pra clientes com connection_type = 'baileys'. Mantem uma sessao
// por client_id dentro do MESMO processo Node que ja roda o Express -- sem worker
// separado.
//
// A sessao fica na pasta HOME da conta, NAO dentro do projeto: o Hostinger sobe cada
// deploy numa pasta nova (.../hbuilds/versions/<id>/nodejs), entao uma sessao salva
// dentro do projeto sumia a cada deploy e obrigava escanear o QR de novo.
// BAILEYS_SESSIONS_DIR sobrescreve o local se precisar.
//
// So funciona com UMA instancia do backend rodando por vez -- duas instancias
// tentando abrir a mesma sessao ao mesmo tempo quebram a conexao.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import QRCode from 'qrcode';
import db from '../config/db.js';
import { ingestWhatsAppEvent } from './whatsappIngest.js';
import { mapBaileysMessageToEvent, isUsableMessage } from './baileysMapper.js';
import { refreshProfilePicture } from './profilePicture.js';
import { applyMessageStatus, baileysStatusToName } from './messageStatus.js';
import { resolveAd } from './metaAdResolver.js';

const SESSIONS_DIR = process.env.BAILEYS_SESSIONS_DIR || path.join(os.homedir(), '.further_baileys_sessions');

// Tempo maximo que um socket pode ficar parado em 'connecting' (sem abrir, sem pedir QR,
// sem fechar) antes de ser considerado travado e descartado pra tentar de novo do zero.
// Acontece quando o handshake com o WhatsApp trava sem nunca disparar connection.update.
const STALE_CONNECTING_MS = 30000;

// Reconectar IMEDIATAMENTE depois de uma queda faz o WhatsApp recusar a nova conexao
// com "Stream Errored (conflict)" (statusCode 440) -- o servidor do WhatsApp ainda nao
// processou que a conexao anterior caiu, entao ve as duas tentando usar a MESMA sessao
// ao mesmo tempo. Um atraso pequeno antes de tentar de novo evita esse ciclo (cai ->
// reconecta rapido demais -> conflito -> cai de novo -> ...).
const RECONNECT_DELAY_MS = 5000;

function removeSessionFiles(clientId) {
  fs.rmSync(path.join(SESSIONS_DIR, String(clientId)), { recursive: true, force: true });
}

// clientId -> { sock, status: 'connecting'|'qr'|'connected'|'disconnected', qrDataUrl, connectingSince }
const connections = new Map();

// ---- Um processo dono da sessão por vez ----
// A sessão fica na home (compartilhada entre deploys). Se o Hostinger deixa o processo
// do deploy anterior vivo, os dois abrem a MESMA sessão e um derruba o outro sem parar
// (conflito 440: "conectando/conectado" a cada poucos segundos). owner.json diz quem é
// o dono: o processo mais novo assume na subida; os outros, ao ver que não são mais
// donos, fecham a conexão e param de reconectar. Se o dono parar de dar sinal de vida
// (heartbeat), outro assume.
const INSTANCE_ID = `${process.pid}-${Date.now()}`;
const OWNER_HEARTBEAT_MS = 10000;
const OWNER_STALE_MS = 60000;
let ownerWatchdog = null;

function ownerFile() {
  return path.join(SESSIONS_DIR, 'owner.json');
}

function readOwner() {
  try {
    return JSON.parse(fs.readFileSync(ownerFile(), 'utf8'));
  } catch {
    return null;
  }
}

function writeOwner() {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  fs.writeFileSync(ownerFile(), JSON.stringify({ instanceId: INSTANCE_ID, pid: process.pid, heartbeatAt: Date.now() }));
}

// 'owner': sou o dono (ou não há dono); 'yield': outro processo vivo é o dono;
// 'takeover': o dono parou de dar sinal, posso assumir.
export function decideOwnership({ owner, instanceId, now = Date.now(), staleMs = OWNER_STALE_MS }) {
  if (!owner || owner.instanceId === instanceId) return 'owner';
  if (now - Number(owner.heartbeatAt || 0) > staleMs) return 'takeover';
  return 'yield';
}

function isOwner() {
  return decideOwnership({ owner: readOwner(), instanceId: INSTANCE_ID }) === 'owner';
}

function stopAllConnections(reason) {
  for (const [clientId, state] of connections) {
    if (!state.sock) continue;
    console.error(`Baileys [client ${clientId}]: ${reason} -- fechando a conexão deste processo.`);
    const sock = state.sock;
    state.sock = null;
    state.status = 'disconnected';
    state.connectingSince = null;
    try {
      sock.end(new Error(reason));
    } catch {
      // já fechado
    }
  }
}

function startOwnerWatchdog(reconnect) {
  if (ownerWatchdog) return;
  ownerWatchdog = setInterval(() => {
    const decision = decideOwnership({ owner: readOwner(), instanceId: INSTANCE_ID });
    if (decision === 'owner') {
      writeOwner(); // heartbeat
    } else if (decision === 'yield') {
      stopAllConnections('outro processo do servidor assumiu a sessão do WhatsApp');
    } else {
      console.error('Baileys: o processo dono da sessão parou de responder; este processo assume.');
      writeOwner();
      reconnect().catch((error) => console.error('Erro ao reassumir conexões Baileys:', error));
    }
  }, OWNER_HEARTBEAT_MS);
  ownerWatchdog.unref?.();
}

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

  // Outro processo é o dono da sessão: abrir aqui só derrubaria a conexão dele.
  if (!deps.baileys && !isOwner()) {
    state.status = 'standby';
    return state;
  }

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
  const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, downloadMediaMessage } = deps.baileys || await import('@whiskeysockets/baileys');

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
      // Socket que já foi descartado (reset, conexão travada): o evento dele não manda mais.
      if (state.sock !== sock) return;
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      console.error(`Baileys close [client ${clientId}] statusCode=${statusCode} loggedOut=${loggedOut} message=${lastDisconnect?.error?.message}`);
      state.lastDisconnectReason = { statusCode, message: lastDisconnect?.error?.message, at: new Date().toISOString() };
      state.sock = null;
      state.status = 'disconnected';
      state.connectingSince = null;
      if (!deps.baileys && !isOwner()) {
        console.error(`Baileys [client ${clientId}]: este processo não é mais o dono da sessão; não reconecta.`);
      } else {
        if (loggedOut) {
          // Desconectado pelo celular (Aparelhos conectados -> sair): a sessão salva ficou
          // inválida. Sem apagar, a próxima tentativa reusa as credenciais velhas e nunca
          // pede QR -- fica "conectando" pra sempre. Apaga e recomeça: sai um QR novo.
          (deps.removeSession || removeSessionFiles)(clientId);
          state.qrDataUrl = null;
        }
        // Reconecta só depois de um atraso (ver RECONNECT_DELAY_MS) pra não disparar o
        // conflito 440 reconectando rápido demais.
        const wait = deps.setTimeout || setTimeout;
        wait(() => connectClient(clientId, deps), RECONNECT_DELAY_MS);
      }
    }
  });

  // Tiques do WhatsApp (enviada/entregue/lida) das mensagens que mandamos.
  sock.ev.on('messages.update', async (updates) => {
    for (const { key, update } of updates) {
      const status = baileysStatusToName(update?.status);
      if (!key?.fromMe || !status) continue;
      try {
        await applyMessageStatus({ clientId, waMessageId: key.id, status });
      } catch (error) {
        console.error('Erro ao atualizar status de mensagem:', error.message);
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      if (!isUsableMessage(msg)) continue;
      try {
        const event = mapBaileysMessageToEvent(msg);
        if (event.mediaType) {
          event.media = {
            mimeType: event.mimeType,
            download: () => downloadMediaMessage(msg, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage, logger: sock.logger })
          };
        }
        const contactId = await ingestWhatsAppEvent(clientId, event);

        // Veio de anúncio: busca campanha/conjunto/anúncio na Marketing API em segundo
        // plano, igual ao webhook oficial.
        if (event.adId) {
          console.log(`Baileys [client ${clientId}]: conversa de anúncio (ad ${event.adId}, clid ${event.ctwaClid ? 'sim' : 'não'})`);
          resolveAd({ adId: event.adId, clientId })
            .catch((error) => console.error('Erro ao resolver anúncio:', error.message));
        }

        if (!msg.key?.fromMe) {
          refreshProfilePicture({
            clientId,
            contactId,
            getPictureUrl: () => sock.profilePictureUrl(`${event.waId}@s.whatsapp.net`, 'image')
          }).catch((error) => console.error('Erro ao atualizar foto de perfil:', error.message));
        }
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
// Desconectar / trocar número: desliga o aparelho atual (some de "Aparelhos conectados"
// no celular), apaga a sessão e abre uma conexão nova, que pede QR. Também destrava uma
// conexão que ficou presa em "conectando".
export async function resetClient(clientId, deps = {}) {
  const state = getOrInitState(clientId);
  if (state.connectPromise) {
    try { await state.connectPromise; } catch { /* segue pro reset mesmo assim */ }
  }
  const oldSock = state.sock;
  state.sock = null; // a partir daqui eventos do socket velho são ignorados
  state.status = 'disconnected';
  state.qrDataUrl = null;
  state.connectingSince = null;
  if (oldSock) {
    let loggedOut = false;
    if (typeof oldSock.logout === 'function') {
      try { await oldSock.logout(); loggedOut = true; } catch { /* aparelho já desconectado */ }
    }
    if (!loggedOut && typeof oldSock.end === 'function') {
      try { await oldSock.end(new Error('reset pedido pelo usuário')); } catch { /* já fechado */ }
    }
  }
  (deps.removeSession || removeSessionFiles)(clientId);
  return connectClient(clientId, deps);
}

export async function reconnectAllBaileysClients(deps = {}) {
  const dbImpl = deps.db || db;
  const connect = deps.connect || connectClient;

  // Subida do servidor: o processo mais novo vira o dono da sessão (ver owner.json).
  if (!deps.db) {
    writeOwner();
    startOwnerWatchdog(() => reconnectAllBaileysClients(deps));
  }

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
  const sent = await state.sock.sendMessage(jid, { text: body });
  // O id é o que liga os avisos de entregue/lida (messages.update) a esta mensagem.
  return sent?.key?.id || null;
}
