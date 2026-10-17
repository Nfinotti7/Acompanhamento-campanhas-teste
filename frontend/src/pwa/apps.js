// Os 3 "apps" que o mesmo frontend serve. Cada um vira um PWA instalável próprio.
export const APPS = {
  further: { key: 'further', title: 'Further Ads', appleTitle: 'Further' },
  caixa: { key: 'caixa', title: 'Caixa', appleTitle: 'Caixa' },
  namesa: { key: 'namesa', title: 'Na Mesa', appleTitle: 'Na Mesa' }
};

function withFiles(app) {
  return {
    ...app,
    manifest: `/${app.key}.webmanifest`,
    appleIcon: `/icons/${app.key}-apple-180.png`,
    favicon: `/icons/${app.key}-favicon-32.png`
  };
}

// O dashboard mora em /painel, e não em /. Um app instalado com escopo "/" engloba /caixa e
// /namesa: o Android abre o Caixa dentro do app do Further e diz que o Caixa "já está instalado".
export const FURTHER_PATH = '/painel';

// Endereço pra onde a raiz deve ir (null = fica onde está).
export function canonicalPath(pathname) {
  return !pathname || pathname === '/' ? FURTHER_PATH : null;
}

export function appForPath(pathname) {
  const p = pathname || '/';
  if (p === '/caixa' || p.startsWith('/caixa/')) return withFiles(APPS.caixa);
  if (p === '/namesa' || p.startsWith('/namesa/')) return withFiles(APPS.namesa);
  return withFiles(APPS.further);
}
