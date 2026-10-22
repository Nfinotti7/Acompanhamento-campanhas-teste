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
// Só UM processo pode abrir a sessão (o dono, ver owner.json). O Hostinger às vezes roda
// dois processos e reparte as requisições: quem não é dono pede ao dono pelo banco
// (processRelay.js) pra enviar, resetar ou gerar código, e lê dali o status da conexão.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import QRCode from 'qrcode';
import db from '../config/db.js';
import { ingestWhatsAppEvent } from './whatsappIngest.js';
import { mapBaileysMessageToEvent, isUsableMessage, UNKNOWN_MESSAGE_LABEL, messageTypes } from './baileysMapper.js';
import { refreshProfilePicture } from './profilePicture.js';
import { applyMessageStatus, baileysStatusToName } from './messageStatus.js';
import { resolveAd } from './metaAdResolver.js';
import { normalizePhone, phoneVariants } from './waitlistText.js';
import { INSTANCE_ID } from './instance.js';
import { requestFromOwner, processRelayQueue, publishStatus, readPublishedStatus, purgeRelayTables } from './processRelay.js';

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

// Envio no meio de uma queda (ex: 503 do WhatsApp, que reconecta em ~5s): espera a
// conexão voltar em vez de dar erro na cara do atendente.
const SEND_WAIT_MS = 10000;

// ---- Vigia da conexão zumbi ----
// Em 17/10 a conexão da Mercearia parou de receber mensagens e de confirmar entregas, mas
// nunca disparou 'close': o ping interno do Baileys seguia respondendo, então ele achava
// que estava tudo bem. O robô da fila ficou mudo até alguém reiniciar o servidor.
// O vigia olha o que importa de verdade e, se a conexão parece morta, descarta o socket e
// reconecta com a sessão salva (sem QR):
// - mensagem que enviamos sem confirmação em 90s E sem nenhum outro evento desde o envio.
//   Só a falta de confirmação não basta: ~10% das mensagens da fila nunca são confirmadas
//   mesmo com a conexão boa (número errado, sem WhatsApp);
// - nenhum evento de mensagem por 20 min (renova por garantia; é rápido e não pede QR).
const ACK_TIMEOUT_MS = 90 * 1000;
const SILENT_RECYCLE_MS = 20 * 60 * 1000;
const WATCHDOG_INTERVAL_MS = 60 * 1000;
let connectionWatchdog = null;

export function connectionHealth({ status, lastActivityAt, pendingAcks, now, ackTimeoutMs = ACK_TIMEOUT_MS, silentMs = SILENT_RECYCLE_MS }) {
  if (status !== 'connected') return null;
  for (const sentAt of pendingAcks?.values() || []) {
    if (now - sentAt > ackTimeoutMs && !(lastActivityAt > sentAt)) return 'mensagem enviada sem confirmação do WhatsApp (conexão zumbi)';
  }
  if (lastActivityAt && now - lastActivityAt > silentMs) return 'nenhum evento do WhatsApp há 20 min (renovando a conexão)';
  return null;
}

function recycleConnection(clientId, state, reason) {
  const deps = state.deps || {};
  const sock = state.sock;
  console.error(`Baileys [client ${clientId}]: vigia -- ${reason}. Reconectando.`);
  state.lastDisconnectReason = { statusCode: 'vigia', message: reason, at: new Date().toISOString() };
  state.sock = null; // a partir daqui eventos do socket velho são ignorados
  state.status = 'disconnected';
  state.connectingSince = null;
  state.pendingAcks = new Map();
  shareState(clientId, state);
  try {
    sock?.end?.(new Error(reason));
  } catch {
    // já fechado
  }
  const wait = deps.setTimeout || setTimeout;
  wait(() => connectClient(clientId, deps), RECONNECT_DELAY_MS);
}

export async function checkConnections(deps = {}) {
  if (!deps.baileys && !isOwner()) return;
  const now = (deps.now || Date.now)();
  for (const [clientId, state] of connections) {
    const reason = connectionHealth({ status: state.status, lastActivityAt: state.lastActivityAt, pendingAcks: state.pendingAcks, now });
    if (reason) recycleConnection(clientId, state, reason);
  }
}

