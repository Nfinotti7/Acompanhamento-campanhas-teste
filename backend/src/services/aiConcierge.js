// Atendente com IA do Balcão (Gemini). Entra na cadeia de robôs de whatsappIngest.js no lugar
// de Reservas, Respostas automáticas e Fora do horário quando está ligada para o contato.
//
// - Espera ~6 s sem novas mensagens do contato e responde UMA vez, vendo tudo que ele escreveu.
// - Conversa com o Gemini e deixa o código decidir as regras (aiTools.js).
// - Para quando a equipe responde (botPause.js), checando de novo logo antes de enviar.
// - Se o Gemini falhar antes de qualquer efeito, devolve pra cadeia antiga (args.onFailure).
import db from '../config/db.js';
import { generate } from './geminiClient.js';
import { AI_TOOL_DECLARATIONS, runTool } from './aiTools.js';
import { buildSystemPrompt, toContents } from './aiPrompt.js';
import { redactContents } from './aiRedact.js';
import { loadReservationSettings, upcomingReservationsForContact } from './reservationStore.js';
import { isBotPaused } from './botPause.js';
import { sendToContact } from './whatsappSender.js';
import { sendTyping } from './baileysClient.js';
import { broadcast } from './sseHub.js';
import { firstName } from './waitlistText.js';
import { isAiActiveFor } from './aiConfig.js';

export const DEBOUNCE_MS = 6000;
export const MAX_TOOL_ROUNDS = 3;
export const MAX_REPLIES_PER_HOUR = 20;
const HISTORY_LIMIT = 30;
const HOUR_MS = 3600e3;
// Ferramentas que mudam algo: se o Gemini cair depois delas, os robôs antigos não podem assumir.
const SIDE_EFFECT_TOOLS = new Set(['create_reservation', 'update_reservation', 'cancel_reservation', 'handoff_to_staff']);

const PROMISES_STAFF = /só um momento|vou (chamar|verificar|confirmar|checar)|já (chamo|aviso)/i;

