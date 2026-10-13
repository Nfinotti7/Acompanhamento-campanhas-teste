import db from '../config/db.js';

// Foto de perfil só existe no modo Baileys -- a Cloud API oficial não expõe a foto do
// contato. Verifica no máximo uma vez por dia por contato pra não ficar consultando o
// WhatsApp a cada mensagem que chega.
export const PROFILE_PIC_REFRESH_MS = 24 * 60 * 60 * 1000;

export async function refreshProfilePicture({ clientId, contactId, getPictureUrl, fetchImpl = fetch, db: dbImpl = db, now = Date.now }) {
  const { rows } = await dbImpl.query(
    `SELECT profile_pic_checked_at, profile_pic_media_id FROM whatsapp_contacts WHERE id = ?`,
    [contactId]
  );
  const contact = rows[0];
  if (!contact) return;
  if (contact.profile_pic_checked_at && now() - new Date(contact.profile_pic_checked_at).getTime() < PROFILE_PIC_REFRESH_MS) {
    return;
  }

  // Marca como verificado antes de tentar -- se falhar (sem foto, privacidade, rede),
  // não fica tentando de novo a cada mensagem.
  await dbImpl.query(
    `UPDATE whatsapp_contacts SET profile_pic_checked_at = ? WHERE id = ?`,
    [new Date(now()).toISOString(), contactId]
  );

  let url;
  try {
    url = await getPictureUrl();
  } catch {
    return;
  }
  if (!url) return;

  const res = await fetchImpl(url);
  if (!res.ok) return;
  const data = Buffer.from(await res.arrayBuffer());
  if (data.length === 0) return;

  const { rows: mediaRows } = await dbImpl.query(
    `INSERT INTO whatsapp_media (client_id, contact_id, mime_type, data, size_bytes)
     VALUES (?, ?, ?, ?, ?)
     RETURNING id`,
    [clientId, contactId, res.headers.get('content-type') || 'image/jpeg', data, data.length]
  );
  await dbImpl.query(
    `UPDATE whatsapp_contacts SET profile_pic_media_id = ? WHERE id = ?`,
    [mediaRows[0].id, contactId]
  );
  if (contact.profile_pic_media_id) {
    await dbImpl.query(`DELETE FROM whatsapp_media WHERE id = ?`, [contact.profile_pic_media_id]);
  }
}
