import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Store, Lock, ArrowLeft, Users, Settings, LogOut, FileText } from 'lucide-react';
import QueueBoard from './components/namesa/QueueBoard';
import WaitlistSettings from './components/namesa/WaitlistSettings';
import WaitlistReport from './components/namesa/WaitlistReport';
import { playNotificationSound, unlockNotificationSound } from './components/notificationSound';
import AppIcon from './brand/AppIcon';
import BrandLogo from './brand/BrandLogo';
import ThemeToggle from './theme/ThemeToggle';
import { useBreakpoint } from './responsive/useBreakpoint';
import PushPrompt from './pwa/PushPrompt';
import { syncPush, disablePush } from './pwa/push';

const TOKEN_KEY = 'namesa_token';
const RESTAURANT_KEY = 'namesa_restaurant';

const api = axios.create();

// Mesmo padrão do CaixaApp: interceptor no módulo, só desloga se já havia sessão
// (PIN errado também responde 401 e não pode jogar pra fora).
let onSessionExpired = null;
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const hadSession = Boolean(api.defaults.headers.common['Authorization']);
    if (hadSession && (err.response?.status === 401 || err.response?.status === 403) && onSessionExpired) {
      onSessionExpired();
    }
    return Promise.reject(err);
  }
);

function loadStoredSession() {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const restaurant = JSON.parse(localStorage.getItem(RESTAURANT_KEY) || 'null');
    return token && restaurant ? { token, restaurant } : null;
  } catch {
    return null;
  }
}

