import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Store, Lock, ArrowLeft, Users, Settings, LogOut } from 'lucide-react';
import QueueBoard from './components/namesa/QueueBoard';
import WaitlistSettings from './components/namesa/WaitlistSettings';
import { playNotificationSound, unlockNotificationSound } from './components/notificationSound';

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

const C = {
  bg: '#0b1120', panel: '#131b2e', border: 'rgba(255,255,255,0.1)', text: '#fff',
  muted: '#94a3b8', accent: '#f59e0b'
};

const inputStyle = {
  width: '100%', padding: '14px', borderRadius: '10px', border: `1px solid ${C.border}`,
  backgroundColor: C.panel, color: C.text, marginBottom: '12px', fontSize: '1rem'
};
const buttonStyle = {
  width: '100%', padding: '14px', borderRadius: '10px', border: 'none',
  background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#111', fontWeight: 700,
  fontSize: '1rem', cursor: 'pointer'
};

export default function NaMesaApp() {
  const stored = loadStoredSession();
  const [step, setStep] = useState(stored ? 'app' : 'select');
  const [tab, setTab] = useState('fila');
  const [restaurants, setRestaurants] = useState([]);
  const [restaurant, setRestaurant] = useState(stored?.restaurant || null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  if (stored) api.defaults.headers.common['Authorization'] = `Bearer ${stored.token}`;

  useEffect(() => {
    api.get('/api/staff/restaurants', { params: { product: 'waitlist' } })
      .then((res) => setRestaurants(res.data.restaurants || []))
      .catch(() => setError('Não foi possível carregar a lista de restaurantes.'));
  }, []);

  const handleLogout = () => {
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
      <div style={{ minHeight: '100vh', background: C.bg, color: C.text, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
        <div style={{ width: '100%', maxWidth: '380px' }}>
          <h1 style={{ textAlign: 'center', marginBottom: '4px' }}>Na Mesa</h1>
          <p style={{ textAlign: 'center', color: C.muted, marginBottom: '24px' }}>Fila de espera</p>
          {error && <p style={{ color: '#f87171', marginBottom: '12px' }}>{error}</p>}
          {step === 'select' && (
            <>
              {restaurants.length === 0 && <p style={{ color: C.muted, textAlign: 'center' }}>Nenhum restaurante com fila ativa.</p>}
              {restaurants.map((r) => (
                <button key={r.id} style={{ ...buttonStyle, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'center' }}
                  onClick={() => { setRestaurant(r); setError(''); setStep('pin'); }}>
                  <Store size={18} /> {r.name}
                </button>
              ))}
            </>
          )}
          {step === 'pin' && (
            <form onSubmit={handlePin}>
              <button type="button" onClick={() => setStep('select')} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ArrowLeft size={16} /> {restaurant?.name}
              </button>
              <input style={inputStyle} type="password" inputMode="numeric" placeholder="PIN" value={pin} onChange={(e) => setPin(e.target.value)} autoFocus />
              <button style={buttonStyle} type="submit"><Lock size={16} style={{ verticalAlign: 'middle' }} /> Entrar</button>
            </form>
          )}
        </div>
      </div>
    );
  }

  const tabButton = (key, label, Icon) => (
    <button onClick={() => setTab(key)} style={{
      padding: '10px 16px', borderRadius: '10px', border: 'none', cursor: 'pointer', fontWeight: 700,
      display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem',
      background: tab === key ? C.accent : 'transparent', color: tab === key ? '#111' : C.text
    }}><Icon size={18} /> {label}</button>
  );

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderBottom: `1px solid ${C.border}`, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: '1.2rem', marginRight: 'auto' }}>Na Mesa · {restaurant?.name}</strong>
        {tabButton('fila', 'Fila', Users)}
        {tabButton('config', 'Configurar', Settings)}
        <button onClick={handleLogout} title="Sair" style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer' }}><LogOut size={20} /></button>
      </header>
      <main style={{ padding: '16px', maxWidth: '1100px', margin: '0 auto' }}>
        {tab === 'fila' ? <QueueBoard api={api} refreshKey={refreshKey} /> : <WaitlistSettings api={api} />}
      </main>
    </div>
  );
}
