import React, { useState } from 'react';
import { RefreshCw, Calendar, Building2, FileText, Menu, SlidersHorizontal } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from '../theme/ThemeToggle';
import Sheet from './ui/Sheet';
import { useBreakpoint } from '../responsive/useBreakpoint';

const PLATFORMS = [
  ['all', 'Todas APIs', 'var(--accent-primary)'],
  ['google', 'Google Ads', 'var(--accent-google)'],
  ['meta', 'Meta Ads', 'var(--accent-meta)']
];

export default function Navbar({
  clients,
  selectedClient,
  setSelectedClient,
  selectedPlatform,
  setSelectedPlatform,
  selectedRange,
  setSelectedRange,
  onSync,
  isSyncing,
  onOpenReport,
  onToggleSidebar
}) {
  const { user } = useAuth();
  const phone = useBreakpoint() === 'phone';
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilters = (selectedClient ? 1 : 0) + (selectedPlatform !== 'all' ? 1 : 0) + (selectedRange !== '30d' ? 1 : 0);

  const isAdmin = user?.role === 'admin';
  // Login de grupo (um dono, vários restaurantes): troca entre os restaurantes dele, sem "Todos".
  const isGroup = !isAdmin && user?.clients?.length > 1;
  const clientSelect = (isAdmin || isGroup) && (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: phone ? '100%' : undefined }}>
      <Building2 size={18} color="var(--accent-primary)" />
      <select
        value={selectedClient}
        onChange={(e) => setSelectedClient(e.target.value)}
        className="form-select"
        aria-label="Cliente"
        style={{ width: phone ? '100%' : '220px', fontWeight: 600, backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
      >
        {isAdmin && <option value="">Todos os Clientes (Visão Geral)</option>}
        {clients.map(c => (
          <option key={c.id} value={c.id}>
            {c.name} ({c.company}){c.dashboard_enabled === false ? ' · Na Mesa' : ''}
          </option>
        ))}
      </select>
    </div>
  );

  const platformPicker = (
    <div style={{
      display: 'flex', backgroundColor: 'var(--bg-card)', borderRadius: 'var(--radius-sm)',
      padding: '4px', border: '1px solid var(--border-color)', width: phone ? '100%' : undefined
    }}>
      {PLATFORMS.map(([key, label, color]) => (
        <button
          key={key}
          onClick={() => setSelectedPlatform(key)}
          style={{
            flex: phone ? 1 : undefined, padding: '6px 12px', borderRadius: '6px', border: 'none',
            backgroundColor: selectedPlatform === key ? color : 'transparent',
            color: selectedPlatform === key ? 'var(--on-accent)' : 'var(--text-secondary)',
            fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', whiteSpace: 'nowrap'
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );

  const rangeSelect = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: phone ? '100%' : undefined }}>
      <Calendar size={16} color="var(--text-muted)" />
      <select
        value={selectedRange}
        onChange={(e) => setSelectedRange(e.target.value)}
        className="form-select"
        aria-label="Período"
        style={{ width: phone ? '100%' : '140px', fontSize: '0.85rem', backgroundColor: 'var(--bg-card)' }}
      >
        <option value="today">Hoje</option>
        <option value="7d">Últimos 7 dias</option>
        <option value="30d">Últimos 30 dias</option>
        <option value="this_month">Este Mês</option>
      </select>
    </div>
  );

  const actions = (
    <>
      <button onClick={onOpenReport} className="btn btn-primary" style={{ fontSize: '0.82rem', padding: '8px 14px' }} title="Gerar Relatório">
        <FileText size={15} />
        <span className="btn-label">Gerar Relatório</span>
      </button>
      <button onClick={onSync} disabled={isSyncing} className="btn btn-secondary" style={{ fontSize: '0.82rem', padding: '8px 12px' }} title="Atualizar Dados">
        <RefreshCw size={14} style={{ animation: isSyncing ? 'spin 1s linear infinite' : 'none' }} />
        <span className="btn-label">{isSyncing ? 'Sincronizando...' : 'Atualizar Dados'}</span>
      </button>
      <ThemeToggle />
    </>
  );

  if (phone) {
    return (
      <header className="navbar" style={{ flexWrap: 'nowrap', gap: '8px', paddingTop: 'calc(10px + env(safe-area-inset-top))' }}>
        <button className="mobile-menu-btn" onClick={onToggleSidebar} aria-label="Abrir menu"><Menu size={20} /></button>
        <button onClick={() => setFiltersOpen(true)} className="btn btn-secondary" style={{ fontSize: '0.85rem', padding: '8px 12px', marginRight: 'auto' }}>
          <SlidersHorizontal size={15} /> Filtros{activeFilters > 0 ? ` (${activeFilters})` : ''}
        </button>
        {actions}
        <Sheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filtros">
          <div style={{ display: 'grid', gap: '14px' }}>
            {clientSelect}
            {!isAdmin && !isGroup && (
              <div style={{ fontWeight: 700 }}>{user?.clientCompany || user?.clientName}</div>
            )}
            {platformPicker}
            {rangeSelect}
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => setFiltersOpen(false)}>Ver resultados</button>
          </div>
        </Sheet>
      </header>
    );
  }

  return (
    <header className="navbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <button className="mobile-menu-btn" onClick={onToggleSidebar} aria-label="Abrir menu"><Menu size={20} /></button>
        {isAdmin || isGroup ? clientSelect : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Building2 size={20} color="var(--accent-primary)" />
            <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {user?.clientCompany || user?.clientName}
            </span>
          </div>
        )}
      </div>

      <div className="navbar-filters">
        {platformPicker}
        {rangeSelect}
        {actions}
      </div>
    </header>
  );
}
