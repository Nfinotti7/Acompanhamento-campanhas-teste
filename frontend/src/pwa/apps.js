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

export function appForPath(pathname) {
  const p = pathname || '/';
  if (p === '/caixa' || p.startsWith('/caixa/')) return withFiles(APPS.caixa);
  if (p === '/namesa' || p.startsWith('/namesa/')) return withFiles(APPS.namesa);
  return withFiles(APPS.further);
}