export default function NaMesaApp() {
  const stored = loadStoredSession();
  const bp = useBreakpoint();
  const [step, setStep] = useState(stored ? 'app' : 'select');
  const [tab, setTab] = useState('fila');
  const [restaurants, setRestaurants] = useState(null);
  const [restaurant, setRestaurant] = useState(stored?.restaurant || null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  if (stored) api.defaults.headers.common['Authorization'] = `Bearer ${stored.token}`;

  useEffect(() => {
    api.get('/api/staff/restaurants', { params: { product: 'waitlist' } })
      .then((res) => setRestaurants(res.data.restaurants || []))
      .catch(() => {
        setRestaurants([]);
        setError('Não foi possível carregar a lista de restaurantes.');
      });
  }, []);

  const handleLogout = () => {
    disablePush(api, 'namesa', api.defaults.headers.common['Authorization']);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(RESTAURANT_KEY);
    delete api.defaults.headers.common['Authorization'];
    setRestaurant(null);
    setPin('');
    setTab('fila');
    setStep('select');
  };
  onSessionExpired = handleLogout;

  const handlePin = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await api.post('/api/staff/login', { clientId: restaurant.id, pin });
      api.defaults.headers.common['Authorization'] = `Bearer ${res.data.token}`;
      localStorage.setItem(TOKEN_KEY, res.data.token);
      localStorage.setItem(RESTAURANT_KEY, JSON.stringify(restaurant));
      setStep('app');
    } catch (err) {
      setError(err.response?.data?.error || 'PIN inválido.');
    }
  };

  // Aparelho que já permitiu notificações: avisa o servidor de qual restaurante ele é.
  useEffect(() => {
    if (step === 'app') syncPush(api, 'namesa');
  }, [step]);

  useEffect(() => {
    window.addEventListener('pointerdown', unlockNotificationSound);
    return () => window.removeEventListener('pointerdown', unlockNotificationSound);
  }, []);

  useEffect(() => {
    if (step !== 'app') return;
    const token = (api.defaults.headers.common['Authorization'] || '').replace('Bearer ', '');
    if (!token) return;
    const source = new EventSource(`/api/whatsapp/events?token=${encodeURIComponent(token)}`);
    source.addEventListener('waitlist', (e) => {
      setRefreshKey((k) => k + 1);
      try {
        if (JSON.parse(e.data).reason === 'joined') playNotificationSound();
      } catch { /* evento sem corpo */ }
    });
    return () => source.close();
  }, [step]);

  if (step !== 'app') {
    return (
      <div className="page-pad" style={{
        minHeight: '100dvh', background: 'var(--bg-dark)', color: 'var(--text-primary)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        paddingTop: 'calc(16px + env(safe-area-inset-top))', paddingBottom: 'calc(16px + env(safe-area-inset-bottom))'
      }}>
        <div style={{ alignSelf: 'flex-end' }}><ThemeToggle /></div>
        <div style={{ width: '100%', maxWidth: '380px', margin: 'auto 0', paddingTop: '16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', marginBottom: '28px' }}>
            <AppIcon app="namesa" size={72} />
            <h1 style={{ fontSize: '1.8rem', margin: 0 }}>Na Mesa</h1>
            <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Fila de espera</p>
          </div>
          {error && <p style={{ color: 'var(--accent-danger)', marginBottom: '12px', textAlign: 'center' }}>{error}</p>}
          {step === 'select' && (
            <div style={{ display: 'grid', gap: '10px' }}>
              {restaurants === null && <p style={{ color: 'var(--text-muted)', textAlign: 'center' }}>Carregando...</p>}
              {restaurants?.length === 0 && !error && <p style={{ color: 'var(--text-muted)', textAlign: 'center' }}>Nenhum restaurante pronto ainda. Peça pra agência ativar o Na Mesa e definir o PIN do restaurante.</p>}
              {(restaurants || []).map((r) => (
                <button key={r.id} className="nm-btn nm-btn-primary" style={{ width: '100%', minHeight: '54px', fontSize: '1.05rem' }}
                  onClick={() => { setRestaurant(r); setError(''); setStep('pin'); }}>
                  <Store size={18} /> {r.name}
                </button>
              ))}
            </div>
          )}
          {step === 'pin' && (
            <form onSubmit={handlePin} style={{ display: 'grid', gap: '12px' }}>
              <button type="button" className="nm-btn nm-btn-ghost" style={{ justifySelf: 'start' }} onClick={() => setStep('select')}>
                <ArrowLeft size={16} /> {restaurant?.name}
              </button>
              <input className="nm-input" style={{ fontSize: '1.4rem', textAlign: 'center', letterSpacing: '0.3em' }}
                type="password" inputMode="numeric" placeholder="PIN" aria-label="PIN" value={pin}
                onChange={(e) => setPin(e.target.value)} autoFocus />
              <button className="nm-btn nm-btn-primary" type="submit" style={{ width: '100%' }}><Lock size={16} /> Entrar</button>
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
  const tabButton = (key, label, Icon) => (
    <button key={key} onClick={() => setTab(key)} aria-label={label} title={label} className="nm-btn" style={{
      minHeight: '44px', padding: phone ? '10px 12px' : '10px 16px',
      background: tab === key ? 'var(--accent-primary)' : 'transparent',
      color: tab === key ? 'var(--on-accent)' : 'var(--text-secondary)'
    }}><Icon size={18} />{!phone && <span>{label}</span>}</button>
  );

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg-dark)', color: 'var(--text-primary)' }}>
      <header className="page-pad" style={{
        position: 'sticky', top: 0, zIndex: 40, display: 'flex', alignItems: 'center', gap: '8px',
        paddingTop: 'calc(10px + env(safe-area-inset-top))', paddingBottom: '10px',
        background: 'var(--bg-sidebar)', borderBottom: '1px solid var(--border-color)'
      }}>
        <AppIcon app="namesa" size={phone ? 32 : 36} />
        <div style={{ marginRight: 'auto', minWidth: 0, lineHeight: 1.2 }}>
          <strong style={{ fontSize: phone ? '1rem' : '1.15rem' }}>Na Mesa{!phone && ` · ${restaurant?.name || ''}`}</strong>
          {phone && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{restaurant?.name}</div>}
        </div>
        {tabButton('fila', 'Fila', Users)}
        {tabButton('relatorio', 'Relatório', FileText)}
        {tabButton('config', 'Configurar', Settings)}
        <ThemeToggle />
        <button onClick={handleLogout} title="Sair" aria-label="Sair" className="icon-button"><LogOut size={18} /></button>
      </header>
      <main className="page-pad" style={{ paddingTop: '16px', paddingBottom: '16px', maxWidth: '1100px', margin: '0 auto' }}>
        <PushPrompt api={api} app="namesa" text="Ative as notificações pra saber quando alguém entrar na fila, mesmo com o app fechado." />
        {tab === 'fila' && <QueueBoard api={api} refreshKey={refreshKey} onReconnect={() => setTab('config')} />}
        {tab === 'relatorio' && <WaitlistReport api={api} restaurant={restaurant} />}
        {tab === 'config' && <WaitlistSettings api={api} />}
      </main>
    </div>
  );
}
