import React from 'react';
import {
  LayoutDashboard,
  BarChart3,
  KeyRound,
  Users,
  Target,
  Link2,
  LogOut,
  ShieldCheck,
  Building2,
  MessageCircle,
  Columns3,
  CalendarDays,
  PieChart,
  Radar
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import BrandLogo from '../brand/BrandLogo';

export default function Sidebar({ activeTab, setActiveTab, isOpen, onNavigate }) {
  const { user, logout } = useAuth();

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'campaigns', label: 'Campanhas', icon: BarChart3 },
    { id: 'remarketing', label: 'Remarketing / Leads', icon: Target },
    { id: 'tracking', label: 'Tracking & Atribuição', icon: Link2 },
    { id: 'whatsapp-dashboard', label: 'Dashboard WhatsApp', icon: PieChart },
    { id: 'whatsapp', label: 'WhatsApp & Conversões', icon: MessageCircle },
    { id: 'whatsapp-kanban', label: 'Funil WhatsApp', icon: Columns3 },
    { id: 'whatsapp-agenda', label: 'Agenda', icon: CalendarDays },
    { id: 'tracking-links', label: 'Links e Conversões', icon: Radar },
  ];

  if (user?.role === 'admin') {
    menuItems.splice(2, 0, { id: 'credentials', label: 'Chaves e APIs', icon: KeyRound });
    menuItems.push({ id: 'clients', label: 'Clientes', icon: Users });
  }

  const handleSelect = (id) => {
    setActiveTab(id);
    if (onNavigate) onNavigate();
  };

  return (
    <aside className={`sidebar${isOpen ? ' open' : ''}`}>
      {/* Marca */}
      <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--border-color)' }}>
        <BrandLogo variant="horizontal" height={34} />
        <span style={{ display: 'block', marginTop: '8px', fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Painel de campanhas
        </span>
      </div>

      {/* User Info Badge */}
      <div style={{
        padding: '16px 20px',
        margin: '12px 16px',
        backgroundColor: 'var(--surface-subtle)',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border-color)',
        display: 'flex',
        alignItems: 'center',
        gap: '10px'
      }}>
        <div style={{
          width: '36px',
          height: '36px',
          borderRadius: '50%',
          backgroundColor: user?.role === 'admin' ? 'var(--accent-primary)' : 'var(--accent-success)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 'bold',
          color: 'var(--on-accent)',
          fontSize: '0.9rem'
        }}>
          {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
        </div>
        <div style={{ overflow: 'hidden' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {user?.name}
          </div>
          <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            {user?.role === 'admin' ? (
              <><ShieldCheck size={12} color="var(--accent-primary)" /> Admin Agência</>
            ) : (
              <><Building2 size={12} color="var(--accent-success)" /> {user?.clientName || 'Cliente'}</>
            )}
          </div>
        </div>
      </div>

      {/* Navigation Menu */}
      <nav style={{ flex: 1, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleSelect(item.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 16px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: isActive ? 'var(--accent-primary)' : 'transparent',
                color: isActive ? 'var(--on-accent)' : 'var(--text-secondary)',
                fontWeight: isActive ? 600 : 500,
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease',
                width: '100%'
              }}
            >
              <Icon size={18} color={isActive ? 'var(--on-accent)' : 'var(--text-secondary)'} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Logout Footer */}
      <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border-color)' }}>
        <button
          onClick={logout}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            width: '100%',
            padding: '10px 14px',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'color-mix(in srgb, var(--accent-danger) 10%, transparent)',
            color: 'var(--accent-danger)',
            border: '1px solid color-mix(in srgb, var(--accent-danger) 20%, transparent)',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.85rem'
          }}
        >
          <LogOut size={16} />
          <span>Sair da Conta</span>
        </button>
      </div>
    </aside>
  );
}
