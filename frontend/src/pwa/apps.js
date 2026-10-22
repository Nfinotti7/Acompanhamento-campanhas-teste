// Os 3 "apps" que o mesmo frontend serve. Cada um vira um PWA instalável próprio.
export const APPS = {
  further: { key: 'further', title: 'Further Ads', appleTitle: 'Further' },
  // O Caixa virou Balcão (22/10). A chave interna continua 'caixa' (login salvo, ícones,
  // notificações), só o nome e o endereço mudaram.
  caixa: { key: 'caixa', title: 'Balcão', appleTitle: 'Balcão' },
  namesa: { key: 'namesa', title: 'Na Mesa', appleTitle: 'Na Mesa' }
};

function withFiles(app, manifestName = app.key) {
  return {
    ...app,
    manifest: `/${manifestName}.webmanifest`,
    appleIcon: `/icons/${app.key}-apple-180.png`,
    favicon: `/icons/${app.key}-favicon-32.png`
  };
}

// O dashboard mora em /painel, e não em /. Um app instalado com escopo "/" engloba /caixa e
// /namesa: o Android abre o Caixa dentro do app do Further e diz que o Caixa "já está instalado".
export const FURTHER_PATH = '/painel';

export const BALCAO_PATH = '/balcao';

function isUnder(p, base) {
  return p === base || p.startsWith(`${base}/`);
}

// Endereço pra onde a página deve ir (null = fica onde está).
// - A raiz vai pro /painel.
// - /balcão (com til) vai pro /balcao.
// - /caixa no navegador vai pro /balcao. O app do Caixa já instalado (standalone) fica no
//   /caixa: é o endereço que ele guardou, e sair do escopo dele abriria a barra do navegador.
export function canonicalPath(pathname, { standalone = false } = {}) {
  if (!pathname || pathname === '/') return FURTHER_PATH;
  let p = pathname;
  try { p = decodeURIComponent(pathname); } catch { /* endereço malformado: usa como veio */ }
  if (isUnder(p, '/balcão')) return BALCAO_PATH;
  if (isUnder(p, '/caixa') && !standalone) return BALCAO_PATH;
  return null;
}

export function appForPath(pathname) {
  const p = pathname || '/';
  if (isUnder(p, BALCAO_PATH)) return withFiles(APPS.caixa, 'balcao');
  if (isUnder(p, '/caixa')) return withFiles(APPS.caixa);
  if (p === '/namesa' || p.startsWith('/namesa/')) return withFiles(APPS.namesa);
  return withFiles(APPS.further);
}
