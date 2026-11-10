import React from 'react';
import { DollarSign, MousePointerClick, Eye, ShoppingCart, TrendingUp, Award, Target, Percent, CalendarHeart } from 'lucide-react';

export default function KPICards({ summary }) {
  if (!summary) return null;

  const cards = [
    {
      title: 'Investimento Total',
      value: `R$ ${summary.spend.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      icon: DollarSign,
      color: 'var(--accent-primary)',
      bgGlow: 'color-mix(in srgb, var(--accent-primary) 12%, transparent)',
      subtext: `CPM Médio: R$ ${summary.cpm.toFixed(2)}`
    },
    {
      title: 'Conversões',
      value: summary.conversions.toLocaleString('pt-BR'),
      icon: ShoppingCart,
      color: 'var(--accent-success)',
      bgGlow: 'color-mix(in srgb, var(--accent-success) 12%, transparent)',
      subtext: 'Resultados informados pela plataforma'
    },
    {
      title: 'Total de Cliques',
      value: summary.clicks.toLocaleString('pt-BR'),
      icon: MousePointerClick,
      color: 'var(--chart-2)',
      bgGlow: 'color-mix(in srgb, var(--accent-google) 12%, transparent)',
      subtext: `CPC Médio: R$ ${summary.cpc.toFixed(2)}`
    },
    {
      title: 'Taxa de Cliques (CTR)',
      value: `${summary.ctr.toFixed(2)}%`,
      icon: Percent,
      color: 'var(--chart-5)',
      bgGlow: 'color-mix(in srgb, var(--chart-5) 12%, transparent)',
      subtext: `${summary.impressions.toLocaleString('pt-BR')} Impressões`
    }
  ];

  // Só aparece pra quem tem campanha de eventos com contatos no período.
  const eventContacts = Number(summary.event_contacts) || 0;
  if (eventContacts > 0) {
    const costPer = Number(summary.cost_per_event_contact) || 0;
    cards.push({
      title: 'Contatos de eventos',
      value: eventContacts.toLocaleString('pt-BR'),
      icon: CalendarHeart,
      color: 'var(--chart-3)',
      bgGlow: 'color-mix(in srgb, var(--chart-3) 12%, transparent)',
      subtext: `Cliques no WhatsApp de eventos · R$ ${costPer.toFixed(2)} cada`
    });
  }

  return (
    <div className="kpi-grid" style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
      gap: '20px',
      marginBottom: '32px'
    }}>
      {cards.map((card, idx) => {
        const Icon = card.icon;
        return (
          <div
            key={idx}
            className="glass-card"
            style={{
              padding: '20px',
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between'
            }}
          >
            {/* Background Glow */}
            <div style={{
              position: 'absolute',
              top: '-20px',
              right: '-20px',
              width: '90px',
              height: '90px',
              borderRadius: '50%',
              backgroundColor: card.bgGlow,
              filter: 'blur(20px)',
              pointerEvents: 'none'
            }} />

            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  {card.title}
                </span>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: card.bgGlow,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Icon size={18} color={card.color} />
                </div>
              </div>

              <h3 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '4px' }}>
                {card.value}
              </h3>
            </div>

            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '8px', fontWeight: 500 }}>
              {card.subtext}
            </div>
          </div>
        );
      })}
    </div>
  );
}
