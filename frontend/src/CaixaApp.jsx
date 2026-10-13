import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Store, Lock, ArrowLeft, MessageCircle, Columns3, CalendarDays, LogOut } from 'lucide-react';
import CaixaChatView from './components/CaixaChatView';
import CaixaFunilView from './components/CaixaFunilView';

const NAV_ITEMS = [
  { key: 'conversas', label: 'Conversas', icon: MessageCircle },
  { key: 'funil', label: 'Funil', icon: Columns3 },
  { key: 'agenda', label: 'Agenda', icon: CalendarDays }
];

const TOKEN_KEY = 'caixa_token';
const RESTAURANT_KEY = 'caixa_restaurant';

const caixaApi = axios.create();

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

  useEffect(() => {
    const interceptorId = caixaApi.interceptors.response.use(
      (res) => res,
      (err) => {
        if (err.response?.status === 401 || err.response?.status === 403) {
          handleLogout();
        }
        return Promise.reject(err);
      }
    );
    return () => caixaApi.interceptors.response.eject(interceptorId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (step !== 'app') return;
    const authHeader = caixaApi.defaults.headers.common['Authorization'];
    const token = authHeader ? authHeader.replace('Bearer ', '') : null;
    if (!token) return;

    const source = new EventSource(`/api/whatsapp/events?token=${encodeURIComponent(token)}`);
    source.onmessage = (e) => {
      try {
        setLastEvent({ ...JSON.parse(e.data), receivedAt: Date.now() });
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
    border: '1px solid rgba(255,255,255,0.1)',
    backgroundColor: '#131b2e',
    color: '#fff',
    marginBottom: '12px',
    fontSize: '1rem'
  };

  const buttonStyle = {
    width: '100%',
    padding: '14px',
    borderRadius: '10px',
    border: 'none',
    background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
    color: '#fff',
    fontWeight: 700,
    fontSize: '1rem',
    cursor: 'pointer'
  };

  if (step !== 'app') {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#0b0f19',
        color: '#f8fafc',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        fontFamily: "'Inter', sans-serif"
      }}>
        <div style={{ width: '100%', maxWidth: '400px' }}>
          {step === 'select-restaurant' && (
            <div>
              <h1 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Store size={22} /> Selecione o restaurante
              </h1>
              {error && <p style={{ color: '#f87171', marginBottom: '12px' }}>{error}</p>}
              {restaurants.map((r) => (
                <button
                  key={r.id}
                  onClick={() => { setSelectedRestaurant(r); setStep('pin'); }}
                  style={{ ...inputStyle, cursor: 'pointer', textAlign: 'left', fontWeight: 600 }}
                >
                  {r.name}
                </button>
              ))}
            </div>
          )}

          {step === 'pin' && (
            <form onSubmit={handlePinSubmit}>
              <button type="button" onClick={() => setStep('select-restaurant')} style={{ background: 'none', border: 'none', color: '#94a3b8', marginBottom: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <ArrowLeft size={16} /> Voltar
              </button>
              <h1 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Lock size={22} /> PIN de {selectedRestaurant?.name}
              </h1>
              <input
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="Digite o PIN"
                autoFocus
                style={{ ...inputStyle, fontSize: '1.4rem', textAlign: 'center' }}
              />
              {error && <p style={{ color: '#f87171', marginBottom: '12px' }}>{error}</p>}
              <button type="submit" style={buttonStyle}>Entrar</button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{
      height: '100vh',
      backgroundColor: '#0b0f19',
      color: '#f8fafc',
      display: 'flex',
      fontFamily: "'Inter', sans-serif"
    }}>
      <nav style={{
        width: '72px',
        flexShrink: 0,
        backgroundColor: '#0f1420',
        borderRight: '1px solid rgba(255,255,255,0.08)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: '20px',
        gap: '8px'
      }}>
        {NAV_ITEMS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setView(key)}
            title={label}
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '12px',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '2px',
              backgroundColor: view === key ? '#6366f1' : 'transparent',
              color: view === key ? '#fff' : '#94a3b8'
            }}
          >
            <Icon size={20} />
            <span style={{ fontSize: '0.6rem', fontWeight: 600 }}>{label}</span>
          </button>
        ))}

        <div style={{ flex: 1 }} />

        <button
          type="button"
          onClick={handleLogout}
          title={`Sair (${selectedRestaurant?.name})`}
          style={{
            width: '52px',
            height: '52px',
            marginBottom: '16px',
            borderRadius: '12px',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '2px',
            backgroundColor: 'transparent',
            color: '#94a3b8'
          }}
        >
          <LogOut size={20} />
          <span style={{ fontSize: '0.6rem', fontWeight: 600 }}>Sair</span>
        </button>
      </nav>

      <div style={{ flex: 1, overflow: 'hidden', padding: '20px' }}>
        {view === 'conversas' && (
          <CaixaChatView caixaApi={caixaApi} lastEvent={lastEvent} />
        )}

        {(view === 'funil' || view === 'agenda') && (
          <CaixaFunilView caixaApi={caixaApi} inputStyle={inputStyle} view={view} lastEvent={lastEvent} />
        )}
      </div>
    </div>
  );
}
