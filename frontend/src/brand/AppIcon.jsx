import React from 'react';

// Ícone de cada app em SVG (mesmo desenho dos PNG gerados por scripts/generate_icons.py).
export default function AppIcon({ app, size = 40 }) {
  if (app === 'further') {
    return <img src="/icons/further-192.png" alt="" width={size} height={size} style={{ borderRadius: size * 0.22 }} />;
  }
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <rect width="100" height="100" rx="22" fill="var(--brand-navy)" />
      {app === 'caixa' ? (
        <>
          <rect x="19" y="20" width="62" height="45" rx="12" fill="var(--brand-teal)" />
          <polygon points="31,64 30,78 45,64" fill="var(--brand-teal)" />
          {[36, 50, 64].map((cx) => <circle key={cx} cx={cx} cy="42.5" r="4" fill="var(--on-accent)" />)}
        </>
      ) : (
        <>
          <circle cx="50" cy="50" r="19" fill="var(--brand-teal)" />
          <circle cx="50" cy="50" r="13" fill="none" stroke="var(--on-accent)" strokeWidth="2.2" />
          <rect x="23" y="31" width="2.8" height="38" rx="1.4" fill="var(--on-accent)" />
          <rect x="20" y="31" width="1.4" height="10" rx="0.7" fill="var(--on-accent)" />
          <rect x="27.4" y="31" width="1.4" height="10" rx="0.7" fill="var(--on-accent)" />
          <rect x="74.2" y="48" width="2.8" height="21" rx="1.4" fill="var(--on-accent)" />
          <path d="M75.6 31 a4 9 0 0 1 0 19 z" fill="var(--on-accent)" />
        </>
      )}
    </svg>
  );
}
