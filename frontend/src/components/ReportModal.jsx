import React, { useState, useRef } from 'react';
import {
  X, Download, Printer, Play, FileText, CheckCircle2,
  Building2, Calendar, DollarSign, ShoppingCart, Target,
  TrendingUp, MousePointerClick, Percent, Sparkles, AlertCircle
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import html2canvas from 'html2canvas';
import { useTheme, resolveCssColorFor } from '../theme/useTheme';
import { legacyColorsInClone } from '../theme/legacyColors';
import { jsPDF } from 'jspdf';
import PresentationView from './PresentationView';

export default function ReportModal({
  isOpen,
  onClose,
  clientName,
  selectedRange,
  selectedPlatform,
  summary,
  dailyData = [],
  platformBreakdown = [],
  campaigns = []
}) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [showPresentation, setShowPresentation] = useState(false);
  const [executiveNotes, setExecutiveNotes] = useState(
    'Campanhas com excelente taxa de engajamento e captação no período. O CPA mantido dentro da meta estimada, com destaque para a otimização contínua de anúncios.'
  );

  const reportRef = useRef(null);
  const { theme } = useTheme();
  // Impressão e PDF saem sempre no tema claro (papel/cliente), qualquer que seja o da tela.
  const [exporting, setExporting] = useState(false);
  const reportTheme = exporting ? 'light' : theme;
  const rc = (v) => resolveCssColorFor(v, reportTheme);
  const waitRepaint = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 50))));

  if (!isOpen) return null;

  const rangeLabels = {
    today: 'Hoje',
    '7d': 'Últimos 7 dias',
    '30d': 'Últimos 30 dias',
    this_month: 'Este Mês'
  };

  const formattedRange = rangeLabels[selectedRange] || selectedRange;
  const todayDate = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

  // Native Print
  const handlePrint = async () => {
    setExporting(true);
    await waitRepaint();
    const done = () => { setExporting(false); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
  };

  // PDF Download using html2canvas & jsPDF
  const handleDownloadPDF = async () => {
    if (!reportRef.current) return;
    setIsGenerating(true);
    setExporting(true);
    try {
      await waitRepaint();
      const element = reportRef.current;
      
      // Temporarily expand scroll container for complete capture
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: resolveCssColorFor('var(--bg-dark)', 'light'),
        onclone: (doc, el) => legacyColorsInClone(el || doc.getElementById('printable-report-area')),
        logging: false,
        windowWidth: 1200
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      const imgWidth = pdfWidth;
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;
      
      let heightLeft = imgHeight;
      let position = 0;

      // First page
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;

      // Additional pages if report exceeds A4 height
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;
      }

      const fileName = `Relatorio_${(clientName || 'Geral').replace(/\s+/g, '_')}_${selectedRange}.pdf`;
      pdf.save(fileName);
    } catch (err) {
      console.error('Erro ao gerar PDF:', err);
      alert('Houve um problema ao gerar o arquivo PDF. Tente usar a opção "Imprimir (Salvar em PDF)".');
    } finally {
      setIsGenerating(false);
      setExporting(false);
    }
  };

  if (showPresentation) {
    return (
      <PresentationView
        clientName={clientName}
        selectedRange={selectedRange}
        selectedPlatform={selectedPlatform}
        summary={summary}
        dailyData={dailyData}
        platformBreakdown={platformBreakdown}
        campaigns={campaigns}
        onClose={() => setShowPresentation(false)}
      />
    );
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      backgroundColor: 'var(--overlay)',
      backdropFilter: 'blur(8px)',
      zIndex: 9000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px'
    }}>
      {/* Modal Card */}
      <div className="glass-card" style={{
        width: '100%',
        maxWidth: '1050px',
        maxHeight: '92vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--bg-dark)',
        border: '1px solid var(--border-glow)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: '0 25px 60px var(--overlay)',
        overflow: 'hidden'
      }}>
        {/* Header Actions */}
        <div className="no-print" style={{
          padding: '20px 28px',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: 'var(--glass-bg)',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-primary-hover) 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <FileText size={20} color="var(--on-accent)" />
            </div>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                Gerador de Relatório Executivo
              </h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {clientName ? `Cliente: ${clientName}` : 'Visão Geral'} • Período: {formattedRange}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={() => setShowPresentation(true)}
              className="btn btn-secondary"
              style={{ fontSize: '0.85rem', borderColor: 'color-mix(in srgb, var(--accent-primary) 40%, transparent)', color: 'var(--accent-primary)' }}
            >
              <Play size={15} color="var(--accent-primary)" /> Modo Apresentação
            </button>

            <button
              onClick={handleDownloadPDF}
              disabled={isGenerating}
              className="btn btn-primary"
              style={{ fontSize: '0.85rem' }}
            >
              <Download size={15} /> {isGenerating ? 'Gerando PDF...' : 'Baixar PDF'}
            </button>

            <button
              onClick={handlePrint}
              className="btn btn-secondary"
              style={{ fontSize: '0.85rem' }}
            >
              <Printer size={15} /> Imprimir
            </button>

            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '6px',
                marginLeft: '6px'
              }}
            >
              <X size={22} />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Content Area */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '28px',
          backgroundColor: 'var(--bg-dark)'
        }}>

          {/* Customizable Executive Note Editor (Hidden on print) */}
          <div className="no-print" style={{
            marginBottom: '24px',
            backgroundColor: 'color-mix(in srgb, var(--accent-primary) 8%, transparent)',
            border: '1px solid color-mix(in srgb, var(--accent-primary) 20%, transparent)',
            borderRadius: 'var(--radius-md)',
            padding: '16px 20px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <Sparkles size={16} color="var(--accent-primary)" />
              <strong style={{ fontSize: '0.88rem', color: 'var(--text-primary)' }}>Resumo & Observações do Consultor (Opcional):</strong>
            </div>
            <textarea
              value={executiveNotes}
              onChange={(e) => setExecutiveNotes(e.target.value)}
              className="form-input"
              rows={2}
              style={{ width: '100%', fontSize: '0.85rem', resize: 'vertical' }}
              placeholder="Adicione um parecer técnico sobre o desempenho das campanhas neste relatório..."
            />
          </div>

          {/* PRINT & PDF TARGET AREA */}
          <div ref={reportRef} id="printable-report-area" data-theme={exporting ? 'light' : undefined} style={{
            backgroundColor: 'var(--bg-dark)',
            color: 'var(--text-primary)',
            padding: '24px',
            borderRadius: '12px',
            border: '1px solid var(--border-color)'
          }}>

            {/* Document Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingBottom: '20px',
              marginBottom: '24px',
              borderBottom: '2px solid color-mix(in srgb, var(--accent-primary) 40%, transparent)'
            }}>
              <div>
                <div style={{
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  color: 'var(--accent-primary)',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  marginBottom: '4px'
                }}>
                  Agência Further • Relatório de Desempenho
                </div>
                <h1 style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--text-primary)' }}>
                  {clientName ? clientName : 'Visão Geral das Campanhas'}
                </h1>
                <div style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Período: <strong>{formattedRange}</strong> | Plataforma: <strong>{selectedPlatform === 'all' ? 'Todas (Google & Meta)' : selectedPlatform === 'google' ? 'Google Ads' : 'Meta Ads'}</strong>
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div style={{
                  background: 'linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-primary-hover) 100%)',
                  color: 'var(--on-accent)',
                  fontWeight: 800,
                  fontSize: '0.9rem',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  display: 'inline-block',
                  marginBottom: '6px'
                }}>
                  FURTHER ADS
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Data de emissão: {todayDate}
                </div>
              </div>
            </div>

            {/* Executive Notes Block */}
            {executiveNotes && (
              <div style={{
                backgroundColor: 'var(--glass-bg)',
                borderLeft: '4px solid var(--accent-primary)',
                padding: '16px 20px',
                borderRadius: '8px',
                marginBottom: '28px'
              }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-primary)', textTransform: 'uppercase', marginBottom: '4px' }}>
                  Parecer Executivo & Análise
                </div>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                  {executiveNotes}
                </p>
              </div>
            )}

            {/* Main KPI Grid */}
            <div style={{ marginBottom: '32px' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '16px' }}>
                1. Indicadores Chave de Desempenho (KPIs)
              </h3>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '16px'
              }}>
                <div style={{ backgroundColor: 'var(--glass-bg)', padding: '16px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Investimento Total</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                    R$ {summary?.spend?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    CPM Médio: R$ {summary?.cpm?.toFixed(2)}
                  </div>
                </div>

                <div style={{ backgroundColor: 'var(--glass-bg)', padding: '16px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Conversões</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent-success)' }}>
                    {summary?.conversions?.toLocaleString('pt-BR')}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    Receita: R$ {summary?.conversion_value?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </div>
                </div>

                <div style={{ backgroundColor: 'var(--glass-bg)', padding: '16px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Custo / Conversão (CPA)</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent-warning)' }}>
                    R$ {summary?.cpa?.toFixed(2)}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    Custo Médio por Resultado
                  </div>
                </div>

                <div style={{ backgroundColor: 'var(--glass-bg)', padding: '16px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '4px' }}>ROAS (Retorno)</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--chart-6)' }}>
                    {summary?.roas?.toFixed(2)}x
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    Retorno sobre verba de anúncios
                  </div>
                </div>

                <div style={{ backgroundColor: 'var(--glass-bg)', padding: '16px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Cliques em Anúncios</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--chart-2)' }}>
                    {summary?.clicks?.toLocaleString('pt-BR')}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    CPC Médio: R$ {summary?.cpc?.toFixed(2)}
                  </div>
                </div>

                <div style={{ backgroundColor: 'var(--glass-bg)', padding: '16px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Taxa de Cliques (CTR)</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--chart-5)' }}>
                    {summary?.ctr?.toFixed(2)}%
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    {summary?.impressions?.toLocaleString('pt-BR')} Impressões
                  </div>
                </div>
              </div>
            </div>

            {/* Daily Evolution Chart */}
            {dailyData.length > 0 && (
              <div style={{ marginBottom: '32px' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '16px' }}>
                  2. Evolução Diária de Investimento e Conversões
                </h3>

                <div style={{ backgroundColor: 'var(--glass-bg)', padding: '20px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                  <div style={{ width: '100%', height: '280px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={dailyData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="reportSpend" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={rc('var(--accent-primary)')} stopOpacity={0.4} />
                            <stop offset="95%" stopColor={rc('var(--accent-primary)')} stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="reportConv" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={rc('var(--accent-success)')} stopOpacity={0.4} />
                            <stop offset="95%" stopColor={rc('var(--accent-success)')} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={rc('var(--border-color)')} />
                        <XAxis dataKey="date" stroke={rc('var(--text-muted)')} tick={{ fontSize: 11, fill: rc('var(--text-muted)') }} />
                        <YAxis yAxisId="left" stroke={rc('var(--accent-primary)')} tick={{ fontSize: 11, fill: rc('var(--text-muted)') }} tickFormatter={(v) => `R$${v}`} />
                        <YAxis yAxisId="right" orientation="right" stroke={rc('var(--accent-success)')} tick={{ fontSize: 11, fill: rc('var(--text-muted)') }} />
                        <Tooltip contentStyle={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--accent-primary)', borderRadius: '8px' }} />
                        <Legend />
                        <Area yAxisId="left" type="monotone" dataKey="spend" name="Investimento (R$)" stroke={rc('var(--accent-primary)')} strokeWidth={2} fill="url(#reportSpend)" isAnimationActive={false} />
                        <Area yAxisId="right" type="monotone" dataKey="conversions" name="Conversões" stroke={rc('var(--accent-success)')} strokeWidth={2} fill="url(#reportConv)" isAnimationActive={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            {/* Platform Comparison */}
            {platformBreakdown.length > 0 && (
              <div style={{ marginBottom: '32px' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '16px' }}>
                  3. Distribuição por Plataforma de Anúncio
                </h3>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px', marginBottom: '16px' }}>
                  <div style={{ backgroundColor: 'var(--glass-bg)', borderRadius: '10px', border: '1px solid var(--border-color)', padding: '12px' }}>
                    <div style={{ width: '100%', height: '180px' }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={platformBreakdown.map((p) => ({
                              name: p.platform === 'google' ? 'Google Ads' : 'Meta Ads',
                              value: p.spend,
                              color: p.platform === 'google' ? 'var(--accent-google)' : 'var(--accent-meta)'
                            }))}
                            cx="50%"
                            cy="50%"
                            innerRadius={40}
                            outerRadius={65}
                            paddingAngle={5}
                            dataKey="value"
                            isAnimationActive={false}
                          >
                            {platformBreakdown.map((p, index) => (
                              <Cell key={`cell-${index}`} fill={rc(p.platform === 'google' ? 'var(--accent-google)' : 'var(--accent-meta)')} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)' }} formatter={(val) => `R$ ${val.toFixed(2)}`} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                  {platformBreakdown.map((p) => {
                    const isGoogle = p.platform === 'google';
                    return (
                      <div key={p.platform} style={{
                        backgroundColor: 'var(--glass-bg)',
                        padding: '16px 20px',
                        borderRadius: '10px',
                        borderLeft: isGoogle ? '4px solid var(--accent-google)' : '4px solid var(--accent-meta)'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                          <strong style={{ fontSize: '1.1rem', color: isGoogle ? 'var(--chart-2)' : 'var(--chart-1)' }}>
                            {isGoogle ? 'Google Ads' : 'Meta Ads'}
                          </strong>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            {p.campaignsCount || p.campaigns_count || 0} campanhas
                          </span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                          <div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Investido</div>
                            <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '1.05rem' }}>
                              R$ {p.spend.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Conversões</div>
                            <div style={{ fontWeight: 700, color: 'var(--accent-success)', fontSize: '1.05rem' }}>
                              {p.conversions.toLocaleString('pt-BR')}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>CPA Médio</div>
                            <div style={{ fontWeight: 700, color: 'var(--accent-warning)', fontSize: '1.05rem' }}>
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

            {/* Campaigns Table */}
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '16px' }}>
                4. Detalhamento por Campanha
              </h3>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                    <th style={{ padding: '8px' }}>Campanha</th>
                    <th style={{ padding: '8px' }}>Canal</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Investimento</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Cliques</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>CTR</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Conversões</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>CPA</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>ROAS</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.length === 0 ? (
                    <tr>
                      <td colSpan="8" style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        Nenhuma campanha registrada no período.
                      </td>
                    </tr>
                  ) : (
                    campaigns.map(c => (
                      <tr key={c.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '10px 8px', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {c.campaign_name}
                        </td>
                        <td style={{ padding: '10px 8px' }}>
                          <span className={c.platform === 'google' ? 'badge badge-google' : 'badge badge-meta'} style={{ fontSize: '0.7rem', padding: '2px 6px' }}>
                            {c.platform === 'google' ? 'Google' : 'Meta'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)' }}>
                          R$ {c.total_spend.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                          {c.total_clicks.toLocaleString('pt-BR')}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                          {c.ctr}%
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700, color: 'var(--accent-success)' }}>
                          {c.total_conversions}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', color: 'var(--accent-warning)' }}>
                          R$ {c.cpa.toFixed(2)}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700, color: 'var(--chart-6)' }}>
                          {c.roas}x
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Document Footer */}
            <div style={{
              marginTop: '40px',
              paddingTop: '20px',
              borderTop: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '0.75rem',
              color: 'var(--text-muted)'
            }}>
              <div>Agência Further • Consultoria de Tráfego Pago & Performance Digital</div>
              <div>Página 1 de 1 • Documento Gerado pelo Further Ads</div>
            </div>

          </div>

        </div>
      </div>
    </div>
  );
}
