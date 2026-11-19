import db from '../config/db.js';
import { transcribeMessage, TranscribeError } from '../services/audioTranscriber.js';

function resolveClientId(req) {
  return req.user.role === 'admin'
    ? (req.query.clientId || req.body?.clientId || req.user.clientId)
    : req.user.clientId;
}

const ERRORS = {
  not_found: [404, 'Mensagem não encontrada.'],
  not_audio: [400, 'Esta mensagem não é um áudio.'],
  too_large: [413, 'Áudio grande demais para transcrever.'],
  failed: [502, 'Não consegui transcrever agora. Tente de novo em instantes.']
};

// Botão "Transcrever" do Balcão: a equipe pede, um áudio por vez. A IA usa o mesmo serviço sozinha.
export function makeTranscribeHandler(deps = {}) {
  const transcribe = deps.transcribe || transcribeMessage;
  return async function transcribeMessageHandler(req, res) {
    try {
      const clientId = resolveClientId(req);
      if (!clientId) return res.status(400).json({ error: 'ID do cliente é obrigatório.' });
      const { transcript } = await transcribe(db, { messageId: req.params.messageId, clientId });
      return res.json({ transcript });
    } catch (error) {
      if (error instanceof TranscribeError) {
        const [status, message] = ERRORS[error.code] || ERRORS.failed;
        return res.status(status).json({ error: message });
      }
      console.error('Transcribe message error:', error);
      return res.status(500).json({ error: 'Erro ao transcrever o áudio.' });
    }
  };
}

export const transcribeMessageHandler = makeTranscribeHandler();
