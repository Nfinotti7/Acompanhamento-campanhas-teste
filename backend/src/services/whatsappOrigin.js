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
