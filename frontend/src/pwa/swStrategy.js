// Mesma regra do public/sw.js (o service worker não importa módulos do Vite).
// Mudou aqui? Mude lá também. A origem própria entra como parâmetro (em Node não existe `self`).
export function swStrategyFor(url, mode, ownOrigin = 'https://furtherads.online') {
  if (url.origin !== ownOrigin) return 'bypass';
  const p = url.pathname;
  if (p.startsWith('/api/') || p.startsWith('/r/')) return 'bypass';
  if (mode === 'navigate') return 'network-first-shell';
  if (p.startsWith('/assets/') || p.startsWith('/icons/') || p.startsWith('/brand/')) return 'cache-first';
  return 'bypass';
}
