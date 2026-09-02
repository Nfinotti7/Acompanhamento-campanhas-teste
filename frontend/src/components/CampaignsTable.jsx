import React, { useState } from 'react';
import { Search, Filter, ArrowUpDown, ExternalLink } from 'lucide-react';

export default function CampaignsTable({ campaigns = [] }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortField, setSortField] = useState('total_spend');
  const [sortOrder, setSortOrder] = useState('desc');

  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const filteredCampaigns = campaigns.filter(c => {
    const matchesSearch = c.campaign_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          c.client_name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || c.status.toLowerCase() === statusFilter.toLowerCase();
    return matchesSearch && matchesStatus;
  });

  const sortedCampaigns = [...filteredCampaigns].sort((a, b) => {
    let valA = a[sortField] || 0;
    let valB = b[sortField] || 0;

    if (typeof valA === 'string') {
      return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
    }
    return sortOrder === 'asc' ? valA - valB : valB - valA;
  });

  return (
    <div className="glass-card" style={{ padding: '24px' }}>
      {/* Header & Controls */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '20px',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            Campanhas em Execução
          </h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Métricas individuais atualizadas por plataforma
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Search input */}
          <div style={{ position: 'relative', width: '240px' }}>
            <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="Buscar campanha..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="form-input"
              style={{ paddingLeft: '36px', fontSize: '0.85rem' }}
            />
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="form-select"
            style={{ width: '130px', fontSize: '0.85rem' }}
          >
            <option value="all">Todos Status</option>
            <option value="enabled">Ativas</option>
            <option value="paused">Pausadas</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
              <th style={{ padding: '12px', cursor: 'pointer' }} onClick={() => handleSort('campaign_name')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  Campanha <ArrowUpDown size={12} />
                </div>
              </th>
              <th style={{ padding: '12px' }}>Plataforma</th>
              <th style={{ padding: '12px', cursor: 'pointer', textAlign: 'right' }} onClick={() => handleSort('total_spend')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                  Investimento <ArrowUpDown size={12} />
                </div>
              </th>
              <th style={{ padding: '12px', cursor: 'pointer', textAlign: 'right' }} onClick={() => handleSort('total_clicks')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                  Cliques <ArrowUpDown size={12} />
                </div>
              </th>
              <th style={{ padding: '12px', cursor: 'pointer', textAlign: 'right' }} onClick={() => handleSort('ctr')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                  CTR <ArrowUpDown size={12} />
                </div>
              </th>
              <th style={{ padding: '12px', cursor: 'pointer', textAlign: 'right' }} onClick={() => handleSort('cpc')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                  CPC Média <ArrowUpDown size={12} />
                </div>
              </th>
              <th style={{ padding: '12px', cursor: 'pointer', textAlign: 'right' }} onClick={() => handleSort('total_conversions')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                  Conversões <ArrowUpDown size={12} />
                </div>
              </th>
              <th style={{ padding: '12px', cursor: 'pointer', textAlign: 'right' }} onClick={() => handleSort('cpa')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                  CPA <ArrowUpDown size={12} />
                </div>
              </th>
              <th style={{ padding: '12px', cursor: 'pointer', textAlign: 'right' }} onClick={() => handleSort('roas')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                  ROAS <ArrowUpDown size={12} />
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedCampaigns.length === 0 ? (
              <tr>
                <td colSpan="9" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Nenhuma campanha encontrada com os filtros selecionados.
                </td>
              </tr>
            ) : (
              sortedCampaigns.map((c) => (
                <tr 
                  key={c.id}
                  style={{
                    borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-card-hover)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <td style={{ padding: '14px 12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    <div>{c.campaign_name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                      Cliente: {c.client_name} • ID: {c.campaign_id}
                    </div>
                  </td>
                  <td style={{ padding: '14px 12px' }}>
                    <span className={c.platform === 'google' ? 'badge badge-google' : 'badge badge-meta'}>
                      {c.platform === 'google' ? 'Google Ads' : 'Meta Ads'}
                    </span>
                  </td>
                  <td style={{ padding: '14px 12px', textAlign: 'right', fontWeight: 700, color: '#fff' }}>
                    R$ {c.total_spend.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: '14px 12px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                    {c.total_clicks.toLocaleString('pt-BR')}
                  </td>
                  <td style={{ padding: '14px 12px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                    {c.ctr}%
                  </td>
                  <td style={{ padding: '14px 12px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                    R$ {c.cpc.toFixed(2)}
                  </td>
                  <td style={{ padding: '14px 12px', textAlign: 'right', fontWeight: 700, color: '#10b981' }}>
                    {c.total_conversions}
                  </td>
                  <td style={{ padding: '14px 12px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                    R$ {c.cpa.toFixed(2)}
                  </td>
                  <td style={{ padding: '14px 12px', textAlign: 'right', fontWeight: 700, color: '#a855f7' }}>
                    {c.roas}x
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
