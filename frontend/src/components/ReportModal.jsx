import React, { useState, useRef } from 'react';
import { 
  X, Download, Printer, Play, FileText, CheckCircle2, 
  Building2, Calendar, DollarSign, ShoppingCart, Target, 
  TrendingUp, MousePointerClick, Percent, Sparkles, AlertCircle
} from 'lucide-react';
import html2canvas from 'html2canvas';
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
  const handlePrint = () => {
    window.print();
  };

  // PDF Download using html2canvas & jsPDF
  const handleDownloadPDF = async () => {
    if (!reportRef.current) return;
    setIsGenerating(true);
    try {
      const element = reportRef.current;
      
      // Temporarily expand scroll container for complete capture
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#0b0f19',
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
        onExportPDF={handleDownloadPDF}
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
      backgroundColor: 'rgba(0, 0, 0, 0.85)',
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
        boxShadow: '0 25px 60px rgba(0,0,0,0.8)',
        overflow: 'hidden'
      }}>
        {/* Header Actions */}
        <div className="no-print" style={{
          padding: '20px 28px',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: 'rgba(15, 22, 39, 0.95)',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <FileText size={20} color="#fff" />
            </div>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff' }}>
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
              style={{ fontSize: '0.85rem', borderColor: 'rgba(99, 102, 241, 0.4)', color: '#818cf8' }}
            >
              <Play size={15} color="#818cf8" /> Modo Apresentação
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
          backgroundColor: '#0b0f19'
        }}>

          {/* Customizable Executive Note Editor (Hidden on print) */}
          <div className="no-print" style={{
            marginBottom: '24px',
            backgroundColor: 'rgba(99, 102, 241, 0.08)',
            border: '1px solid rgba(99, 102, 241, 0.2)',
            borderRadius: 'var(--radius-md)',
            padding: '16px 20px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <Sparkles size={16} color="var(--accent-primary)" />
              <strong style={{ fontSize: '0.88rem', color: '#fff' }}>Resumo & Observações do Consultor (Opcional):</strong>
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
          <div ref={reportRef} id="printable-report-area" style={{
            backgroundColor: '#0b0f19',
            color: '#f8fafc',
            padding: '24px',
            borderRadius: '12px',
            border: '1px solid rgba(255, 255, 255, 0.08)'
          }}>

            {/* Document Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingBottom: '20px',
              marginBottom: '24px',
              borderBottom: '2px solid rgba(99, 102, 241, 0.4)'
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
                <h1 style={{ fontSize: '2rem', fontWeight: 900, color: '#fff' }}>
                  {clientName ? clientName : 'Visão Geral das Campanhas'}
                </h1>
                <div style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Período: <strong>{formattedRange}</strong> | Plataforma: <strong>{selectedPlatform === 'all' ? 'Todas (Google & Meta)' : selectedPlatform === 'google' ? 'Google Ads' : 'Meta Ads'}</strong>
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div style={{
                  background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                  color: '#fff',
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
                backgroundColor: 'rgba(19, 27, 46, 0.9)',
                borderLeft: '4px solid var(--accent-primary)',
                padding: '16px 20px',
                borderRadius: '8px',
                marginBottom: '28px'
              }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-primary)', textTransform: 'uppercase', marginBottom: '4px' }}>
                  Parecer Executivo & Análise
                </div>
                <p style={{ fontSize: '0.9rem', color: '#e2e8f0', lineHeight: 1.5 }}>
                  {executiveNotes}
                </p>
              </div>
            )}

            {/* Main KPI Grid */}
            <div style={{ marginBottom: '32px' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fff', marginBottom: '16px' }}>
                1. Indicadores Chave de Desempenho (KPIs)
              </h3>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '16px'
              }}>
                <div style={{ backgroundColor: 'rgba(19, 27, 46, 0.8)', padding: '16px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Investimento Total</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff' }}>
                    R$ {summary?.spend?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    CPM Médio: R$ {summary?.cpm?.toFixed(2)}
                  </div>
                </div>

                <div style={{ backgroundColor: 'rgba(19, 27, 46, 0.8)', padding: '16px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Conversões</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#10b981' }}>
                    {summary?.conversions?.toLocaleString('pt-BR')}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    Receita: R$ {summary?.conversion_value?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </div>
                </div>

                <div style={{ backgroundColor: 'rgba(19, 27, 46, 0.8)', padding: '16px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Custo / Conversão (CPA)</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f59e0b' }}>
                    R$ {summary?.cpa?.toFixed(2)}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    Custo Médio por Resultado
                  </div>
                </div>

                <div style={{ backgroundColor: 'rgba(19, 27, 46, 0.8)', padding: '16px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '4px' }}>ROAS (Retorno)</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#a855f7' }}>
                    {summary?.roas?.toFixed(2)}x
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    Retorno sobre verba de anúncios
                  </div>
                </div>

                <div style={{ backgroundColor: 'rgba(19, 27, 46, 0.8)', padding: '16px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Cliques em Anúncios</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#3b82f6' }}>
                    {summary?.clicks?.toLocaleString('pt-BR')}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    CPC Médio: R$ {summary?.cpc?.toFixed(2)}
                  </div>
                </div>

                <div style={{ backgroundColor: 'rgba(19, 27, 46, 0.8)', padding: '16px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Taxa de Cliques (CTR)</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#ec4899' }}>
                    {summary?.ctr?.toFixed(2)}%
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    {summary?.impressions?.toLocaleString('pt-BR')} Impressões
                  </div>
                </div>
              </div>
            </div>

            {/* Platform Comparison */}
            {platformBreakdown.length > 0 && (
              <div style={{ marginBottom: '32px' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fff', marginBottom: '16px' }}>
                  2. Distribuição por Plataforma de Anúncio
                </h3>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
                  {platformBreakdown.map((p) => {
                    const isGoogle = p.platform === 'google';
                    return (
                      <div key={p.platform} style={{
                        backgroundColor: 'rgba(19, 27, 46, 0.8)',
                        padding: '16px 20px',
                        borderRadius: '10px',
                        borderLeft: isGoogle ? '4px solid #4285f4' : '4px solid #0084ff'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                          <strong style={{ fontSize: '1.1rem', color: isGoogle ? '#60a5fa' : '#38bdf8' }}>
                            {isGoogle ? 'Google Ads' : 'Meta Ads'}
                          </strong>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            {p.campaignsCount || p.campaigns_count || 0} campanhas
                          </span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                          <div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Investido</div>
                            <div style={{ fontWeight: 700, color: '#fff', fontSize: '1.05rem' }}>
                              R$ {p.spend.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Conversões</div>
                            <div style={{ fontWeight: 700, color: '#10b981', fontSize: '1.05rem' }}>
                              {p.conversions.toLocaleString('pt-BR')}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>CPA Médio</div>
                            <div style={{ fontWeight: 700, color: '#f59e0b', fontSize: '1.05rem' }}>
                              R$ {(p.conversions > 0 ? p.spend / p.conversions : 0).toFixed(2)}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Campaigns Table */}
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fff', marginBottom: '16px' }}>
                3. Detalhamento por Campanha
              </h3>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid rgba(255,255,255,0.1)', color: 'var(--text-secondary)' }}>
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
                      <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '10px 8px', fontWeight: 600, color: '#fff' }}>
                          {c.campaign_name}
                        </td>
                        <td style={{ padding: '10px 8px' }}>
                          <span className={c.platform === 'google' ? 'badge badge-google' : 'badge badge-meta'} style={{ fontSize: '0.7rem', padding: '2px 6px' }}>
                            {c.platform === 'google' ? 'Google' : 'Meta'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700, color: '#fff' }}>
                          R$ {c.total_spend.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                          {c.total_clicks.toLocaleString('pt-BR')}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                          {c.ctr}%
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700, color: '#10b981' }}>
                          {c.total_conversions}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', color: '#f59e0b' }}>
                          R$ {c.cpa.toFixed(2)}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700, color: '#a855f7' }}>
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
              borderTop: '1px solid rgba(255,255,255,0.08)',
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
