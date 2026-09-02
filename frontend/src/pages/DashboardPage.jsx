import React from 'react';
import KPICards from '../components/KPICards';
import ChartsSection from '../components/ChartsSection';
import CampaignsTable from '../components/CampaignsTable';

export default function DashboardPage({ summary, dailyData, platformBreakdown, campaigns, loading }) {
  if (loading) {
    return (
      <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
        Carregando dados do painel...
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fff' }}>
          Visão Geral das Campanhas
        </h1>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          Acompanhamento em tempo real de tráfego pago (Google Ads & Meta Ads)
        </p>
      </div>

      {/* KPI Highlights */}
      <KPICards summary={summary} />

      {/* Dynamic Interactive Charts */}
      <ChartsSection dailyData={dailyData} platformBreakdown={platformBreakdown} />

      {/* Individual Campaigns Table */}
      <CampaignsTable campaigns={campaigns} />
    </div>
  );
}
