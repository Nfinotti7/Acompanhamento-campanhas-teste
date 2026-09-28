import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Store, Lock, Search, CheckCircle2, ArrowLeft } from 'lucide-react';

const caixaApi = axios.create();

export default function CaixaApp() {
  const [step, setStep] = useState('select-restaurant');
  const [restaurants, setRestaurants] = useState([]);
  const [selectedRestaurant, setSelectedRestaurant] = useState(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [selectedContact, setSelectedContact] = useState(null);
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [amountSpent, setAmountSpent] = useState('');
  const [submitting, setSubmitting] = useState(false);

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
      setStep('search');
    } catch (err) {
      setError(err.response?.data?.error || 'PIN inválido.');
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    try {
      const res = await caixaApi.get('/api/whatsapp/contacts/search', { params: { q: query } });
      setResults(res.data.contacts || []);
    } catch (err) {
      setError('Erro ao buscar.');
    }
  };

  const selectContact = (contact) => {
    setSelectedContact(contact);
    setCustomerName(contact.profile_name || '');
    setPhone(contact.wa_id || '');
    setStep('confirm');
  };

  const skipMatch = () => {
    setSelectedContact(null);
    setCustomerName(query);
    setPhone('');
    setStep('confirm');
  };

  const handleConfirm = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await caixaApi.post('/api/whatsapp/conversions', {
        contactId: selectedContact?.id || null,
        customerName,
        phone,
        amountSpent: Number(amountSpent),
        matchedBy: selectedContact ? 'phone' : 'manual'
      });
      setStep('success');
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao lançar conversão.');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForNext = () => {
    setQuery('');
    setResults([]);
    setSelectedContact(null);
    setCustomerName('');
    setPhone('');
    setAmountSpent('');
    setStep('search');
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

        {step === 'search' && (
          <form onSubmit={handleSearch}>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Search size={22} /> Buscar cliente
            </h1>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nome ou telefone"
              autoFocus
              style={inputStyle}
            />
            <button type="submit" style={{ ...buttonStyle, marginBottom: '16px' }}>Buscar</button>

            {results.map((c) => (
              <button
                type="button"
                key={c.id}
                onClick={() => selectContact(c)}
                style={{ ...inputStyle, cursor: 'pointer', textAlign: 'left' }}
              >
                <div style={{ fontWeight: 600 }}>{c.profile_name || 'Sem nome'}</div>
                <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{c.wa_id}{c.source === 'ad' ? ' · veio de anúncio' : ''}</div>
              </button>
            ))}

            {query && (
              <button
                type="button"
                onClick={skipMatch}
                style={{ ...inputStyle, cursor: 'pointer', border: '1px dashed rgba(255,255,255,0.2)', backgroundColor: 'transparent', color: '#94a3b8', textAlign: 'center' }}
              >
                Não achei — lançar mesmo assim
              </button>
            )}
          </form>
        )}

        {step === 'confirm' && (
          <form onSubmit={handleConfirm}>
            <button type="button" onClick={() => setStep('search')} style={{ background: 'none', border: 'none', color: '#94a3b8', marginBottom: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <ArrowLeft size={16} /> Voltar
            </button>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '16px' }}>Confirmar venda</h1>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Nome do cliente"
              required
              style={inputStyle}
            />
            <input
              type="number"
              step="0.01"
              value={amountSpent}
              onChange={(e) => setAmountSpent(e.target.value)}
              placeholder="Valor gasto (R$)"
              required
              autoFocus
              style={{ ...inputStyle, fontSize: '1.2rem' }}
            />
            {error && <p style={{ color: '#f87171', marginBottom: '12px' }}>{error}</p>}
            <button type="submit" disabled={submitting} style={{ ...buttonStyle, background: 'linear-gradient(135deg, #10b981, #059669)' }}>
              {submitting ? 'Salvando...' : 'Lançar venda'}
            </button>
          </form>
        )}

        {step === 'success' && (
          <div style={{ textAlign: 'center' }}>
            <CheckCircle2 size={56} color="#10b981" style={{ margin: '0 auto 16px' }} />
            <h1 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '20px' }}>Venda lançada!</h1>
            <button onClick={resetForNext} style={buttonStyle}>Lançar próxima</button>
          </div>
        )}
      </div>
    </div>
  );
}
