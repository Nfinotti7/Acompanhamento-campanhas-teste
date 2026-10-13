import React, { useState, useEffect } from 'react';
import { CheckCircle2 } from 'lucide-react';
import ContactDetailPanel from './ContactDetailPanel';

const fieldStyle = {
  width: '100%',
  padding: '12px',
  borderRadius: '8px',
  border: '1px solid rgba(255,255,255,0.1)',
  backgroundColor: '#131b2e',
  color: '#fff',
  marginBottom: '10px',
  fontSize: '0.95rem'
};

const primaryBtn = {
  padding: '12px',
  borderRadius: '8px',
  border: 'none',
  color: '#fff',
  fontWeight: 700,
  cursor: 'pointer',
  width: '100%'
};

function ManualSaleForm({ apiClient, initialName, onDone }) {
  const [customerName, setCustomerName] = useState(initialName);
  const [amountSpent, setAmountSpent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await apiClient.post('/api/whatsapp/conversions', {
        contactId: null,
        customerName,
        phone: '',
        amountSpent: Number(amountSpent),
        matchedBy: 'manual'
      });
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao lançar conversão.');
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '14px' }}>
        <CheckCircle2 size={48} color="#10b981" />
        <p style={{ fontWeight: 700, fontSize: '1.1rem' }}>Feito!</p>
        <button onClick={onDone} style={{ ...primaryBtn, maxWidth: '200px', background: '#6366f1' }}>Voltar</button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: '360px' }}>
      <h3 style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: '14px' }}>Lançar venda (sem conversa)</h3>
      <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Nome do cliente" required style={fieldStyle} />
      <input type="number" step="0.01" value={amountSpent} onChange={(e) => setAmountSpent(e.target.value)} placeholder="Valor gasto (R$)" required autoFocus style={fieldStyle} />
      {error && <p style={{ color: '#f87171', marginBottom: '10px', fontSize: '0.85rem' }}>{error}</p>}
      <button type="submit" disabled={submitting} style={{ ...primaryBtn, background: 'linear-gradient(135deg, #10b981, #059669)' }}>
        {submitting ? 'Salvando...' : 'Lançar venda'}
      </button>
    </form>
  );
}

export default function CaixaChatView({ caixaApi }) {
  const [conversations, setConversations] = useState([]);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null); // null = mostra conversas; array = resultado da busca
  const [selectedContact, setSelectedContact] = useState(null);
  const [manualEntryName, setManualEntryName] = useState(null);

  useEffect(() => {
    fetchConversations();
  }, []);

  const fetchConversations = async () => {
    try {
      const res = await caixaApi.get('/api/whatsapp/conversations');
      setConversations(res.data.conversations || []);
    } catch (err) {
      console.error('Error fetching conversations:', err);
    }
  };

  const handleSearchChange = async (e) => {
    const value = e.target.value;
    setQuery(value);
    if (!value.trim()) {
      setSearchResults(null);
      return;
    }
    try {
      const res = await caixaApi.get('/api/whatsapp/contacts/search', { params: { q: value } });
      setSearchResults(res.data.contacts || []);
    } catch (err) {
      console.error('Error searching contacts:', err);
    }
  };

  const selectConversation = (contact) => {
    setSelectedContact(contact);
    setManualEntryName(null);
  };

  const skipMatch = () => {
    setSelectedContact(null);
    setManualEntryName(query);
  };

  const finishManualEntry = () => {
    setManualEntryName(null);
    setQuery('');
    setSearchResults(null);
    fetchConversations();
  };

  const listToShow = searchResults !== null ? searchResults : conversations;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', height: '560px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', overflow: 'hidden' }}>
      <div style={{ borderRight: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', backgroundColor: '#0f1420' }}>
        <div style={{ padding: '10px' }}>
          <input
            type="text"
            value={query}
            onChange={handleSearchChange}
            placeholder="Buscar nome ou telefone"
            style={{ ...fieldStyle, marginBottom: 0 }}
          />
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {listToShow.length === 0 && (
            <p style={{ padding: '14px', color: '#64748b', fontSize: '0.8rem' }}>
              {searchResults !== null ? 'Nenhum contato encontrado.' : 'Nenhuma conversa ainda.'}
            </p>
          )}
          {listToShow.map((c) => (
            <div
              key={c.id}
              onClick={() => selectConversation(c)}
              style={{
                padding: '12px',
                cursor: 'pointer',
                backgroundColor: selectedContact?.id === c.id ? 'rgba(255,255,255,0.06)' : 'transparent',
                borderBottom: '1px solid rgba(255,255,255,0.04)'
              }}
            >
              <div style={{ fontWeight: 600, color: '#fff', fontSize: '0.88rem' }}>{c.profile_name || c.wa_id}</div>
              <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{c.wa_id}{c.source === 'ad' ? ' · anúncio' : ''}</div>
            </div>
          ))}
          {searchResults !== null && query && (
            <div
              onClick={skipMatch}
              style={{
                margin: '10px',
                padding: '12px',
                cursor: 'pointer',
                textAlign: 'center',
                color: '#94a3b8',
                fontSize: '0.78rem',
                border: '1px dashed rgba(255,255,255,0.15)',
                borderRadius: '8px'
              }}
            >
              Não achei — lançar venda mesmo assim
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: '16px', minWidth: 0 }}>
        {selectedContact ? (
          <ContactDetailPanel apiClient={caixaApi} contact={selectedContact} onUpdated={fetchConversations} />
        ) : manualEntryName !== null ? (
          <ManualSaleForm apiClient={caixaApi} initialName={manualEntryName} onDone={finishManualEntry} />
        ) : (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: '0.9rem' }}>
            Selecione uma conversa
          </div>
        )}
      </div>
    </div>
  );
}
