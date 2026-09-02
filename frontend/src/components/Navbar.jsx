import React from 'react';
import { RefreshCw, Filter, Calendar, Building2, Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Navbar({ 
  clients, 
  selectedClient, 
  setSelectedClient, 
  selectedPlatform, 
  setSelectedPlatform, 
  selectedRange, 
  setSelectedRange,
  onSync,
  isSyncing
}) {
  const { user } = useAuth();

  return (
    <header style={{
      height: '70px',
      borderBottom: '1px solid var(--border-color)',
      backgroundColor: 'rgba(11, 15, 25, 0.8)',
      backdropFilter: 'blur(12px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 32px',
      position: 'sticky',
      top: 0,
      zIndex: 40
    }}>
      {/* Client Switcher (Admin) or Client Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {user?.role === 'admin' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Building2 size={18} color="var(--accent-primary)" />
            <select
              value={selectedClient}
              onChange={(e) => setSelectedClient(e.target.value)}
              className="form-select"
              style={{
                width: '220px',
                fontWeight: 600,
                backgroundColor: 'var(--bg-card)',
                borderColor: 'var(--border-color)'
              }}
            >
              <option value="">Todos os Clientes (Visão Geral)</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.company})
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Building2 size={20} color="var(--accent-primary)" />
            <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {user?.clientCompany || user?.clientName}
            </span>
          </div>
        )}
      </div>

      {/* Global Filters: Platform, Date Range & Sync */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {/* Platform Selector */}
        <div style={{
          display: 'flex',
          backgroundColor: 'var(--bg-card)',
          borderRadius: 'var(--radius-sm)',
          padding: '4px',
          border: '1px solid var(--border-color)'
        }}>
          <button
            onClick={() => setSelectedPlatform('all')}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: selectedPlatform === 'all' ? 'var(--accent-primary)' : 'transparent',
              color: selectedPlatform === 'all' ? '#fff' : 'var(--text-secondary)',
              fontWeight: 600,
              fontSize: '0.82rem',
              cursor: 'pointer'
            }}
          >
            Todas APIs
          </button>
          <button
            onClick={() => setSelectedPlatform('google')}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: selectedPlatform === 'google' ? '#4285f4' : 'transparent',
              color: selectedPlatform === 'google' ? '#fff' : 'var(--text-secondary)',
              fontWeight: 600,
              fontSize: '0.82rem',
              cursor: 'pointer'
            }}
          >
            Google Ads
          </button>
          <button
            onClick={() => setSelectedPlatform('meta')}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: selectedPlatform === 'meta' ? '#0084ff' : 'transparent',
              color: selectedPlatform === 'meta' ? '#fff' : 'var(--text-secondary)',
              fontWeight: 600,
              fontSize: '0.82rem',
              cursor: 'pointer'
            }}
          >
            Meta Ads
          </button>
        </div>

        {/* Date Range Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Calendar size={16} color="var(--text-muted)" />
          <select
            value={selectedRange}
            onChange={(e) => setSelectedRange(e.target.value)}
            className="form-select"
            style={{
              width: '140px',
              fontSize: '0.85rem',
              backgroundColor: 'var(--bg-card)'
            }}
          >
            <option value="today">Hoje</option>
            <option value="7d">Últimos 7 dias</option>
            <option value="30d">Últimos 30 dias</option>
            <option value="this_month">Este Mês</option>
          </select>
        </div>

        {/* Sync button */}
        <button
          onClick={onSync}
          disabled={isSyncing}
          className="btn btn-secondary"
          style={{ fontSize: '0.82rem', padding: '8px 12px' }}
        >
          <RefreshCw size={14} style={{ animation: isSyncing ? 'spin 1s linear infinite' : 'none' }} />
          <span>{isSyncing ? 'Sincronizando...' : 'Atualizar Dados'}</span>
        </button>
      </div>
    </header>
  );
}