// Modelos pequenos às vezes escrevem comentário interno na resposta (ex.: "*(Handoff acionado...)*"
// ou o nome de uma ferramenta). Isso nunca pode chegar ao cliente.
const TOOL_NAMES = 'handoff_to_staff|check_availability|create_reservation|list_my_reservations|cancel_reservation';
const INTERNAL_PAREN = new RegExp(`[*_]*\\([^)]*\\b(?:handoff|ferramenta|${TOOL_NAMES})[^)]*\\)[*_]*`, 'gi');
const BARE_TOOL = new RegExp(`\\b(?:${TOOL_NAMES})\\b`, 'gi');
export function cleanReply(text) {
  return String(text || '')
    .replace(INTERNAL_PAREN, '')
    .replace(BARE_TOOL, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const pending = new Map(); // espera de 6 s por contato
const running = new Map(); // turno em andamento por contato

function resolveDeps(deps) {
  return {
    db: deps.db || db,
    now: deps.now ? deps.now() : new Date(),
    loadSettings: deps.loadSettings || loadReservationSettings,
    upcomingReservations: deps.upcomingReservations || upcomingReservationsForContact,
    isBotPaused: deps.isBotPaused || isBotPaused,
    generate: deps.generate || generate,
    runTool: deps.runTool || runTool,
    toolDeps: deps.toolDeps,
    send: deps.send || sendToContact,
    typing: deps.typing || ((clientId, waId, text) => sendTyping(clientId, waId, Math.min(1500 + text.length * 25, 6000))),
    broadcast: deps.broadcast || broadcast,
    model: deps.model || process.env.GEMINI_MODEL || 'gemini-flash-lite-latest'
  };
}

// Chamado a cada mensagem recebida: só agenda. A resposta sai quando o contato fica 6 s quieto.
export function handleInboundForAi(args, deps = {}) {
  const key = `${String(args.clientId)}:${String(args.contactId)}`;
  const schedule = deps.setTimeout || setTimeout;
  const cancel = deps.clearTimeout || clearTimeout;
  const previous = pending.get(key);
  if (previous) cancel(previous.timer);
  const entry = { args };
  entry.timer = schedule(() => {
    if (pending.get(key) === entry) pending.delete(key);
    // Um turno por vez em cada contato: se o cliente escreveu de novo enquanto o Gemini ainda
    // respondia, o novo turno espera o anterior (e vê a resposta dele no histórico).
    const run = (running.get(key) || Promise.resolve()).catch(() => {}).then(() => runAiTurn(entry.args, deps));
    running.set(key, run);
    run.catch(() => {}).finally(() => { if (running.get(key) === run) running.delete(key); });
    return run.catch((error) => console.error('Atendente IA: erro:', error.message));
  }, DEBOUNCE_MS);
  pending.set(key, entry);
  return Promise.resolve('queued');
}

async function audit(d, { clientId, contactId, tokensIn, tokensOut, latency, tools, handoffReason, status }) {
  try {
    await d.db.query(
      `INSERT INTO ai_replies (client_id, contact_id, model, tokens_in, tokens_out, latency_ms, tools, handoff_reason, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [clientId, contactId, d.model, tokensIn, tokensOut, latency, tools, handoffReason, status]
    );
  } catch (error) {
    console.error('Atendente IA: erro ao gravar a auditoria:', error.message);
  }
}

function alertStaff(d, clientId, contactId) {
  d.broadcast(clientId, 'reservation', { contactId: Number(contactId), needsAttention: true });
}

// A espera de 6 s fica só na memória: um reinício do app (deploy, queda) no meio dela deixa o
// cliente sem resposta (visto em 17/11, 19:20). Na subida, responde quem escreveu há pouco e
// ainda não recebeu nada (última mensagem da conversa é do cliente), se a IA está ligada pra ele.
export const RECOVER_WINDOW_MS = 10 * 60e3;

export async function recoverPendingAiReplies(deps = {}) {
  const q = deps.db || db;
  const now = deps.now ? deps.now() : new Date();
  const loadSettings = deps.loadSettings || loadReservationSettings;
  const enqueue = deps.enqueue || handleInboundForAi;
  const { rows } = await q.query(
    `SELECT c.id AS contact_id, c.client_id, c.wa_id, c.profile_name, cl.name AS restaurant_name
     FROM whatsapp_contacts c
     JOIN clients cl ON cl.id = c.client_id
     JOIN LATERAL (
       SELECT direction, sent_at FROM whatsapp_messages m WHERE m.contact_id = c.id ORDER BY m.sent_at DESC, m.id DESC LIMIT 1
     ) last ON true
     WHERE cl.reservations_enabled = true AND last.direction = 'inbound' AND last.sent_at > ?`,
    [new Date(now.getTime() - RECOVER_WINDOW_MS)]
  );
  const settingsByClient = new Map();
  let count = 0;
  for (const row of rows) {
    if (!/^\d{8,15}$/.test(String(row.wa_id))) continue; // grupo/lista de transmissão
    const key = String(row.client_id);
    if (!settingsByClient.has(key)) settingsByClient.set(key, await loadSettings(q, row.client_id));
    if (!isAiActiveFor(settingsByClient.get(key), row.wa_id)) continue;
    await enqueue({
      clientId: row.client_id, contactId: row.contact_id, waId: row.wa_id,
      profileName: row.profile_name, restaurantName: row.restaurant_name || ''
    });
    count += 1;
  }
  return count;
}

// Uma rodada: lê a conversa, fala com o Gemini (com ferramentas) e envia UMA resposta.
export async function runAiTurn(args, deps = {}) {
  const d = resolveDeps(deps);
  const { clientId, contactId, waId, profileName, restaurantName = '' } = args;
  const q = d.db;

  if (await d.isBotPaused(q, { contactId, now: d.now })) return 'paused';

  const { rows: recent } = await q.query(
    `SELECT COUNT(*)::int AS n FROM ai_replies
     WHERE contact_id = ? AND created_at > ? AND status IN ('answered', 'handoff')`,
    [contactId, new Date(d.now.getTime() - HOUR_MS)]
  );
  if ((recent[0]?.n || 0) >= MAX_REPLIES_PER_HOUR) {
    alertStaff(d, clientId, contactId);
    await audit(d, { clientId, contactId, tokensIn: 0, tokensOut: 0, latency: 0, tools: [], handoffReason: null, status: 'throttled' });
    return 'throttled';
  }

  const { rows: history } = await q.query(
    `SELECT direction, body FROM (
       SELECT direction, body, sent_at, id FROM whatsapp_messages
       WHERE contact_id = ? ORDER BY sent_at DESC, id DESC LIMIT ${HISTORY_LIMIT}
     ) recent ORDER BY sent_at ASC, id ASC`,
    [contactId]
  );
  // O Gemini nunca vê telefone, CPF, CNPJ ou e-mail do cliente (aiRedact.js).
  const contents = redactContents(toContents(history));
  if (contents.length === 0 || contents.at(-1).role !== 'user') return 'skipped';

  const settings = await d.loadSettings(q, clientId);
  const upcoming = await d.upcomingReservations(q, { clientId, contactId, now: d.now });
  const system = buildSystemPrompt({ settings, restaurantName, now: d.now, firstName: firstName(profileName), upcoming });
  const ctx = { db: q, clientId, contactId, waId, settings, now: d.now, deps: d.toolDeps };

  const startedAt = Date.now();
  const toolsUsed = [];
  let tokensIn = 0;
  let tokensOut = 0;
  let handoffReason = null;
  let text = null;

  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const res = await d.generate({ system, contents, tools: AI_TOOL_DECLARATIONS, maxOutputTokens: 500 });
      tokensIn += res.usage?.in || 0;
      tokensOut += res.usage?.out || 0;
      if (res.functionCalls.length === 0) { text = res.text.trim(); break; }
      if (round === MAX_TOOL_ROUNDS) throw new Error('ferramentas demais numa só resposta');
      contents.push({ role: 'model', parts: res.parts });
      const responses = [];
      for (const call of res.functionCalls) {
        const result = await d.runTool(call.name, call.args, ctx);
        // Na auditoria a ferramenta que deu erro aparece como "nome!codigo" (ex.: create_reservation!tool_error).
        toolsUsed.push(result?.error ? `${call.name}!${result.error}` : call.name);
        if (call.name === 'handoff_to_staff') handoffReason = String(call.args?.reason || '').slice(0, 300) || 'sem motivo';
        responses.push({ functionResponse: { name: call.name, response: result } });
      }
      contents.push({ role: 'user', parts: responses });
    }
    text = cleanReply(text);
    if (!text) throw new Error('resposta vazia depois de tirar o comentário interno');
  } catch (error) {
    console.error(`Atendente IA [contato ${contactId}]: ${error.message}`);
    await audit(d, { clientId, contactId, tokensIn, tokensOut, latency: Date.now() - startedAt, tools: toolsUsed, handoffReason, status: 'failed' });
    if (toolsUsed.some((name) => SIDE_EFFECT_TOOLS.has(name.split('!')[0]))) {
      alertStaff(d, clientId, contactId);
    } else if (args.onFailure) {
      try { await args.onFailure(args); } catch (fallbackError) {
        console.error('Atendente IA: erro nos robôs de reserva:', fallbackError.message);
      }
    }
    return 'failed';
  }

  const base = { clientId, contactId, tokensIn, tokensOut, latency: Date.now() - startedAt, tools: toolsUsed, handoffReason };
  // A equipe pode ter respondido enquanto o Gemini pensava. O repasse da própria IA também
  // pausa o contato, então só conta como "equipe assumiu" quando não foi a IA que repassou.
  if (!handoffReason && await d.isBotPaused(q, { contactId, now: d.now })) {
    await audit(d, { ...base, status: 'paused' });
    return 'paused';
  }
  try {
    await d.typing(clientId, waId, text);
    await d.send({ clientId, contactId, sentBy: 'bot_ai', body: text });
  } catch (error) {
    console.error(`Atendente IA: falha ao responder o contato ${contactId}:`, error.message);
    await audit(d, { ...base, status: 'failed' });
    return 'failed';
  }
  const status = handoffReason ? 'handoff' : 'answered';
  // O modelo às vezes promete chamar a equipe sem usar a ferramenta de repasse: o cliente fica
  // esperando e ninguém sabe. Nesse caso avisa a equipe no Balcão (sem pausar a IA).
  if (!handoffReason && PROMISES_STAFF.test(text)) alertStaff(d, clientId, contactId);
  await audit(d, { ...base, status });
  return status;
}
