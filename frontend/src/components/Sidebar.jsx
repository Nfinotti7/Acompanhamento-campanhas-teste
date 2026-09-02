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
  Building2 
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Sidebar({ activeTab, setActiveTab }) {
  const { user, logout } = useAuth();

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'campaigns', label: 'Campanhas', icon: BarChart3 },
    { id: 'credentials', label: 'Chaves e APIs', icon: KeyRound },
    { id: 'remarketing', label: 'Remarketing / Leads', icon: Target },
    { id: 'tracking', label: 'Tracking & Atribuição', icon: Link2 },
  ];

  if (user?.role === 'admin') {
    menuItems.push({ id: 'clients', label: 'Clientes', icon: Users });
  }

  return (
    <aside style={{
      width: '260px',
      backgroundColor: 'var(--bg-sidebar)',
      borderRight: '1px solid var(--border-color)',
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      position: 'sticky',
      top: 0,
      zIndex: 50
    }}>
      {/* Brand Header */}
      <div style={{
        padding: '24px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        borderBottom: '1px solid var(--border-color)'
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          borderRadius: '10px',
          background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 15px rgba(99, 102, 241, 0.4)'
        }}>
          <BarChart3 size={24} color="#fff" />
        </div>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fff' }}>Further Ads</h2>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Ads Analytics Engine
          </span>
        </div>
      </div>

      {/* User Info Badge */}
      <div style={{
        padding: '16px 20px',
        margin: '12px 16px',
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
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
          backgroundColor: user?.role === 'admin' ? '#6366f1' : '#10b981',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 'bold',
          color: '#fff',
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
              <><ShieldCheck size={12} color="#6366f1" /> Admin Agência</>
            ) : (
              <><Building2 size={12} color="#10b981" /> {user?.clientName || 'Cliente'}</>
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
              onClick={() => setActiveTab(item.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 16px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: isActive ? 'var(--accent-primary)' : 'transparent',
                color: isActive ? '#fff' : 'var(--text-secondary)',
                fontWeight: isActive ? 600 : 500,
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease',
                width: '100%'
              }}
            >
              <Icon size={18} color={isActive ? '#fff' : 'var(--text-secondary)'} />
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
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            color: '#f87171',
            border: '1px solid rgba(239, 68, 68, 0.2)',
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
