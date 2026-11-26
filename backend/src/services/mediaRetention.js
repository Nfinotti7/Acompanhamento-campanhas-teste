// Mídia do WhatsApp (foto, áudio, documento) fica no Balcão só por um tempo curto (no Storage
// desde 25/11/2026, ver mediaStore.js): quem
// precisa baixa no mesmo dia, depois ela é apagada e a conversa mostra "Mídia indisponível"
// (whatsapp_messages.media_id vira NULL pela FK ON DELETE SET NULL). Sem isso o banco do
// plano grátis enche: foi o que derrubou o Balcão em 20/11 e em 24/11/2026.
//
// A foto de perfil dos contatos fica (é uma por contato e pequena).

import { deleteMedia } from './mediaStore.js';

export const MEDIA_RETENTION_HOURS = Number(process.env.MEDIA_RETENTION_HOURS) || 24;

// Apaga em lotes pequenos pra não gerar um WAL gigante de uma vez.
const BATCH = 200;

export async function purgeOldMedia(dbImpl, hours = MEDIA_RETENTION_HOURS, deps = {}) {
  const remove = deps.deleteMedia || deleteMedia;
  let total = 0;
  for (;;) {
    const { rows } = await dbImpl.query(
      `SELECT m.id FROM whatsapp_media m
        WHERE m.created_at < now() - (? * interval '1 hour')
          AND NOT EXISTS (SELECT 1 FROM whatsapp_contacts c WHERE c.profile_pic_media_id = m.id)
        LIMIT ${BATCH}`,
      [hours]
    );
    // Apaga a linha e o arquivo do bucket do Storage, se estiver lá.
    total += await remove(dbImpl, rows.map((r) => r.id));
    if (rows.length < BATCH) return total;
  }
}
