import React, { useState, useEffect, useRef } from 'react';
import { useBreakpoint } from '../responsive/useBreakpoint';
import { CheckCircle2, ArrowLeft } from 'lucide-react';
import ContactDetailPanel from './ContactDetailPanel';
import { Avatar } from './whatsappMedia';
import { formatListTime, StatusTicks } from './chatFormat';

const fieldStyle = {
  width: '100%',
  padding: '12px',
  borderRadius: '8px',
  border: '1px solid var(--border-color)',
  backgroundColor: 'var(--bg-card)',
  color: 'var(--text-primary)',
  marginBottom: '10px',
  fontSize: '0.95rem'
};

const primaryBtn = {
  padding: '12px',
  borderRadius: '8px',
  border: 'none',
  color: 'var(--on-accent)',
  fontWeight: 700,
  cursor: 'pointer',
  width: '100%'
};

function ManualSaleForm({ apiClient, initialName, onDone, onBack }) {
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
        <CheckCircle2 size={48} color="var(--accent-success)" />
        <p style={{ fontWeight: 700, fontSize: '1.1rem' }}>Feito!</p>
        <button onClick={onDone} style={{ ...primaryBtn, maxWidth: '200px', background: 'var(--accent-primary)' }}>Voltar</button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: '360px' }}>
      <h3 style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        {onBack && <button type="button" className="icon-button" onClick={onBack} aria-label="Voltar pra lista"><ArrowLeft size={18} /></button>}
        Lançar venda (sem conversa)
      </h3>
      <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Nome do cliente" required style={fieldStyle} />
      <input type="number" step="0.01" value={amountSpent} onChange={(e) => setAmountSpent(e.target.value)} placeholder="Valor gasto (R$)" required autoFocus style={fieldStyle} />
      {error && <p style={{ color: 'var(--accent-danger)', marginBottom: '10px', fontSize: '0.85rem' }}>{error}</p>}
      <button type="submit" disabled={submitting} style={{ ...primaryBtn, background: 'linear-gradient(135deg, var(--accent-success), var(--accent-success))' }}>
        {submitting ? 'Salvando...' : 'Lançar venda'}
      </button>
    </form>
  );
}

