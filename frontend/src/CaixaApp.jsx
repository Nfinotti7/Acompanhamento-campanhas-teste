import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Store, Lock, ArrowLeft, MessageCircle, Columns3, CalendarDays, LogOut, MoreHorizontal } from 'lucide-react';
import CaixaChatView from './components/CaixaChatView';
import CaixaFunilView from './components/CaixaFunilView';
import { playNotificationSound, unlockNotificationSound } from './components/notificationSound';
import AppIcon from './brand/AppIcon';
import BrandLogo from './brand/BrandLogo';
import ThemeToggle from './theme/ThemeToggle';
import Sheet from './components/ui/Sheet';
import { useBreakpoint } from './responsive/useBreakpoint';

const NAV_ITEMS = [
  { key: 'conversas', label: 'Conversas', icon: MessageCircle },
  { key: 'funil', label: 'Funil', icon: Columns3 },
  { key: 'agenda', label: 'Agenda', icon: CalendarDays }
];

const TOKEN_KEY = 'caixa_token';
const RESTAURANT_KEY = 'caixa_restaurant';

const caixaApi = axios.create();

// Registrado no nível do módulo (não num useEffect): os filhos (CaixaChatView etc.)
// disparam a primeira requisição no próprio useEffect, que roda ANTES do useEffect do
// pai -- um token salvo já expirado passaria batido e a tela ficaria vazia. Só reage
// com sessão ativa (header setado): PIN errado também responde 401 e não pode deslogar.
let onSessionExpired = null;
caixaApi.interceptors.response.use(
  (res) => res,
  (err) => {
    const hadSession = Boolean(caixaApi.defaults.headers.common['Authorization']);
    if (hadSession && (err.response?.status === 401 || err.response?.status === 403) && onSessionExpired) {
      onSessionExpired();
    }
    return Promise.reject(err);
  }
);

function loadStoredSession() {
  const token = localStorage.getItem(TOKEN_KEY);
  const restaurantJson = localStorage.getItem(RESTAURANT_KEY);
  if (!token || !restaurantJson) return null;
  try {
    return { token, restaurant: JSON.parse(restaurantJson) };
  } catch {
    return null;
  }
}

