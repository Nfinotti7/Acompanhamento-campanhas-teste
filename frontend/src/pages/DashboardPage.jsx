import React from 'react';
import { Target } from 'lucide-react';
import KPICards from '../components/KPICards';
import ChartsSection from '../components/ChartsSection';
import CampaignsTable from '../components/CampaignsTable';

export default function DashboardPage({
  summary,
  dailyData,
  platformBreakdown,
  campaigns,
  loading,
  selectedCampaignId,
  setSelectedCampaignId
}) {
  const isCampaignMode = Boolean(selectedCampaignId);
  const activeCampaign = campaigns.find((c) => String(c.id) === String(selectedCampaignId));

  if (loading || !summary) {
    return (
      <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
        Carregando dados do painel...
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fff' }}>
            {isCampaignMode ? activeCampaign?.campaign_name || 'Campanha Selecionada' : 'Visão Geral das Campanhas'}
          </h1>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            {isCampaignMode
              ? 'Métricas isoladas desta campanha'
              : 'Acompanhamento em tempo real de tráfego pago (Google Ads & Meta Ads)'}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Target size={16} color="var(--text-secondary)" />
          <select
            value={selectedCampaignId || ''}
            onChange={(e) => setSelectedCampaignId(e.target.value || null)}
            className="form-select"
            style={{ minWidth: '260px', fontSize: '0.85rem', padding: '8px 12px' }}
          >
            <option value="">Todas as campanhas</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.campaign_name} ({c.platform === 'google' ? 'Google' : 'Meta'})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* KPI Highlights */}
      <KPICards summary={summary} />

      {/* Dynamic Interactive Charts */}
      <ChartsSection dailyData={dailyData} platformBreakdown={platformBreakdown} hidePlatformBreakdown={isCampaignMode} />

      {/* Individual Campaigns Table (hidden while drilled into a single campaign) */}
      {!isCampaignMode && <CampaignsTable campaigns={campaigns} />}
    </div>
  );
}
