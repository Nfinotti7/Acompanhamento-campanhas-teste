import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Target, Download, Search, PlusCircle, CheckCircle2, Copy, Sparkles, Filter } from 'lucide-react';

export default function RemarketingPage({ selectedClient }) {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [showSimModal, setShowSimModal] = useState(false);
  const [copied, setCopied] = useState(false);

  // Lead capture test form
  const [simData, setSimData] = useState({
    name: '',
    email: '',
    phone: '',
    utm_source: 'google',
    utm_campaign: 'Campanha Remarketing Teste',
    conversion_value: 150.0
  });

  useEffect(() => {
    fetchLeads();
  }, [selectedClient, search, sourceFilter]);

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/leads', {
        params: {
          clientId: selectedClient,
          search,
          source: sourceFilter
        }
      });
      setLeads(res.data.leads || []);
    } catch (err) {
      console.error('Error fetching leads:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = (platform) => {
    const url = `/api/leads/export?clientId=${selectedClient || ''}&platform=${platform}`;
    window.open(url, '_blank');
  };

  const handleSimulateCapture = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/api/v1/capture', {
        client_id: selectedClient || 1,
        ...simData
      });
      setShowSimModal(false);
      fetchLeads();
    } catch (err) {
      alert('Erro ao capturar lead de teste.');
    }
  };

  const copyWebhookUrl = () => {
    const webhookUrl = `${window.location.protocol}//${window.location.hostname}:5000/api/v1/capture`;
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Target size={28} color="var(--accent-success)" />
            Listas de Remarketing & Capturas
          </h1>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            Banco de dados unificado de leads e eventos para upload de audiências no Google e Meta
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => handleExportCSV('google')} className="btn" style={{ backgroundColor: '#4285f4', color: '#fff' }}>
            <Download size={16} />
            <span>Exportar Google Match (CSV)</span>
          </button>
          <button onClick={() => handleExportCSV('meta')} className="btn" style={{ backgroundColor: '#0084ff', color: '#fff' }}>
            <Download size={16} />
            <span>Exportar Meta Audience (CSV)</span>
          </button>
          <button onClick={() => setShowSimModal(true)} className="btn btn-primary">
            <PlusCircle size={16} />
            <span>Simular Captura</span>
          </button>
        </div>
      </div>

      {/* Webhook & Ingestion Info Card */}
      <div className="glass-card" style={{ padding: '20px', marginBottom: '24px', backgroundColor: 'rgba(16, 185, 129, 0.08)', borderColor: 'rgba(16, 185, 129, 0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#34d399', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              ⚡ Endpoint de Captura / Webhook em Tempo Real
            </span>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Conecte Elementor, Typeform, WordPress, Make ou Zapier enviando requisições <strong>POST JSON</strong> para:
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <code style={{
              backgroundColor: 'var(--bg-dark)',
              padding: '8px 14px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.85rem',
              color: '#34d399',
              border: '1px solid rgba(16, 185, 129, 0.3)'
            }}>
              POST http://localhost:5000/api/v1/capture
            </code>
            <button onClick={copyWebhookUrl} className="btn btn-secondary" style={{ padding: '8px 12px' }}>
              <Copy size={14} />
              <span>{copied ? 'Copiado!' : 'Copiar URL'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Leads Search & Filter Controls */}
      <div className="glass-card" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ position: 'relative', width: '280px' }}>
              <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                placeholder="Buscar por nome, e-mail ou campanha..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '36px', fontSize: '0.85rem' }}
              />
            </div>

            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="form-select"
              style={{ width: '150px', fontSize: '0.85rem' }}
            >
              <option value="all">Todas Origens</option>
              <option value="google">Google Ads</option>
              <option value="meta">Meta Ads</option>
              <option value="direct">Direto / Orgânico</option>
            </select>
          </div>

          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>
            Total Registrado: {leads.length} Contatos
          </span>
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                <th style={{ padding: '12px' }}>Nome / Contato</th>
                <th style={{ padding: '12px' }}>E-mail</th>
                <th style={{ padding: '12px' }}>Telefone</th>
                <th style={{ padding: '12px' }}>Origem UTM</th>
                <th style={{ padding: '12px' }}>Campanha Origem</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Valor Conversão</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Data Captura</th>
              </tr>
            </thead>
            <tbody>
              {leads.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Nenhum lead capturado ainda. Teste enviando dados via Webhook ou simulação!
                  </td>
                </tr>
              ) : (
                leads.map((l) => (
                  <tr key={l.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                    <td style={{ padding: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {l.name || 'Lead Anônimo'}
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>
                      {l.email || '-'}
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>
                      {l.phone || '-'}
                    </td>
                    <td style={{ padding: '12px' }}>
                      <span className={l.source === 'google' ? 'badge badge-google' : l.source === 'meta' ? 'badge badge-meta' : 'badge'}>
                        {l.source || 'direto'}
                      </span>
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>
                      {l.campaign || '-'}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: '#10b981' }}>
                      R$ {(l.conversion_value || 0).toFixed(2)}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                      {new Date(l.created_at).toLocaleString('pt-BR')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Simulation Modal */}
      {showSimModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100
        }}>
          <div className="glass-card" style={{ width: '480px', padding: '32px', backgroundColor: 'var(--bg-card)' }}>
            <h3 style={{ fontSize: '1.3rem', fontWeight: 700, color: '#fff', marginBottom: '16px' }}>
              Simular Captura de Lead / Evento
            </h3>

            <form onSubmit={handleSimulateCapture}>
              <div className="form-group">
                <label className="form-label">Nome Completo</label>
                <input
                  type="text"
                  required
                  className="form-input"
                  placeholder="Ex: João da Silva"
                  value={simData.name}
                  onChange={(e) => setSimData({ ...simData, name: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">E-mail</label>
                <input
                  type="email"
                  required
                  className="form-input"
                  placeholder="joao@empresa.com"
                  value={simData.email}
                  onChange={(e) => setSimData({ ...simData, email: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Telefone</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="(11) 99999-8888"
                  value={simData.phone}
                  onChange={(e) => setSimData({ ...simData, phone: e.target.value })}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">Plataforma UTM</label>
                  <select
                    className="form-select"
                    value={simData.utm_source}
                    onChange={(e) => setSimData({ ...simData, utm_source: e.target.value })}
                  >
                    <option value="google">Google Ads</option>
                    <option value="meta">Meta Ads</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Valor R$</label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-input"
                    value={simData.conversion_value}
                    onChange={(e) => setSimData({ ...simData, conversion_value: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Campanha Origem</label>
                <input
                  type="text"
                  className="form-input"
                  value={simData.utm_campaign}
                  onChange={(e) => setSimData({ ...simData, utm_campaign: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
                <button type="button" onClick={() => setShowSimModal(false)} className="btn btn-secondary">
                  Cancelar
                </button>
                <button type="submit" className="btn btn-success">
                  Capturar Lead
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