function startConnectionWatchdog() {
  if (connectionWatchdog) return;
  connectionWatchdog = setInterval(() => {
    checkConnections().catch((error) => console.error('Erro no vigia do Baileys:', error));
  }, WATCHDOG_INTERVAL_MS);
  connectionWatchdog.unref?.();
}

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
      for (const [clientId, state] of connections) shareState(clientId, state);
    } else if (decision === 'yield') {
      stopAllConnections('outro processo do servidor assumiu a sessão do WhatsApp');
    } else {
      console.error(`Baileys: o processo dono da sessão parou de responder; este processo (${INSTANCE_ID}) assume.`);
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
    connections.set(key, { sock: null, status: 'disconnected', qrDataUrl: null, connectPromise: null, connectingSince: null, lastActivityAt: null, pendingAcks: new Map(), deps: {} });
  }
  return connections.get(key);
}

function isConnected(state) {
  return Boolean(state?.sock) && state.status === 'connected';
}

// O dono grava o status no banco pros outros processos mostrarem o mesmo na tela.
function shareState(clientId, state) {
  const deps = state.deps || {};
  const publish = deps.publishStatus || (deps.baileys ? null : publishStatus);
  if (!publish) return;
  if (!deps.baileys && !isOwner()) return;
  publish(clientId, { status: state.status, qrDataUrl: state.qrDataUrl, lastDisconnectReason: state.lastDisconnectReason })
    .catch((error) => console.error(`Baileys [client ${clientId}]: erro ao publicar o status:`, error.message));
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
  const now = deps.now || Date.now;
  state.sock = sock;
  state.status = 'connecting';
  state.connectingSince = now();
  state.deps = deps;
  state.pendingAcks = new Map();
  shareState(clientId, state);
  const markActivity = () => { if (state.sock === sock) state.lastActivityAt = now(); };

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      state.status = 'qr';
      state.qrDataUrl = await QRCode.toDataURL(qr);
      state.connectingSince = null;
      shareState(clientId, state);
    }

    if (connection === 'open') {
      state.status = 'connected';
      markActivity();
      state.qrDataUrl = null;
      state.connectingSince = null;
      shareState(clientId, state);
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
      shareState(clientId, state);
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
    markActivity();
    for (const { key, update } of updates) {
      if (key?.id) state.pendingAcks.delete(key.id); // o WhatsApp respondeu: a conexão está viva
      const status = baileysStatusToName(update?.status);
      if (!key?.fromMe || !status) continue;
      try {
        await (deps.applyMessageStatus || applyMessageStatus)({ clientId, waMessageId: key.id, status });
      } catch (error) {
        console.error('Erro ao atualizar status de mensagem:', error.message);
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    markActivity();
    if (type !== 'notify') return;
    for (const msg of messages) {
      if (!isUsableMessage(msg)) continue;
      try {
        const event = mapBaileysMessageToEvent(msg);
        if (event.body === UNKNOWN_MESSAGE_LABEL) {
          console.log(`Baileys [client ${clientId}]: tipo de mensagem não reconhecido (${messageTypes(msg).join(', ')})`);
        }
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
  if (!deps.baileys && !deps.viaRelay && !isOwner()) {
    await requestFromOwner('reset', clientId);
    return getConnectionState(clientId);
  }
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

export class PairingError extends Error {
  userFacing = true; // a mensagem vai pra tela (400), inclusive quando volta pela ponte
}

// Conectar com código em vez de QR: pra quando o QR aparece no MESMO celular que tem o
// WhatsApp (não dá pra escanear a própria tela). O WhatsApp aceita um código de 8
// caracteres em Aparelhos conectados -> Conectar com número de telefone.
export async function requestPairingCode(clientId, rawPhone, deps = {}) {
  const phone = normalizePhone(rawPhone);
  if (!phone) throw new PairingError('Número inválido. Use DDD + número, ex: (11) 99999-8888.');
  if (!deps.baileys && !deps.viaRelay && !isOwner()) {
    const { code } = await requestFromOwner('pairing', clientId, { phone: rawPhone }, { timeoutMs: 30000 });
    return code;
  }

  let state = getOrInitState(clientId);
  if (!state.sock) state = await connectClient(clientId, deps);
  if (state.status === 'standby') {
    throw new PairingError('O servidor está reiniciando a conexão. Tente de novo em 1 minuto.');
  }
  const sock = state.sock;
  if (!sock) throw new PairingError('Não foi possível abrir a conexão. Tente de novo.');
  if (state.status === 'connected' || sock.authState?.creds?.registered) {
    throw new PairingError('Este WhatsApp já está conectado. Use "Desconectar / trocar número" antes.');
  }

  // O socket só aceita o pedido de código depois de pronto -- que é quando ele pede QR.
  const now = deps.now || Date.now;
  const sleep = deps.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const start = now();
  while (state.status !== 'qr' && now() - start < 15000) await sleep(500);
  if (state.status !== 'qr') {
    throw new PairingError('A conexão ainda não está pronta. Tente de novo em alguns segundos.');
  }

  const code = await sock.requestPairingCode(phone);
  return String(code).replace(/[^A-Za-z0-9]/g, '').toUpperCase().replace(/^(.{4})(.{4})$/, '$1-$2');
}

export async function reconnectAllBaileysClients(deps = {}) {
  const dbImpl = deps.db || db;
  const connect = deps.connect || connectClient;

  // Subida do servidor: o processo mais novo vira o dono da sessão (ver owner.json).
  if (!deps.db) {
    writeOwner();
    console.log(`Baileys: processo ${INSTANCE_ID} assumiu a sessão do WhatsApp`);
    startOwnerWatchdog(() => reconnectAllBaileysClients(deps));
    startConnectionWatchdog();
    startRelayWorker();
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

// O status de verdade é o do dono. Num processo que não é dono, o estado local é sempre
// "standby", então lê o que o dono publicou no banco.
export async function getSharedConnectionState(clientId, deps = {}) {
  const local = getConnectionState(clientId);
  if (!deps.readPublishedStatus && isOwner()) return { ...local, ownerInstance: INSTANCE_ID };
  const published = await (deps.readPublishedStatus || readPublishedStatus)(clientId);
  return published || local;
}

// Abre a conexão se ainda não existe (ex: cliente acabou de ser configurado como Baileys).
// Fora do dono, só pede ao dono quando o status publicado não mostra conexão nenhuma.
export async function ensureConnection(clientId) {
  if (isOwner()) {
    await connectClient(clientId);
    return;
  }
  const published = await readPublishedStatus(clientId);
  if (published && published.status !== 'disconnected') return;
  try {
    await requestFromOwner('connect', clientId, {}, { timeoutMs: 8000 });
  } catch (error) {
    console.error(`Baileys [client ${clientId}]: o dono não abriu a conexão (${error.message}).`);
  }
}

// ---- Pedidos de outros processos (ver processRelay.js) ----
const RELAY_POLL_MS = 500;
const RELAY_PURGE_EVERY = 1200; // ~10 min
let relayWorker = null;

const relayHandlers = {
  send: async (clientId, p) => ({ id: await sendViaBaileys(clientId, p.waId, p.body, { messageId: p.messageId, viaRelay: true }) }),
  reset: async (clientId) => { await resetClient(clientId, { viaRelay: true }); return {}; },
  pairing: async (clientId, p) => ({ code: await requestPairingCode(clientId, p.phone, { viaRelay: true }) }),
  connect: async (clientId) => { await connectClient(clientId); return {}; }
};

function startRelayWorker() {
  if (relayWorker) return;
  let running = false;
  let ticks = 0;
  relayWorker = setInterval(async () => {
    if (running || !isOwner()) return;
    running = true;
    try {
      await processRelayQueue(relayHandlers);
      if (++ticks % RELAY_PURGE_EVERY === 0) await purgeRelayTables();
    } catch (error) {
      console.error('Erro ao atender pedidos de outro processo:', error.message);
    } finally {
      running = false;
    }
  }, RELAY_POLL_MS);
  relayWorker.unref?.();
}

// Celular brasileiro existe no WhatsApp com OU sem o 9º dígito, conforme a idade da conta
// (muita conta de Goiás é 55 62 xxxx-xxxx). A recepcionista digita com o 9, e a mensagem ia
// pra um número que não existe: ficava "enviada" e nunca chegava (17/10, todas as entradas
// manuais da Mercearia). Pergunta ao WhatsApp qual das duas formas existe e guarda a resposta.
const jidCache = new Map();
const LOOKUP_TIMEOUT_MS = 8000;

async function resolveJid(clientId, sock, waId) {
  if (waId.includes('@')) return waId;
  const fallback = `${waId}@s.whatsapp.net`;
  const variants = phoneVariants(waId);
  if (variants.length < 2 || typeof sock.onWhatsApp !== 'function') return fallback;
  const key = `${normalizeClientId(clientId)}:${waId}`;
  if (jidCache.has(key)) return jidCache.get(key);
  try {
    const lookup = sock.onWhatsApp(...variants.map((v) => `${v}@s.whatsapp.net`));
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), LOOKUP_TIMEOUT_MS).unref?.());
    const results = await Promise.race([lookup, timeout]);
    const hit = (results || []).find((r) => r?.exists && r.jid);
    if (hit) {
      jidCache.set(key, hit.jid);
      return hit.jid;
    }
  } catch (error) {
    console.error(`Baileys [client ${clientId}]: não deu pra conferir o número ${waId} (${error.message}); enviando como está.`);
  }
  return fallback;
}

// messageId: id próprio da mensagem (o robô grava a linha antes de enviar; ver whatsappSender.js).
// Espera a conexão voltar quando ela está caindo/reconectando. QR e standby não voltam
// sozinhos, então não adianta esperar.
async function waitForConnection(clientId, deps) {
  const now = deps.now || Date.now;
  const sleep = deps.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const deadline = now() + (deps.sendWaitMs ?? SEND_WAIT_MS);
  let state = connections.get(normalizeClientId(clientId));
  while (state && ['connecting', 'disconnected'].includes(state.status) && now() < deadline) {
    await sleep(250);
    state = connections.get(normalizeClientId(clientId));
  }
  return state;
}

export async function sendViaBaileys(clientId, waId, body, { messageId, viaRelay = false } = {}) {
  let state = connections.get(normalizeClientId(clientId));
  if (!isConnected(state)) {
    const deps = state?.deps || {};
    if (!viaRelay && !deps.baileys && !isOwner()) {
      const { id } = await requestFromOwner('send', clientId, { waId, body, messageId: messageId || null });
      return id || null;
    }
    state = await waitForConnection(clientId, deps);
    if (!isConnected(state)) {
      throw new Error('Conexão WhatsApp (Baileys) não está ativa para este cliente.');
    }
  }
  const jid = await resolveJid(clientId, state.sock, waId);
  const sent = await state.sock.sendMessage(jid, { text: body }, messageId ? { messageId } : undefined);
  // O id é o que liga os avisos de entregue/lida (messages.update) a esta mensagem.
  const id = sent?.key?.id || null;
  if (id) state.pendingAcks.set(id, (state.deps?.now || Date.now)());
  return id;
}

// "digitando..." antes da resposta do robô: ritmo de gente, e menos cara de robô pro
// WhatsApp. Erro aqui nunca impede a resposta.
export async function sendTyping(clientId, waId, ms, deps = {}) {
  const sleep = deps.sleep || ((t) => new Promise((r) => setTimeout(r, t)));
  const state = connections.get(normalizeClientId(clientId));
  if (!state?.sock || state.status !== 'connected') return;
  try {
    const jid = await resolveJid(clientId, state.sock, waId);
    await state.sock.sendPresenceUpdate('composing', jid);
    await sleep(ms);
    await state.sock.sendPresenceUpdate('paused', jid);
  } catch (error) {
    console.error(`Baileys [client ${clientId}]: falha no "digitando":`, error.message);
  }
}