export default function CaixaApp() {
  const stored = loadStoredSession();
  const [step, setStep] = useState(stored ? 'app' : 'select-restaurant');
  const [view, setView] = useState('conversas');
  const [restaurants, setRestaurants] = useState([]);
  const [selectedRestaurant, setSelectedRestaurant] = useState(stored?.restaurant || null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [lastEvent, setLastEvent] = useState(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const bp = useBreakpoint();

  if (stored) {
    caixaApi.defaults.headers.common['Authorization'] = `Bearer ${stored.token}`;
  }

  useEffect(() => {
    caixaApi.get('/api/staff/restaurants').then((res) => {
      setRestaurants(res.data.restaurants || []);
    }).catch(() => setError('Não foi possível carregar a lista de restaurantes.'));
  }, []);

  const handlePinSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await caixaApi.post('/api/staff/login', { clientId: selectedRestaurant.id, pin });
      caixaApi.defaults.headers.common['Authorization'] = `Bearer ${res.data.token}`;
      localStorage.setItem(TOKEN_KEY, res.data.token);
      localStorage.setItem(RESTAURANT_KEY, JSON.stringify(selectedRestaurant));
      setStep('app');
    } catch (err) {
      setError(err.response?.data?.error || 'PIN inválido.');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(RESTAURANT_KEY);
    delete caixaApi.defaults.headers.common['Authorization'];
    setSelectedRestaurant(null);
    setPin('');
    setView('conversas');
    setStep('select-restaurant');
  };

  onSessionExpired = handleLogout;

  useEffect(() => {
    window.addEventListener('pointerdown', unlockNotificationSound);
    return () => window.removeEventListener('pointerdown', unlockNotificationSound);
  }, []);

  useEffect(() => {
    if (step !== 'app') return;
    const authHeader = caixaApi.defaults.headers.common['Authorization'];
    const token = authHeader ? authHeader.replace('Bearer ', '') : null;
    if (!token) return;

    const source = new EventSource(`/api/whatsapp/events?token=${encodeURIComponent(token)}`);
    source.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        setLastEvent({ ...data, receivedAt: Date.now() });
        if (data.direction === 'inbound') playNotificationSound();
      } catch (err) {
        console.error('Error parsing SSE event:', err);
      }
    };

    return () => source.close();
  }, [step]);

  const inputStyle = {
    width: '100%',
    padding: '14px',
    borderRadius: '10px',
    border: '1px solid var(--border-color)',
    backgroundColor: 'var(--bg-card)',
    color: 'var(--text-primary)',
    marginBottom: '12px',
    fontSize: '1rem'
  };

  const buttonStyle = {
    width: '100%',
    padding: '14px',
    borderRadius: '10px',
    border: 'none',
    background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-primary-hover))',
    color: 'var(--on-accent)',
    fontWeight: 700,
    fontSize: '1rem',
    cursor: 'pointer'
  };

  if (step !== 'app') {
    return (
      <div className="page-pad" style={{
        minHeight: '100dvh', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        paddingTop: 'calc(16px + env(safe-area-inset-top))', paddingBottom: 'calc(16px + env(safe-area-inset-bottom))'
      }}>
        <div style={{ alignSelf: 'flex-end' }}><ThemeToggle /></div>
        <div style={{ width: '100%', maxWidth: '400px', margin: 'auto 0', paddingTop: '16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', marginBottom: '28px' }}>
            <AppIcon app="caixa" size={72} />
            <h1 style={{ fontSize: '1.8rem', margin: 0 }}>Caixa</h1>
            <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Conversas, funil e agenda</p>
          </div>
          {step === 'select-restaurant' && (
            <div>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Store size={18} /> Selecione o restaurante
              </h2>
              {error && <p style={{ color: 'var(--accent-danger)', marginBottom: '12px' }}>{error}</p>}
              {restaurants.map((r) => (
                <button
                  key={r.id}
                  onClick={() => { setSelectedRestaurant(r); setStep('pin'); }}
                  style={{ ...inputStyle, cursor: 'pointer', textAlign: 'left', fontWeight: 600, minHeight: '52px' }}
                >
                  {r.name}
                </button>
              ))}
            </div>
          )}

          {step === 'pin' && (
            <form onSubmit={handlePinSubmit}>
              <button type="button" onClick={() => setStep('select-restaurant')} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', marginBottom: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', minHeight: '44px' }}>
                <ArrowLeft size={16} /> Voltar
              </button>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Lock size={18} /> PIN de {selectedRestaurant?.name}
              </h2>
              <input
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="Digite o PIN"
                aria-label="PIN"
                autoFocus
                style={{ ...inputStyle, fontSize: '1.4rem', textAlign: 'center', letterSpacing: '0.3em' }}
              />
              {error && <p style={{ color: 'var(--accent-danger)', marginBottom: '12px' }}>{error}</p>}
              <button type="submit" style={buttonStyle}>Entrar</button>
            </form>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '0.8rem', opacity: 0.85, marginTop: '24px' }}>
          <span>por</span> <BrandLogo variant="horizontal" height={22} />
        </div>
      </div>
    );
  }

  const phone = bp === 'phone';
  const content = (
    <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', padding: phone ? 0 : bp === 'tablet' ? '12px' : '20px' }}>
      {view === 'conversas' && (
        <CaixaChatView caixaApi={caixaApi} lastEvent={lastEvent} />
      )}
      {(view === 'funil' || view === 'agenda') && (
        <div style={{ height: '100%', overflow: 'auto', padding: phone ? '12px' : 0 }}>
          <CaixaFunilView caixaApi={caixaApi} inputStyle={inputStyle} view={view} lastEvent={lastEvent} />
        </div>
      )}
    </div>
  );

  if (phone) {
    const tab = (key, label, Icon, onClick, active) => (
      <button key={key} type="button" onClick={onClick} aria-label={label} style={{
        minHeight: '56px', border: 'none', background: 'transparent', cursor: 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px',
        color: active ? 'var(--accent-link)' : 'var(--text-secondary)', fontWeight: active ? 700 : 600
      }}>
        <Icon size={22} />
        <span style={{ fontSize: '0.68rem' }}>{label}</span>
      </button>
    );
    return (
      <div style={{ height: '100dvh', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', display: 'flex', flexDirection: 'column', paddingTop: 'env(safe-area-inset-top)' }}>
        {content}
        <nav style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', flexShrink: 0,
          backgroundColor: 'var(--bg-sidebar)', borderTop: '1px solid var(--border-color)',
          paddingBottom: 'env(safe-area-inset-bottom)'
        }}>
          {NAV_ITEMS.map(({ key, label, icon: Icon }) => tab(key, label, Icon, () => setView(key), view === key))}
          {tab('mais', 'Mais', MoreHorizontal, () => setMoreOpen(true), false)}
        </nav>
        <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title={selectedRestaurant?.name || 'Caixa'}>
          <div style={{ display: 'grid', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', minHeight: '48px' }}>
              <span>Tema claro / escuro</span>
              <ThemeToggle />
            </div>
            <button type="button" onClick={() => { setMoreOpen(false); handleLogout(); }} style={{ ...inputStyle, marginBottom: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-danger)', fontWeight: 600 }}>
              <LogOut size={18} /> Sair
            </button>
          </div>
        </Sheet>
      </div>
    );
  }

  const railButton = (key, label, Icon, onClick, active, title) => (
    <button key={key} type="button" onClick={onClick} title={title || label} style={{
      width: '52px', height: '52px', borderRadius: '12px', border: 'none', cursor: 'pointer',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px',
      backgroundColor: active ? 'var(--accent-primary)' : 'transparent',
      color: active ? 'var(--on-accent)' : 'var(--text-secondary)'
    }}>
      <Icon size={20} />
      <span style={{ fontSize: '0.6rem', fontWeight: 600 }}>{label}</span>
    </button>
  );

  return (
    <div style={{ height: '100dvh', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', display: 'flex' }}>
      <nav style={{
        width: '72px', flexShrink: 0, backgroundColor: 'var(--bg-sidebar)', borderRight: '1px solid var(--border-color)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '16px', gap: '8px'
      }}>
        <AppIcon app="caixa" size={40} />
        <div style={{ height: '8px' }} />
        {NAV_ITEMS.map(({ key, label, icon: Icon }) => railButton(key, label, Icon, () => setView(key), view === key))}
        <div style={{ flex: 1 }} />
        <ThemeToggle />
        <div style={{ marginBottom: '16px' }}>
          {railButton('sair', 'Sair', LogOut, handleLogout, false, `Sair (${selectedRestaurant?.name})`)}
        </div>
      </nav>
      {content}
    </div>
  );
}
