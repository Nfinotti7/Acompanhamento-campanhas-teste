import React, { useState, useEffect, useRef } from 'react';
import {
  X, ChevronLeft, ChevronRight, Download, Printer,
  Building2, Calendar, Target, DollarSign, MousePointerClick,
  ShoppingCart, TrendingUp, Percent, Award, BarChart2, PieChart as PieIcon, LineChart as LineIcon
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend } from 'recharts';
import html2canvas from 'html2canvas';
import { useTheme, resolveCssColorFor } from '../theme/useTheme';
import { legacyColorsInClone } from '../theme/legacyColors';
import { jsPDF } from 'jspdf';

export default function PresentationView({
  clientName,
  selectedRange,
  selectedPlatform,
  summary,
  dailyData = [],
  platformBreakdown = [],
  campaigns = [],
  onClose
}) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const stageRef = useRef(null);
  const { theme } = useTheme();
  const rc = (v) => resolveCssColorFor(v, theme);

  const totalSlides = 5;

  // Waits for React to commit the slide change and for chart layout (ResponsiveContainer)
  // to settle before a capture is taken — otherwise html2canvas can grab a blank SVG.
  const goToSlideAndSettle = (index) => new Promise((resolve) => {
    setCurrentSlide(index);
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 350)));
  });

  const handleExportPDF = async () => {
    if (!stageRef.current || isExporting) return;
    setIsExporting(true);
    const originalSlide = currentSlide;
    try {
      const pdf = new jsPDF('l', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();

      for (let i = 0; i < totalSlides; i++) {
        await goToSlideAndSettle(i);

        const canvas = await html2canvas(stageRef.current, {
          scale: 2,
          useCORS: true,
          backgroundColor: rc('var(--bg-dark)'),
          onclone: (doc, el) => legacyColorsInClone(el || doc.body),
          logging: false
        });

        const imgData = canvas.toDataURL('image/png');
        const scale = Math.min(pdfWidth / canvas.width, pdfHeight / canvas.height);
        const imgWidth = canvas.width * scale;
        const imgHeight = canvas.height * scale;
        const x = (pdfWidth - imgWidth) / 2;
        const y = (pdfHeight - imgHeight) / 2;

        if (i > 0) pdf.addPage();
        pdf.addImage(imgData, 'PNG', x, y, imgWidth, imgHeight);
      }

      const fileName = `Apresentacao_${(clientName || 'Geral').replace(/\s+/g, '_')}_${selectedRange}.pdf`;
      pdf.save(fileName);
    } catch (err) {
      console.error('Erro ao gerar PDF da apresentação:', err);
      alert('Houve um problema ao gerar o PDF da apresentação. Tente novamente.');
    } finally {
      await goToSlideAndSettle(originalSlide);
      setIsExporting(false);
    }
  };

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
    color: p.platform === 'google' ? 'var(--accent-google)' : 'var(--accent-meta)'
  }));

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      backgroundColor: 'var(--bg-dark)',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      color: 'var(--text-primary)',
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
        borderBottom: '1px solid var(--border-color)',
        backgroundColor: 'var(--glass-bg)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            background: 'linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-primary-hover) 100%)',
            padding: '6px 14px',
            borderRadius: '8px',
            fontWeight: 800,
            fontSize: '0.95rem',
            letterSpacing: '0.05em'
          }}>
            AGÊNCIA FURTHER
          </div>
          <span style={{ color: 'color-mix(in srgb, var(--on-accent) 30%, transparent)' }}>|</span>
          <span style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            {clientName || 'Relatório de Desempenho'}
          </span>
        </div>

        {/* Slide navigation controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
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
            onClick={handleExportPDF}
            disabled={isExporting}
            className="btn btn-primary"
            style={{ fontSize: '0.82rem', padding: '6px 14px' }}
          >
            <Download size={15} /> {isExporting ? 'Gerando PDF...' : 'Baixar PDF'}
          </button>

          <button
            onClick={onClose}
            style={{
              background: 'var(--border-color)',
              border: 'none',
              color: 'var(--text-primary)',
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
      <main ref={stageRef} style={{
        flex: 1,
        padding: '40px 60px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        position: 'relative',
        backgroundColor: 'var(--bg-dark)'
      }}>

        {/* SLIDE 1: Cover & Executive Overview */}
        {currentSlide === 0 && (
          <div className="animate-fade-in" style={{ maxWidth: '1100px', margin: '0 auto', width: '100%' }}>
            <div style={{
              background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent-primary) 15%, transparent) 0%, var(--glass-bg) 100%)',
              border: '1px solid color-mix(in srgb, var(--accent-primary) 30%, transparent)',
              borderRadius: '24px',
              padding: '48px',
              boxShadow: '0 20px 50px var(--overlay)'
            }}>
              <div style={{ display: 'inline-block', padding: '6px 16px', borderRadius: '20px', backgroundColor: 'color-mix(in srgb, var(--accent-primary) 20%, transparent)', color: 'var(--accent-primary)', fontWeight: 700, fontSize: '0.85rem', marginBottom: '20px' }}>
                RELATÓRIO DE PERFORMANCE DE TRÁFEGO PAGO
              </div>
              <h1 style={{ fontSize: '3.2rem', fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1.1, marginBottom: '16px' }}>
                {clientName ? clientName : 'Visão Geral das Campanhas'}
              </h1>
              <p style={{ fontSize: '1.2rem', color: 'var(--text-secondary)', marginBottom: '36px', maxWidth: '700px' }}>
                Acompanhamento executivo de resultados em Google Ads e Meta Ads referente ao período de <strong>{formattedRange}</strong>.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginTop: '32px' }}>
                <div style={{ backgroundColor: 'var(--border-color)', borderRadius: '16px', padding: '20px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Investimento Total</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--accent-primary)' }}>
                    R$ {summary?.spend?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </div>
                </div>

                <div style={{ backgroundColor: 'var(--border-color)', borderRadius: '16px', padding: '20px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Conversões Geradas</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--accent-success)' }}>
                    {summary?.conversions?.toLocaleString('pt-BR')}
                  </div>
                </div>

                <div style={{ backgroundColor: 'var(--border-color)', borderRadius: '16px', padding: '20px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Custo / Conversão (CPA)</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--accent-warning)' }}>
                    R$ {summary?.cpa?.toFixed(2)}
                  </div>
                </div>

                <div style={{ backgroundColor: 'var(--border-color)', borderRadius: '16px', padding: '20px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>ROAS Obtido</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--chart-6)' }}>
                    {summary?.roas?.toFixed(2)}x
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '40px', paddingTop: '20px', borderTop: '1px solid var(--border-color)', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
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
              <h2 style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                Resumo de Métricas e Performance KPI
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '1rem' }}>
                Consolidado de eficiência, investimento e retorno de vendas/leads
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px' }}>
              <div className="glass-card" style={{ padding: '28px', backgroundColor: 'var(--glass-bg)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Investimento Total</span>
                  <DollarSign size={24} color="var(--accent-primary)" />
                </div>
                <div style={{ fontSize: '2.4rem', fontWeight: 900, color: 'var(--text-primary)', marginBottom: '8px' }}>
                  R$ {summary?.spend?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>CPM Médio: R$ {summary?.cpm?.toFixed(2)}</div>
              </div>

              <div className="glass-card" style={{ padding: '28px', backgroundColor: 'var(--glass-bg)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Total de Conversões</span>
                  <ShoppingCart size={24} color="var(--accent-success)" />
                </div>
                <div style={{ fontSize: '2.4rem', fontWeight: 900, color: 'var(--accent-success)', marginBottom: '8px' }}>
                  {summary?.conversions?.toLocaleString('pt-BR')}
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Receita: R$ {summary?.conversion_value?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
              </div>

              <div className="glass-card" style={{ padding: '28px', backgroundColor: 'var(--glass-bg)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Custo por Conversão (CPA)</span>
                  <Target size={24} color="var(--accent-warning)" />
                </div>
                <div style={{ fontSize: '2.4rem', fontWeight: 900, color: 'var(--accent-warning)', marginBottom: '8px' }}>
                  R$ {summary?.cpa?.toFixed(2)}
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Custo por aquisição efetuada</div>
              </div>

              <div className="glass-card" style={{ padding: '28px', backgroundColor: 'var(--glass-bg)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 600 }}>ROAS (Retorno em Vendas)</span>
                  <TrendingUp size={24} color="var(--chart-6)" />
                </div>
                <div style={{ fontSize: '2.4rem', fontWeight: 900, color: 'var(--chart-6)', marginBottom: '8px' }}>
                  {summary?.roas?.toFixed(2)}x
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Faturamento sobre cada R$ 1 investido</div>
              </div>

              <div className="glass-card" style={{ padding: '28px', backgroundColor: 'var(--glass-bg)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Volume de Cliques</span>
                  <MousePointerClick size={24} color="var(--chart-2)" />
                </div>
                <div style={{ fontSize: '2.4rem', fontWeight: 900, color: 'var(--text-primary)', marginBottom: '8px' }}>
                  {summary?.clicks?.toLocaleString('pt-BR')}
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>CPC Médio: R$ {summary?.cpc?.toFixed(2)}</div>
              </div>

              <div className="glass-card" style={{ padding: '28px', backgroundColor: 'var(--glass-bg)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Taxa de Cliques (CTR)</span>
                  <Percent size={24} color="var(--chart-5)" />
                </div>
                <div style={{ fontSize: '2.4rem', fontWeight: 900, color: 'var(--chart-5)', marginBottom: '8px' }}>
                  {summary?.ctr?.toFixed(2)}%
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{summary?.impressions?.toLocaleString('pt-BR')} impressões geradas</div>
              </div>
            </div>
          </div>
        )}

        {/* SLIDE 3: Trend & Daily Evolution Chart */}
        {currentSlide === 2 && (
          <div className="animate-fade-in" style={{ maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
            <div style={{ marginBottom: '24px' }}>
              <h2 style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                Evolução Diária de Tráfego e Conversões
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '1rem' }}>
                Comportamento cronológico de investimento e resultados
              </p>
            </div>

            <div className="glass-card" style={{ padding: '32px', backgroundColor: 'var(--glass-bg)' }}>
              <div style={{ width: '100%', height: '420px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailyData} margin={{ top: 20, right: 30, left: 10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="presSpend" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={rc('var(--accent-primary)')} stopOpacity={0.4} />
                        <stop offset="95%" stopColor={rc('var(--accent-primary)')} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="presConv" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={rc('var(--accent-success)')} stopOpacity={0.4} />
                        <stop offset="95%" stopColor={rc('var(--accent-success)')} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={rc('var(--border-color)')} />
                    <XAxis dataKey="date" stroke={rc('var(--text-muted)')} tick={{ fontSize: 12, fill: rc('var(--text-muted)') }} />
                    <YAxis yAxisId="left" stroke={rc('var(--accent-primary)')} tick={{ fontSize: 12, fill: rc('var(--text-muted)') }} tickFormatter={(v) => `R$${v}`} />
                    <YAxis yAxisId="right" orientation="right" stroke={rc('var(--accent-success)')} tick={{ fontSize: 12, fill: rc('var(--text-muted)') }} />
                    <Tooltip contentStyle={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--accent-primary)', borderRadius: '8px' }} />
                    <Legend />
                    <Area yAxisId="left" type="monotone" dataKey="spend" name="Investimento (R$)" stroke={rc('var(--accent-primary)')} strokeWidth={3} fill="url(#presSpend)" isAnimationActive={false} />
                    <Area yAxisId="right" type="monotone" dataKey="conversions" name="Conversões" stroke={rc('var(--accent-success)')} strokeWidth={3} fill="url(#presConv)" isAnimationActive={false} />
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
              <h2 style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                Divisão de Canais: Google Ads vs Meta Ads
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '1rem' }}>
                Distribuição de verba e geração de conversões por mídia
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
              {/* Donut chart */}
              <div className="glass-card" style={{ padding: '32px', backgroundColor: 'var(--glass-bg)' }}>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '20px', color: 'var(--text-primary)' }}>
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
                        isAnimationActive={false}
                      >
                        {platformDataFormatted.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={rc(entry.color)} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)' }} formatter={(val) => `R$ ${val.toFixed(2)}`} />
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
                        borderLeft: isGoogle ? '4px solid var(--accent-google)' : '4px solid var(--accent-meta)',
                        backgroundColor: 'var(--glass-bg)'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h3 style={{ fontSize: '1.4rem', fontWeight: 800, color: isGoogle ? 'var(--chart-2)' : 'var(--chart-1)' }}>
                          {isGoogle ? 'Google Ads' : 'Meta Ads'}
                        </h3>
                        <span className={isGoogle ? 'badge badge-google' : 'badge badge-meta'}>
                          {p.campaignsCount || p.campaigns_count || 0} campanhas
                        </span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                        <div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Investimento</div>
                          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                            R$ {p.spend.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </div>
                        </div>

                        <div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Conversões</div>
                          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--accent-success)' }}>
                            {p.conversions.toLocaleString('pt-BR')}
                          </div>
                        </div>

                        <div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>CPA Médio</div>
                          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--accent-warning)' }}>
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
              <h2 style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                Tabela de Campanhas em Destaque
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '1rem' }}>
                Resultados granulares das principais iniciativas ativas no período
              </p>
            </div>

            <div className="glass-card" style={{ padding: '24px', backgroundColor: 'var(--glass-bg)' }}>
              <div style={{ maxHeight: '420px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
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
                      <tr key={c.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {c.campaign_name}
                        </td>
                        <td style={{ padding: '12px' }}>
                          <span className={c.platform === 'google' ? 'badge badge-google' : 'badge badge-meta'}>
                            {c.platform === 'google' ? 'Google' : 'Meta'}
                          </span>
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)' }}>
                          R$ {c.total_spend.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                          {c.total_clicks.toLocaleString('pt-BR')}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                          {c.ctr}%
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: 'var(--accent-success)' }}>
                          {c.total_conversions}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right', color: 'var(--accent-warning)' }}>
                          R$ {c.cpa.toFixed(2)}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: 'var(--chart-6)' }}>
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
        borderTop: '1px solid var(--border-color)',
        fontSize: '0.78rem',
        color: 'var(--text-muted)',
        backgroundColor: 'var(--bg-dark)'
      }}>
        <div>Dica: Use as setas ⬅️ ➡️ do teclado para trocar de slide e Esc para sair.</div>
        <div>Agência Further Ads • Plataforma Oficial de Acompanhamento</div>
      </footer>
    </div>
  );
}
