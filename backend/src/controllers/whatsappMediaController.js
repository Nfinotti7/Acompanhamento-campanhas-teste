import db from '../config/db.js';
import { loadMedia } from '../services/mediaStore.js';

function resolveClientId(req) {
  return req.user.role === 'admin'
    ? (req.query.clientId || req.body?.clientId || req.user.clientId)
    : req.user.clientId;
}

// Servida via <img>/<audio>/<video src=...>, que não conseguem mandar header de
// Authorization -- por isso a autenticação aceita ?token= (ver authMiddleware).
export async function getMedia(req, res) {
  try {
    const clientId = resolveClientId(req);
    if (!clientId) {
      return res.status(400).json({ error: 'ID do cliente é obrigatório.' });
    }

    const media = await loadMedia(db, req.params.mediaId, clientId);
    if (!media) {
      return res.status(404).json({ error: 'Mídia não encontrada.' });
    }

    res.set('Content-Type', media.mime_type);
    res.set('Cache-Control', 'private, max-age=86400');
    return res.send(media.data);
  } catch (error) {
    console.error('Get media error:', error);
    return res.status(500).json({ error: 'Erro ao carregar mídia.' });
  }
}
