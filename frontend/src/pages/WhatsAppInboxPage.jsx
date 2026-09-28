import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { MessageCircle, Send } from 'lucide-react';

export default function WhatsAppInboxPage({ selectedClient }) {
  const [conversations, setConversations] = useState([]);
  const [selectedContactId, setSelectedContactId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [replyText, setReplyText] = useState('');
  const [roi, setRoi] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetchConversations();
    fetchRoi();
  }, [selectedClient]);

  useEffect(() => {
    if (selectedContactId) fetchMessages(selectedContactId);
  }, [selectedContactId]);

  const fetchConversations = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/whatsapp/conversations', { params: { clientId: selectedClient } });
      setConversations(res.data.conversations || []);
    } catch (err) {
      console.error('Error fetching conversations:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchRoi = async () => {
    try {
      const res = await axios.get('/api/whatsapp/roi', { params: { clientId: selectedClient } });
      setRoi(res.data.roi);
    } catch (err) {
      console.error('Error fetching WhatsApp ROI:', err);
    }
  };

  const fetchMessages = async (contactId) => {
    try {
      const res = await axios.get(`/api/whatsapp/conversations/${contactId}/messages`, { params: { clientId: selectedClient } });
      setMessages(res.data.messages || []);
    } catch (err) {
      console.error('Error fetching messages:', err);
    }
  };

  const handleSendReply = async (e) => {
    e.preventDefault();
    if (!replyText.trim() || !selectedContactId) return;
    setSending(true);
    try {
      await axios.post(`/api/whatsapp/conversations/${selectedContactId}/reply`, {
        clientId: selectedClient,
        body: replyText
      });
      setReplyText('');
      fetchMessages(selectedContactId);
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao enviar mensagem.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <MessageCircle size={28} color="var(--accent-success)" />
          WhatsApp & Conversões Reais
        </h1>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          Conversas vindas de anúncios Click-to-WhatsApp e o ROI real calculado a partir das vendas lançadas no caixa.
        </p>
      </div>

      {roi && (
        <div className="glass-card" style={{ padding: '20px', marginBottom: '24px', display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Gasto em Anúncio (Meta)</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff' }}>R$ {roi.totalSpend.toFixed(2)}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Faturamento Real Lançado</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#10b981' }}>R$ {roi.totalRevenue.toFixed(2)}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>ROAS Real</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#a855f7' }}>{roi.roas.toFixed(2)}x</div>
          </div>
          <div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Vendas Lançadas</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff' }}>{roi.conversionCount}</div>
          </div>
        </div>
      )}

      <div className="glass-card" style={{ display: 'grid', gridTemplateColumns: '300px 1fr', minHeight: '480px' }}>
        <div style={{ borderRight: '1px solid var(--border-color)', overflowY: 'auto', maxHeight: '600px' }}>
          {loading ? (
            <div style={{ padding: '20px', color: 'var(--text-muted)' }}>Carregando...</div>
          ) : conversations.length === 0 ? (
            <div style={{ padding: '20px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Nenhuma conversa ainda. Configure o número do WhatsApp em Chaves e APIs.
            </div>
          ) : (
            conversations.map((c) => (
              <div
                key={c.id}
                onClick={() => setSelectedContactId(c.id)}
                style={{
                  padding: '14px 16px',
                  cursor: 'pointer',
                  backgroundColor: selectedContactId === c.id ? 'var(--bg-card-hover)' : 'transparent',
                  borderBottom: '1px solid rgba(255,255,255,0.04)'
                }}
              >
                <div style={{ fontWeight: 600, color: '#fff', fontSize: '0.9rem' }}>
                  {c.profile_name || c.wa_id}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  {c.source === 'ad' ? `📢 ${c.ad_headline || 'Veio de anúncio'}` : 'Contato direto'}
                </div>
                <div style={{ fontSize: '0.75rem', marginTop: '4px', color: c.responseTimeSeconds == null ? '#f59e0b' : '#10b981' }}>
                  {c.responseTimeSeconds == null
                    ? '⏳ Ainda sem resposta'
                    : `⏱ Respondido em ${c.responseTimeSeconds < 60
                        ? `${c.responseTimeSeconds}s`
                        : `${Math.round(c.responseTimeSeconds / 60)} min`}`}
                </div>
              </div>
            ))
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', padding: '16px' }}>
          {!selectedContactId ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              Selecione uma conversa
            </div>
          ) : (
            <>
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                {messages.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      alignSelf: m.direction === 'outbound' ? 'flex-end' : 'flex-start',
                      backgroundColor: m.direction === 'outbound' ? 'var(--accent-primary)' : 'var(--bg-card)',
                      color: '#fff',
                      padding: '8px 12px',
                      borderRadius: '10px',
                      maxWidth: '70%',
                      fontSize: '0.85rem'
                    }}
                  >
                    {m.body}
                  </div>
                ))}
              </div>
              <form onSubmit={handleSendReply} style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  className="form-input"
                  placeholder="Digite uma resposta..."
                  style={{ flex: 1 }}
                />
                <button type="submit" disabled={sending} className="btn btn-primary">
                  <Send size={16} />
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
