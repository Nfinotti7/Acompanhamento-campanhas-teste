import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link2, Code, Copy, CheckCircle2, GitBranch, Layers, ShieldCheck, ArrowRight } from 'lucide-react';

export default function TrackingPage({ selectedClient }) {
  const [report, setReport] = useState({ sources: [], campaigns: [], funnel: [] });
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchAttribution();
  }, [selectedClient]);

  const fetchAttribution = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/attribution', { params: { clientId: selectedClient } });
      setReport(res.data);
    } catch (err) {
      console.error('Error fetching attribution:', err);
    } finally {
      setLoading(false);
    }
  };

  const codeSnippet = `<!-- Script de Rastreamento de Atribuição e Conversão - Further Ads -->
<script src="${window.location.protocol}//${window.location.hostname}:5000/tracker.js"></script>
<script>
  // Exemplo: Disparar captura ao enviar formulário
  // FurtherTracker.captureLead({ name: 'Nome', email: 'email@exemplo.com', phone: '(11) 99999-9999' });

  // Exemplo: Rastrear conversão de venda com valor
  // FurtherTracker.trackConversion('purchase', 250.00, 'cliente@email.com');
</script>`;

  const copyCode = () => {
    navigator.clipboard.writeText(codeSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Link2 size={28} color="var(--accent-primary)" />
          Rastreamento de Atribuição (Click-to-Conversion)
        </h1>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          Rastreie a jornada completa do usuário desde o clique no anúncio (gclid/fbclid/UTMs) até a conversão final.
        </p>
      </div>

      {/* Code Snippet Box */}
      <div className="glass-card" style={{ padding: '24px', marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Code size={20} color="var(--accent-primary)" />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>
              Script de Tracking para a Landing Page
            </h3>
          </div>

          <button onClick={copyCode} className="btn btn-primary" style={{ fontSize: '0.85rem' }}>
            <Copy size={14} />
            <span>{copied ? 'Copiado!' : 'Copiar Código JS'}</span>
          </button>
        </div>

        <pre style={{
          backgroundColor: '#070a12',
          padding: '16px',
          borderRadius: 'var(--radius-sm)',
          color: '#a5b4fc',
          fontSize: '0.82rem',
          overflowX: 'auto',
          border: '1px solid var(--border-color)',
          fontFamily: 'monospace'
        }}>
          {codeSnippet}
        </pre>

        {/* Funnel explanation steps */}
        <div style={{
          marginTop: '20px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px',
          paddingTop: '20px',
          borderTop: '1px solid var(--border-color)'
        }}>
          <div style={{ display: 'flex', gap: '10px' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: 'rgba(99,102,241,0.2)', color: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>1</div>
            <div>
              <h4 style={{ fontSize: '0.85rem', color: '#fff', fontWeight: 600 }}>Captura de UTMs & Click IDs</h4>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>O script detecta utm_source, utm_campaign, gclid e fbclid automaticamente na URL.</p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: 'rgba(16,185,129,0.2)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>2</div>
            <div>
              <h4 style={{ fontSize: '0.85rem', color: '#fff', fontWeight: 600 }}>Persistência de Sessão</h4>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Os dados de origem acompanham o visitante durante a navegação entre páginas.</p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: 'rgba(168,85,247,0.2)', color: '#a855f7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>3</div>
            <div>
              <h4 style={{ fontSize: '0.85rem', color: '#fff', fontWeight: 600 }}>Atribuição Final</h4>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Ao virar lead ou comprar, a conversão é atribuída exatamente à campanha de origem.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Attribution Analytics Breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '24px' }}>
        
        {/* Top UTM Sources */}
        <div className="glass-card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <GitBranch size={18} color="var(--accent-primary)" />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>
              Atribuição por Origem (UTM Source)
            </h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {report.sources.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Nenhum evento registrado ainda.</p>
            ) : (
              report.sources.map((s, idx) => (
                <div key={idx} style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--border-color)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span className={s.source === 'google' ? 'badge badge-google' : s.source === 'meta' ? 'badge badge-meta' : 'badge'}>
                      {s.source}
                    </span>
                  </div>
                  <span style={{ fontWeight: 700, color: '#fff', fontSize: '0.9rem' }}>
                    {s.event_count} Eventos Rasteados
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Funnel Events */}
        <div className="glass-card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Layers size={18} color="var(--accent-success)" />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>
              Funil de Eventos Rastreados
            </h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {report.funnel.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Nenhum evento no funil.</p>
            ) : (
              report.funnel.map((f, idx) => (
                <div key={idx} style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'rgba(16, 185, 129, 0.06)',
                  border: '1px solid rgba(16, 185, 129, 0.2)'
                }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)', textTransform: 'capitalize' }}>
                    {f.event_name.replace(/_/g, ' ')}
                  </span>
                  <span style={{ fontWeight: 800, color: '#10b981', fontSize: '1rem' }}>
                    {f.count} Total
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
