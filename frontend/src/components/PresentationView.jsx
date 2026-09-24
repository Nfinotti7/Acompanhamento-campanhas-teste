import React, { useState, useEffect } from 'react';
import { 
  X, ChevronLeft, ChevronRight, Download, Printer, 
  Building2, Calendar, Target, DollarSign, MousePointerClick, 
  ShoppingCart, TrendingUp, Percent, Award, BarChart2, PieChart as PieIcon, LineChart as LineIcon
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend } from 'recharts';

export default function PresentationView({ 
  clientName, 
  selectedRange, 
  selectedPlatform, 
  summary, 
  dailyData = [], 
  platformBreakdown = [], 
  campaigns = [], 
  onClose,
  onExportPDF
}) {
  const [currentSlide, setCurrentSlide] = useState(0);

  const totalSlides = 5;

  const rangeLabels = {
    today: 'Hoje',
    '7d': 'Últimos 7 dias',
    '30d': 'Últimos 30 dias',
    this_month: 'Este Mês'
  };

  const formattedRange = rangeLabels[selectedRange] || selectedRange;
  const todayDate = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'Space') {
        setCurrentSlide(prev => Math.min(prev + 1, totalSlides - 1));
      } else if (e.key === 'ArrowLeft') {
        setCurrentSlide(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const platformDataFormatted = platformBreakdown.map(p => ({
    name: p.platform === 'google' ? 'Google Ads' : 'Meta Ads',
    value: p.spend,
    conversions: p.conversions,
    color: p.platform === 'google' ? '#4285f4' : '#0084ff'
  }));

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      backgroundColor: '#070a12',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      color: '#f8fafc',
      overflow: 'hidden',
      fontFamily: "'Inter', sans-serif"
    }}>
      {/* Presentation Top Bar */}
      <header style={{
        height: '64px',
        padding: '0 32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        backgroundColor: 'rgba(15, 22, 39, 0.9)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
            padding: '6px 14px',
            borderRadius: '8px',
            fontWeight: 800,
            fontSize: '0.95rem',
            letterSpacing: '0.05em'
          }}>
            AGÊNCIA FURTHER
          </div>
          <span style={{ color: 'rgba(255, 255, 255, 0.3)' }}>|</span>
          <span style={{ fontSize: '1rem', fontWeight: 600, color: '#e2e8f0' }}>
            {clientName || 'Relatório de Desempenho'}
          </span>
        </div>

        {/* Slide navigation controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 600 }}>
            Slide {currentSlide + 1} de {totalSlides}
          </span>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={() => setCurrentSlide(prev => Math.max(prev - 1, 0))}
              disabled={currentSlide === 0}
              className="btn btn-secondary"
              style={{ padding: '6px 12px', opacity: currentSlide === 0 ? 0.4 : 1 }}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={() => setCurrentSlide(prev => Math.min(prev + 1, totalSlides - 1))}
              disabled={currentSlide === totalSlides - 1}
              className="btn btn-secondary"
              style={{ padding: '6px 12px', opacity: currentSlide === totalSlides - 1 ? 0.4 : 1 }}
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <button
            onClick={onExportPDF}
            className="btn btn-primary"
            style={{ fontSize: '0.82rem', padding: '6px 14px' }}
          >
            <Download size={15} /> Baixar PDF
          </button>

          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              color: '#fff',
              borderRadius: '8px',
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <X size={20} />
          </button>
        </div>
      </header>

      {/* Main Slide Stage */}
      <main style={{
        flex: 1,
        padding: '40px 60px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        position: 'relative'
      }}>

        {/* SLIDE 1: Cover & Executive Overview */}
        {currentSlide === 0 && (
          <div className="animate-fade-in" style={{ maxWidth: '1100px', margin: '0 auto', width: '100%' }}>
            <div style={{
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(15, 22, 39, 0.8) 100%)',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              borderRadius: '24px',
              padding: '48px',
              boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
            }}>
              <div style={{ display: 'inline-block', padding: '6px 16px', borderRadius: '20px', backgroundColor: 'rgba(99, 102, 241, 0.2)', color: '#818cf8', fontWeight: 700, fontSize: '0.85rem', marginBottom: '20px' }}>
                RELATÓRIO DE PERFORMANCE DE TRÁFEGO PAGO
              </div>
              <h1 style={{ fontSize: '3.2rem', fontWeight: 900, color: '#fff', lineHeight: 1.1, marginBottom: '16px' }}>
                {clientName ? clientName : 'Visão Geral das Campanhas'}
              </h1>
              <p style={{ fontSize: '1.2rem', color: '#94a3b8', marginBottom: '36px', maxWidth: '700px' }}>
                Acompanhamento executivo de resultados em Google Ads e Meta Ads referente ao período de <strong>{formattedRange}</strong>.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginTop: '32px' }}>
                <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.04)', borderRadius: '16px', padding: '20px', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '6px' }}>Investimento Total</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#6366f1' }}>
                    R$ {summary?.spend?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </div>
                </div>

                <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.04)', borderRadius: '16px', padding: '20px', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '6px' }}>Conversões Geradas</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#10b981' }}>
                    {summary?.conversions?.toLocaleString('pt-BR')}
                  </div>
                </div>

                <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.04)', borderRadius: '16px', padding: '20px', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '6px' }}>Custo / Conversão (CPA)</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#f59e0b' }}>
                    R$ {summary?.cpa?.toFixed(2)}
                  </div>
                </div>

                <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.04)', borderRadius: '16px', padding: '20px', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '6px' }}>ROAS Obtido</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#a855f7' }}>
                    {summary?.roas?.toFixed(2)}x
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '40px', paddingTop: '20px', borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: '0.85rem', color: '#64748b' }}>
                <div>Gerado em: {todayDate}</div>
                <div>Agência Further • Intelligence & Performance</div>
              </div>
            </div>
          </div>
        )}

        {/* SLIDE 2: Key Metric Cards Grid */}
        {currentSlide === 1 && (
          <div className="animate-fade-in" style={{ maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
            <div style={{ marginBottom: '32px' }}>
              <h2 style={{ fontSize: '2.2rem', fontWeight: 800, color: '#fff' }}>
                Resumo de Métricas e Performance KPI
              </h2>
              <p style={{ color: '#94a3b8', fontSize: '1rem' }}>
                Consolidado de eficiência, investimento e retorno de vendas/leads
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px' }}>
              <div className="glass-card" style={{ padding: '28px', backgroundColor: 'rgba(19, 27, 46, 0.9)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <span style={{ fontSize: '0.9rem', color: '#94a3b8', fontWeight: 600 }}>Investimento Total</span>
                  <DollarSign size={24} color="#6366f1" />
                </div>
                <div style={{ fontSize: '2.4rem', fontWeight: 900, color: '#fff', marginBottom: '8px' }}>
                  R$ {summary?.spend?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: '0.85rem', color: '#64748b' }}>CPM Médio: R$ {summary?.cpm?.toFixed(2)}</div>
              </div>

              <div className="glass-card" style={{ padding: '28px', backgroundColor: 'rgba(19, 27, 46, 0.9)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <span style={{ fontSize: '0.9rem', color: '#94a3b8', fontWeight: 600 }}>Total de Conversões</span>
                  <ShoppingCart size={24} color="#10b981" />
                </div>
                <div style={{ fontSize: '2.4rem', fontWeight: 900, color: '#10b981', marginBottom: '8px' }}>
                  {summary?.conversions?.toLocaleString('pt-BR')}
                </div>
                <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Receita: R$ {summary?.conversion_value?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
              </div>

              <div className="glass-card" style={{ padding: '28px', backgroundColor: 'rgba(19, 27, 46, 0.9)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <span style={{ fontSize: '0.9rem', color: '#94a3b8', fontWeight: 600 }}>Custo por Conversão (CPA)</span>
                  <Target size={24} color="#f59e0b" />
                </div>
                <div style={{ fontSize: '2.4rem', fontWeight: 900, color: '#f59e0b', marginBottom: '8px' }}>
                  R$ {summary?.cpa?.toFixed(2)}
                </div>
                <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Custo por aquisição efetuada</div>
              </div>

              <div className="glass-card" style={{ padding: '28px', backgroundColor: 'rgba(19, 27, 46, 0.9)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <span style={{ fontSize: '0.9rem', color: '#94a3b8', fontWeight: 600 }}>ROAS (Retorno em Vendas)</span>
                  <TrendingUp size={24} color="#a855f7" />
                </div>
                <div style={{ fontSize: '2.4rem', fontWeight: 900, color: '#a855f7', marginBottom: '8px' }}>
                  {summary?.roas?.toFixed(2)}x
                </div>
                <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Faturamento sobre cada R$ 1 investido</div>
              </div>

              <div className="glass-card" style={{ padding: '28px', backgroundColor: 'rgba(19, 27, 46, 0.9)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <span style={{ fontSize: '0.9rem', color: '#94a3b8', fontWeight: 600 }}>Volume de Cliques</span>
                  <MousePointerClick size={24} color="#3b82f6" />
                </div>
                <div style={{ fontSize: '2.4rem', fontWeight: 900, color: '#fff', marginBottom: '8px' }}>
                  {summary?.clicks?.toLocaleString('pt-BR')}
                </div>
                <div style={{ fontSize: '0.85rem', color: '#64748b' }}>CPC Médio: R$ {summary?.cpc?.toFixed(2)}</div>
              </div>

              <div className="glass-card" style={{ padding: '28px', backgroundColor: 'rgba(19, 27, 46, 0.9)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <span style={{ fontSize: '0.9rem', color: '#94a3b8', fontWeight: 600 }}>Taxa de Cliques (CTR)</span>
                  <Percent size={24} color="#ec4899" />
                </div>
                <div style={{ fontSize: '2.4rem', fontWeight: 900, color: '#ec4899', marginBottom: '8px' }}>
                  {summary?.ctr?.toFixed(2)}%
                </div>
                <div style={{ fontSize: '0.85rem', color: '#64748b' }}>{summary?.impressions?.toLocaleString('pt-BR')} impressões geradas</div>
              </div>
            </div>
          </div>
        )}

        {/* SLIDE 3: Trend & Daily Evolution Chart */}
        {currentSlide === 2 && (
          <div className="animate-fade-in" style={{ maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
            <div style={{ marginBottom: '24px' }}>
              <h2 style={{ fontSize: '2.2rem', fontWeight: 800, color: '#fff' }}>
                Evolução Diária de Tráfego e Conversões
              </h2>
              <p style={{ color: '#94a3b8', fontSize: '1rem' }}>
                Comportamento cronológico de investimento e resultados
              </p>
            </div>

            <div className="glass-card" style={{ padding: '32px', backgroundColor: 'rgba(19, 27, 46, 0.9)' }}>
              <div style={{ width: '100%', height: '420px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailyData} margin={{ top: 20, right: 30, left: 10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="presSpend" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="presConv" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 12 }} />
                    <YAxis yAxisId="left" stroke="#6366f1" tick={{ fontSize: 12 }} tickFormatter={(v) => `R$${v}`} />
                    <YAxis yAxisId="right" orientation="right" stroke="#10b981" tick={{ fontSize: 12 }} />
                    <Tooltip contentStyle={{ backgroundColor: '#0f1627', borderColor: '#6366f1', borderRadius: '8px' }} />
                    <Legend />
                    <Area yAxisId="left" type="monotone" dataKey="spend" name="Investimento (R$)" stroke="#6366f1" strokeWidth={3} fill="url(#presSpend)" />
                    <Area yAxisId="right" type="monotone" dataKey="conversions" name="Conversões" stroke="#10b981" strokeWidth={3} fill="url(#presConv)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* SLIDE 4: Channel Comparison (Google vs Meta) */}
        {currentSlide === 3 && (
          <div className="animate-fade-in" style={{ maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
            <div style={{ marginBottom: '32px' }}>
              <h2 style={{ fontSize: '2.2rem', fontWeight: 800, color: '#fff' }}>
                Divisão de Canais: Google Ads vs Meta Ads
              </h2>
              <p style={{ color: '#94a3b8', fontSize: '1rem' }}>
                Distribuição de verba e geração de conversões por mídia
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
              {/* Donut chart */}
              <div className="glass-card" style={{ padding: '32px', backgroundColor: 'rgba(19, 27, 46, 0.9)' }}>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '20px', color: '#fff' }}>
                  Proporção de Investimento (R$)
                </h3>
                <div style={{ width: '100%', height: '300px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={platformDataFormatted}
                        cx="50%"
                        cy="50%"
                        innerRadius={70}
                        outerRadius={105}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {platformDataFormatted.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(val) => `R$ ${val.toFixed(2)}`} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Platform Cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {platformBreakdown.map((p) => {
                  const isGoogle = p.platform === 'google';
                  return (
                    <div
                      key={p.platform}
                      className="glass-card"
                      style={{
                        padding: '24px',
                        borderLeft: isGoogle ? '4px solid #4285f4' : '4px solid #0084ff',
                        backgroundColor: 'rgba(19, 27, 46, 0.9)'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h3 style={{ fontSize: '1.4rem', fontWeight: 800, color: isGoogle ? '#60a5fa' : '#38bdf8' }}>
                          {isGoogle ? 'Google Ads' : 'Meta Ads'}
                        </h3>
                        <span className={isGoogle ? 'badge badge-google' : 'badge badge-meta'}>
                          {p.campaignsCount || p.campaigns_count || 0} campanhas
                        </span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                        <div>
                          <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Investimento</div>
                          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#fff' }}>
                            R$ {p.spend.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </div>
                        </div>

                        <div>
                          <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Conversões</div>
                          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#10b981' }}>
                            {p.conversions.toLocaleString('pt-BR')}
                          </div>
                        </div>

                        <div>
                          <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>CPA Médio</div>
                          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#f59e0b' }}>
                            R$ {(p.conversions > 0 ? p.spend / p.conversions : 0).toFixed(2)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* SLIDE 5: Top Campaigns Table */}
        {currentSlide === 4 && (
          <div className="animate-fade-in" style={{ maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
            <div style={{ marginBottom: '24px' }}>
              <h2 style={{ fontSize: '2.2rem', fontWeight: 800, color: '#fff' }}>
                Tabela de Campanhas em Destaque
              </h2>
              <p style={{ color: '#94a3b8', fontSize: '1rem' }}>
                Resultados granulares das principais iniciativas ativas no período
              </p>
            </div>

            <div className="glass-card" style={{ padding: '24px', backgroundColor: 'rgba(19, 27, 46, 0.9)' }}>
              <div style={{ maxHeight: '420px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8' }}>
                      <th style={{ padding: '12px' }}>Campanha</th>
                      <th style={{ padding: '12px' }}>Canal</th>
                      <th style={{ padding: '12px', textAlign: 'right' }}>Investimento</th>
                      <th style={{ padding: '12px', textAlign: 'right' }}>Cliques</th>
                      <th style={{ padding: '12px', textAlign: 'right' }}>CTR</th>
                      <th style={{ padding: '12px', textAlign: 'right' }}>Conversões</th>
                      <th style={{ padding: '12px', textAlign: 'right' }}>CPA</th>
                      <th style={{ padding: '12px', textAlign: 'right' }}>ROAS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map((c) => (
                      <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '12px', fontWeight: 600, color: '#fff' }}>
                          {c.campaign_name}
                        </td>
                        <td style={{ padding: '12px' }}>
                          <span className={c.platform === 'google' ? 'badge badge-google' : 'badge badge-meta'}>
                            {c.platform === 'google' ? 'Google' : 'Meta'}
                          </span>
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: '#fff' }}>
                          R$ {c.total_spend.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right', color: '#94a3b8' }}>
                          {c.total_clicks.toLocaleString('pt-BR')}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right', color: '#94a3b8' }}>
                          {c.ctr}%
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: '#10b981' }}>
                          {c.total_conversions}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right', color: '#f59e0b' }}>
                          R$ {c.cpa.toFixed(2)}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: '#a855f7' }}>
                          {c.roas}x
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* Presentation Footer */}
      <footer style={{
        height: '40px',
        padding: '0 32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
        fontSize: '0.78rem',
        color: '#64748b',
        backgroundColor: 'rgba(11, 15, 25, 0.95)'
      }}>
        <div>Dica: Use as setas ⬅️ ➡️ do teclado para trocar de slide e Esc para sair.</div>
        <div>Agência Further Ads • Plataforma Oficial de Acompanhamento</div>
      </footer>
    </div>
  );
}