export default function CaixaChatView({ caixaApi, lastEvent }) {
  const bp = useBreakpoint();
  const phone = bp === 'phone';
  const [conversations, setConversations] = useState([]);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null); // null = mostra conversas; array = resultado da busca
  const [selectedContact, setSelectedContact] = useState(null);
  const [manualEntryName, setManualEntryName] = useState(null);
  const [liveSignal, setLiveSignal] = useState(null);

  useEffect(() => {
    fetchConversations();
  }, []);

  useEffect(() => {
    if (!lastEvent) return;
    fetchConversations();
    if (selectedContact && lastEvent.contactId === selectedContact.id) {
      setLiveSignal(lastEvent.receivedAt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEvent]);

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

  const markReadLocally = (contactId) => {
    setConversations((prev) => prev.map((c) => (c.id === contactId ? { ...c, unread_count: 0 } : c)));
  };

  // Total de não lidas no título da aba -- dá pra ver que chegou mensagem mesmo com a
  // aba em segundo plano, como no WhatsApp Web.
  const totalUnread = conversations.reduce(
    (sum, c) => sum + (c.id === selectedContact?.id ? 0 : Number(c.unread_count || 0)),
    0
  );
  useEffect(() => {
    const baseTitle = 'Caixa';
    document.title = totalUnread > 0 ? `(${totalUnread}) ${baseTitle}` : baseTitle;
  }, [totalUnread]);

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
  const detailOpen = Boolean(selectedContact) || manualEntryName !== null;

  // Celular: lista e conversa são duas telas. Abrir a conversa empilha um item no
  // histórico, então o "voltar" do Android/iOS (e o botão de voltar do painel) volta pra lista.
  const pushedRef = useRef(false);
  useEffect(() => {
    if (!phone || !detailOpen) return undefined;
    window.history.pushState({ caixaChat: true }, '');
    pushedRef.current = true;
    const onPop = () => { pushedRef.current = false; setSelectedContact(null); setManualEntryName(null); };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      // Fechou por outro caminho (venda manual, apagou o contato, trocou de aba, girou a tela):
      // tira a entrada que empilhamos, senão o "voltar" do aparelho fica preso nela.
      if (pushedRef.current) { pushedRef.current = false; window.history.back(); }
    };
  }, [phone, detailOpen]);
  const backToList = () => window.history.back();

  return (
    // minmax(0, 1fr) / minHeight: 0: sem isso as áreas com rolagem crescem do tamanho
    // do conteúdo em vez de rolar, e as mensagens mais novas ficam cortadas.
    <div style={{ display: 'grid', gridTemplateColumns: phone ? '1fr' : bp === 'tablet' ? '280px 1fr' : '300px 1fr', gridTemplateRows: 'minmax(0, 1fr)', height: '100%', border: phone ? 'none' : '1px solid var(--border-color)', borderRadius: phone ? 0 : '12px', overflow: 'hidden' }}>
      <div style={{ borderRight: phone ? 'none' : '1px solid var(--border-color)', display: phone && detailOpen ? 'none' : 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-card)', minHeight: 0 }}>
        <div style={{ padding: '10px' }}>
          <input
            type="text"
            value={query}
            onChange={handleSearchChange}
            placeholder="Buscar nome ou telefone"
            style={{ ...fieldStyle, marginBottom: 0 }}
          />
        </div>
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {listToShow.length === 0 && (
            <p style={{ padding: '14px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              {searchResults !== null ? 'Nenhum contato encontrado.' : 'Nenhuma conversa ainda.'}
            </p>
          )}
          {listToShow.map((c) => {
            const selected = selectedContact?.id === c.id;
            // A conversa aberta nunca mostra "não lida", mesmo no instante entre a lista
            // recarregar e o painel marcar como lida.
            const unread = selected ? 0 : Number(c.unread_count || 0);
            const hasPreview = c.last_body !== undefined && c.last_body !== null;
            return (
              <div
                key={c.id}
                onClick={() => selectConversation(c)}
                style={{
                  padding: '10px 12px',
                  cursor: 'pointer',
                  backgroundColor: selected ? 'var(--surface-subtle)' : 'transparent',
                  borderBottom: '1px solid var(--border-color)',
                  display: 'flex',
                  gap: '10px',
                  alignItems: 'center'
                }}
              >
                <Avatar apiClient={caixaApi} mediaId={c.profile_pic_media_id} name={c.profile_name || c.wa_id} size={42} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                    <div style={{ flex: 1, fontWeight: unread > 0 ? 800 : 600, color: 'var(--text-primary)', fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.profile_name || c.wa_id}
                    </div>
                    <span style={{ fontSize: '0.68rem', color: unread > 0 ? 'var(--accent-success)' : 'var(--text-secondary)', flexShrink: 0, fontWeight: unread > 0 ? 700 : 400 }}>
                      {formatListTime(c.last_sent_at || c.last_message_at)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '3px', fontSize: '0.75rem', color: unread > 0 ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                      {hasPreview && c.last_direction === 'outbound' && <StatusTicks status={c.last_status} size={13} color="var(--text-secondary)" />}
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {hasPreview ? c.last_body : `${c.wa_id}${c.source === 'ad' ? ' · anúncio' : ''}`}
                      </span>
                    </div>
                    {unread > 0 && (
                      <span style={{ minWidth: 20, height: 20, padding: '0 6px', borderRadius: 10, backgroundColor: 'var(--accent-success)', color: 'var(--bg-dark)', fontSize: '0.7rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {unread > 99 ? '99+' : unread}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {searchResults !== null && query && (
            <div
              onClick={skipMatch}
              style={{
                margin: '10px',
                padding: '12px',
                cursor: 'pointer',
                textAlign: 'center',
                color: 'var(--text-secondary)',
                fontSize: '0.78rem',
                border: '1px dashed var(--border-strong)',
                borderRadius: '8px'
              }}
            >
              Não achei — lançar venda mesmo assim
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: phone ? '12px' : '16px', minWidth: 0, minHeight: 0, overflow: 'hidden', display: phone && !detailOpen ? 'none' : 'block' }}>
        {selectedContact ? (
          <ContactDetailPanel
            apiClient={caixaApi}
            contact={selectedContact}
            onUpdated={fetchConversations}
            onDeleted={() => { setSelectedContact(null); fetchConversations(); }}
            onRead={markReadLocally}
            liveUpdateSignal={liveSignal}
            onBack={phone ? backToList : undefined}
          />
        ) : manualEntryName !== null ? (
          <ManualSaleForm apiClient={caixaApi} initialName={manualEntryName} onDone={finishManualEntry} onBack={phone ? backToList : undefined} />
        ) : (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Selecione uma conversa
          </div>
        )}
      </div>
    </div>
  );
}
