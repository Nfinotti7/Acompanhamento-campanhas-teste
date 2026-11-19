// Transcrição de mensagens de voz pelo Gemini (ele aceita áudio direto, sem biblioteca nova).
// Dois usos, mesma função:
//   - botão "Transcrever" no Balcão (a equipe pede, um áudio por vez);
//   - a atendente com IA, só quando está atendendo (ensureTranscripts, dentro do turno dela).
// O texto fica em whatsapp_messages.transcript: transcreve uma vez só, e quem vier depois reaproveita.
import { generate } from './geminiClient.js';

export const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
// Quantos áudios sem texto a IA transcreve por turno (os mais recentes da conversa).
const MAX_PER_TURN = 5;
const HISTORY_LIMIT = 30;

const PROMPT = 'Transcreva este áudio de WhatsApp em português, exatamente como foi falado. ' +
  'Responda só com a transcrição, sem comentários, aspas ou explicações. ' +
  'Se não houver fala, responda com uma linha vazia.';

export class TranscribeError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code; // not_found | not_audio | too_large | failed
  }
}

// "audio/ogg; codecs=opus" -> "audio/ogg" (o Gemini quer só o tipo).
function baseMime(mime) {
  return String(mime || 'audio/ogg').split(';')[0].trim().toLowerCase();
}

export async function transcribeMessage(q, { messageId, clientId }, deps = {}) {
  const gen = deps.generate || generate;
  const { rows } = await q.query(
    `SELECT m.id, m.media_type, m.transcript, md.mime_type, md.size_bytes, md.data
     FROM whatsapp_messages m
     LEFT JOIN whatsapp_media md ON md.id = m.media_id AND md.client_id = m.client_id
     WHERE m.id = ? AND m.client_id = ?`,
    [messageId, clientId]
  );
  const row = rows[0];
  if (!row) throw new TranscribeError('not_found', 'Mensagem não encontrada.');
  if (row.media_type !== 'audio' || !row.data) throw new TranscribeError('not_audio', 'Esta mensagem não é um áudio.');
  if (row.transcript) return { transcript: row.transcript };
  if ((row.size_bytes || row.data.length) > MAX_AUDIO_BYTES) {
    throw new TranscribeError('too_large', 'Áudio grande demais para transcrever.');
  }

  let text;
  try {
    const res = await gen({
      system: 'Você transcreve áudios de WhatsApp com fidelidade.',
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType: baseMime(row.mime_type), data: Buffer.from(row.data).toString('base64') } },
          { text: PROMPT }
        ]
      }],
      maxOutputTokens: 1500
    });
    text = String(res.text || '').trim();
  } catch (error) {
    throw new TranscribeError('failed', error.message || 'Falha ao transcrever.');
  }
  if (!text) throw new TranscribeError('failed', 'Não consegui entender fala neste áudio.');

  await q.query(`UPDATE whatsapp_messages SET transcript = ? WHERE id = ? AND client_id = ?`, [text, messageId, clientId]);
  return { transcript: text };
}

// Para a IA: transcreve os áudios recentes da conversa que ainda não têm texto. Falha de um
// áudio não derruba o turno (ele segue com o rótulo "Mensagem de voz"). Devolve quantos transcreveu.
export async function ensureTranscripts(q, { contactId, clientId }, deps = {}) {
  const transcribe = deps.transcribe || transcribeMessage;
  const { rows } = await q.query(
    `SELECT id FROM (
       SELECT id, media_type, transcript, direction, media_id, sent_at FROM whatsapp_messages
       WHERE contact_id = ? AND client_id = ? ORDER BY sent_at DESC, id DESC LIMIT ${HISTORY_LIMIT}
     ) recent
     WHERE media_type = 'audio' AND direction = 'inbound' AND media_id IS NOT NULL AND transcript IS NULL
     ORDER BY sent_at DESC, id DESC LIMIT ${MAX_PER_TURN}`,
    [contactId, clientId]
  );
  let done = 0;
  for (const r of rows) {
    try {
      await transcribe(q, { messageId: r.id, clientId });
      done += 1;
    } catch (error) {
      console.error(`Transcrição [mensagem ${r.id}]: ${error.message}`);
    }
  }
  return done;
}
