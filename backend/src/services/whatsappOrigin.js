// Origem da conversa, no mesmo modelo do painel de atribuição:
// - meta_ads: clique em anúncio Meta (referral da Cloud API oficial, ou cartão do
//   anúncio -- externalAdReply -- no modo Baileys)
// - google_ads / outras: chegaram por link rastreável (UTM) -- ainda não implementado
// - nao_rastreada: nenhuma das anteriores
export const ORIGINS = ['meta_ads', 'google_ads', 'outras', 'nao_rastreada'];

export function classifyOrigin({ source } = {}) {
  if (source === 'ad') return 'meta_ads';
  if (source === 'google_ads' || source === 'outras') return source;
  return 'nao_rastreada';
}

// Mesma regra em SQL, pra agregar direto no banco (dashboard).
export const ORIGIN_SQL = `CASE
  WHEN wc.source = 'ad' THEN 'meta_ads'
  WHEN wc.source IN ('google_ads', 'outras') THEN wc.source
  ELSE 'nao_rastreada' END`;

// Balcão só com anúncio (clients.balcao_ads_only): a lista de conversas e o funil mostram
// só Meta Ads e Google Ads. Orgânicas continuam gravadas e voltam com origin=all
// (botão "Mostrar orgânicas"). adsOnly diz à tela se o botão deve aparecer.
export const AD_SOURCES_SQL = `wc.source IN ('ad', 'google_ads')`;

export async function balcaoOriginFilter(dbImpl, clientId, origin) {
  const { rows } = await dbImpl.query(`SELECT balcao_ads_only FROM clients WHERE id = ?`, [clientId]);
  const adsOnly = Boolean(rows[0]?.balcao_ads_only);
  return { adsOnly, sql: adsOnly && origin !== 'all' ? ` AND ${AD_SOURCES_SQL}` : '' };
}
// Anúncio antigo: a pessoa chamou quando o anúncio já não rodava (post ou conversa antiga com
// o botão ainda lá). O cartão é verdadeiro, mas não é resultado do que está no ar.
export const OLD_AD_GRACE_DAYS = 7;

export function originCategory({ source, adStatus, lastSpendDate, firstContactAt } = {}) {
  if (source === 'google_ads') return 'google';
  if (source === 'outras') return 'outras';
  if (source !== 'ad') return 'organico';
  // Sem a situação do anúncio na Meta não dá pra afirmar que é antigo.
  if (!adStatus || adStatus === 'ACTIVE' || !firstContactAt) return 'anuncio';
  if (!lastSpendDate) return 'anuncio_antigo';
  const limit = Date.parse(`${lastSpendDate}T23:59:59-03:00`) + OLD_AD_GRACE_DAYS * 86400000;
  return Date.parse(firstContactAt) > limit ? 'anuncio_antigo' : 'anuncio';
}
