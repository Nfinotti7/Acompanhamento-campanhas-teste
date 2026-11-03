// Arquivos fixos do Balcão (cardápio, mapa, tabela de preços): ficam guardados por
// restaurante e vão pra qualquer conversa com um clique. O arquivo mora no Postgres
// (BYTEA), como a mídia das conversas.
import db from '../config/db.js';
import { sendMediaToContact, SendError, MAX_ATTACHMENT_BYTES } from '../services/whatsappSender.js';
import { pauseBotAfterStaffReply, sendErrorResponse } from './whatsappConversationsController.js';

const MAX_FILES_PER_CLIENT = 30;

function resolveClientId(req) {
  return req.user.role === 'admin'
    ? (req.query.clientId || req.body?.clientId || req.user.clientId)
    : req.user.clientId;
}

function decodeHeader(value) {
  try { return value ? decodeURIComponent(value) : ''; } catch { return ''; }
}

export async function listQuickFiles(req, res) {
  try {
    const clientId = resolveClientId(req);
    if (!clientId) return res.status(400).json({ error: 'ID do cliente é obrigatório.' });
    const { rows } = await db.query(
      `SELECT id, label, filename, mime_type, size_bytes FROM quick_files WHERE client_id = ? ORDER BY label ASC, id ASC`,
      [clientId]
    );
    return res.json({ files: rows });
  } catch (error) {
    console.error('List quick files error:', error);
    return res.status(500).json({ error: 'Erro ao listar os arquivos salvos.' });
  }
}

// Corpo = o arquivo (express.raw na rota); nome e rótulo nos cabeçalhos.
export async function createQuickFile(req, res) {
  try {
    const clientId = resolveClientId(req);
    if (!clientId) return res.status(400).json({ error: 'ID do cliente é obrigatório.' });
    const data = Buffer.isBuffer(req.body) ? req.body : null;
    if (!data || data.length === 0) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    if (data.length > MAX_ATTACHMENT_BYTES) return res.status(413).json({ error: 'Arquivo grande demais (máximo 15 MB).' });
    const filename = decodeHeader(req.get('X-File-Name')).slice(0, 200) || null;
    const label = (decodeHeader(req.get('X-Label')) || filename || 'Arquivo').trim().slice(0, 60);
    const { rows: count } = await db.query(`SELECT COUNT(*) AS n FROM quick_files WHERE client_id = ?`, [clientId]);
    if (Number(count[0].n) >= MAX_FILES_PER_CLIENT) {
      return res.status(400).json({ error: `Limite de ${MAX_FILES_PER_CLIENT} arquivos salvos. Apague algum antes.` });
    }
    const { rows } = await db.query(
      `INSERT INTO quick_files (client_id, label, filename, mime_type, data, size_bytes)
       VALUES (?, ?, ?, ?, ?, ?) RETURNING id, label, filename, mime_type, size_bytes`,
      [clientId, label, filename, decodeHeader(req.get('X-File-Type')) || 'application/octet-stream', data, data.length]
    );
    return res.status(201).json({ file: rows[0] });
  } catch (error) {
    console.error('Create quick file error:', error);
    return res.status(500).json({ error: 'Erro ao salvar o arquivo.' });
  }
}

export async function deleteQuickFile(req, res) {
  try {
    const clientId = resolveClientId(req);
    if (!clientId) return res.status(400).json({ error: 'ID do cliente é obrigatório.' });
    const { rows } = await db.query(`DELETE FROM quick_files WHERE id = ? AND client_id = ? RETURNING id`, [req.params.id, clientId]);
    if (rows.length === 0) return res.status(404).json({ error: 'Arquivo não encontrado.' });
    return res.json({ message: 'Arquivo apagado.' });
  } catch (error) {
    console.error('Delete quick file error:', error);
    return res.status(500).json({ error: 'Erro ao apagar o arquivo.' });
  }
}

// Manda o arquivo salvo pra uma conversa (mesma rota de envio dos anexos, sem subir de novo).
export async function sendQuickFile(req, res) {
  try {
    const clientId = resolveClientId(req);
    const { contactId, fileId } = req.params;
    const { rows } = await db.query(
      `SELECT filename, mime_type, data FROM quick_files WHERE id = ? AND client_id = ?`,
      [fileId, clientId]
    );
    if (!rows[0]) throw new SendError('Arquivo não encontrado.', 404);
    await sendMediaToContact({
      clientId, contactId, data: rows[0].data, mimeType: rows[0].mime_type,
      filename: rows[0].filename, caption: String(req.body?.caption || '').slice(0, 1000), sentBy: 'staff'
    });
    await pauseBotAfterStaffReply(clientId, contactId);
    return res.json({ message: 'Arquivo enviado.' });
  } catch (error) {
    return sendErrorResponse(res, error, 'Send quick file error:', 'Erro ao enviar o arquivo.');
  }
}
