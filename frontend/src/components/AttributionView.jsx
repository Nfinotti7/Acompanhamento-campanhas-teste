import React from 'react';

export const ORIGIN_META = {
  meta_ads: { label: 'Meta Ads', color: '#3b82f6' },
  google_ads: { label: 'Google Ads', color: '#10b981' },
  outras: { label: 'Outras Origens', color: '#94a3b8' },
  nao_rastreada: { label: 'Não rastreada', color: '#f59e0b' }
};

const METHOD_LABELS = {
  ctwa: 'Campanha de Mensagem do Meta Ads',
  link: 'Link Rastreável'
};

function Row({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '170px 1fr', gap: '12px', padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '0.82rem' }}>
      <div style={{ color: '#94a3b8' }}>{label}</div>
      <div style={{ color: '#fff', wordBreak: 'break-word' }}>{value}</div>
    </div>
  );
}

export function OriginBadge({ origin }) {
  const meta = ORIGIN_META[origin] || ORIGIN_META.nao_rastreada;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: meta.color }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: meta.color }} />
      {meta.label}
    </span>
  );
}

export default function AttributionView({ data }) {
  if (!data) return <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Carregando...</p>;
  if (data.error) return <p style={{ color: '#f87171', fontSize: '0.85rem' }}>Não foi possível carregar a origem.</p>;

  const firstSeen = data.firstSeenAt ? new Date(data.firstSeenAt).toLocaleString('pt-BR') : null;

  return (
    <div>
      <Row label="Origem" value={<OriginBadge origin={data.origin} />} />
      <Row label="Método de rastreamento" value={METHOD_LABELS[data.trackingMethod]} />
      <Row label="Conta de anúncio" value={data.accountName} />
      <Row label="Campanha" value={data.campaignName} />
      <Row label="Conjunto de anúncios" value={data.adsetName} />
      <Row label="Anúncio" value={data.adName || (data.adId && !data.campaignName ? `ID ${data.adId} (nome indisponível)` : null)} />
      <Row label="Título do anúncio" value={data.adHeadline} />
      <Row label="Link do anúncio" value={data.adSourceUrl && <a href={data.adSourceUrl} target="_blank" rel="noreferrer" style={{ color: '#a5b4fc' }}>Abrir anúncio</a>} />
      {data.link && (
        <>
          <Row label="Link" value={data.link.name} />
          <Row label="Clique no link" value={new Date(data.link.clickedAt).toLocaleString('pt-BR')} />
          <Row label="utm_source" value={data.link.utmSource} />
          <Row label="utm_medium" value={data.link.utmMedium} />
          <Row label="utm_campaign" value={data.link.utmCampaign} />
          <Row label="utm_content" value={data.link.utmContent} />
          <Row label="utm_term" value={data.link.utmTerm} />
          <Row label="ID de clique" value={[data.link.hasFbclid && 'fbclid (Meta)', data.link.hasGclid && 'gclid (Google)'].filter(Boolean).join(', ')} />
        </>
      )}
      <Row label="Mensagem inicial" value={data.initialMessage} />
      <Row label="Primeiro contato" value={firstSeen} />

      {data.origin === 'nao_rastreada' && (
        <p style={{ marginTop: '14px', fontSize: '0.78rem', color: '#94a3b8', lineHeight: 1.5 }}>
          Essa conversa não chegou por um anúncio Clique para WhatsApp nem por um Link Rastreável.
          Pra rastrear Google, Instagram orgânico, site e outras origens, use um Link Rastreável
          (menu "Links e Conversões").
        </p>
      )}
    </div>
  );
}
