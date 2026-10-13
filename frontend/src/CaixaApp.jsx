import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Store, Lock, ArrowLeft, MessageCircle, Columns3, CalendarDays } from 'lucide-react';
import CaixaChatView from './components/CaixaChatView';
import CaixaFunilView from './components/CaixaFunilView';

const NAV_ITEMS = [
  { key: 'conversas', label: 'Conversas', icon: MessageCircle },
  { key: 'funil', label: 'Funil', icon: Columns3 },
  { key: 'agenda', label: 'Agenda', icon: CalendarDays }
];

const caixaApi = axios.create();

export default function CaixaApp() {
  const [step, setStep] = useState('select-restaurant');
  const [view, setView] = useState('conversas');
  const [restaurants, setRestaurants] = useState([]);
  const [selectedRestaurant, setSelectedRestaurant] = useState(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

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
      setStep('app');
    } catch (err) {
      setError(err.response?.data?.error || 'PIN inválido.');
    }
  };

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
      </nav>

      <div style={{ flex: 1, overflow: 'hidden', padding: '20px' }}>
        {view === 'conversas' && (
          <CaixaChatView caixaApi={caixaApi} />
        )}

        {(view === 'funil' || view === 'agenda') && (
          <CaixaFunilView caixaApi={caixaApi} inputStyle={inputStyle} view={view} />
        )}
      </div>
    </div>
  );
}
