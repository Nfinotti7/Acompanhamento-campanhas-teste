import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Columns3, ExternalLink } from 'lucide-react';

const STAGES = [
  { key: 'novo_lead', label: 'Novo Lead' },
  { key: 'em_atendimento', label: 'Em Atendimento' },
  { key: 'agendado', label: 'Agendado' },
  { key: 'nao_compareceu', label: 'Não Compareceu' },
  { key: 'compareceu', label: 'Compareceu' },
  { key: 'remarketing', label: 'Remarketing' }
];

function formatAppointment(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function WhatsAppKanbanPage({ selectedClient, onViewConversation }) {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchKanban();
  }, [selectedClient]);

  const fetchKanban = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/whatsapp/kanban', { params: { clientId: selectedClient } });
      setContacts(res.data.contacts || []);
    } catch (err) {
      console.error('Error fetching WhatsApp kanban:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Columns3 size={28} color="var(--accent-primary)" />
          Funil WhatsApp
        </h1>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          Etapa calculada automaticamente a partir das mensagens, agendamentos e vendas lançadas — nada aqui precisa ser movido manualmente.
        </p>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-muted)' }}>Carregando...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(220px, 1fr))', gap: '12px', overflowX: 'auto' }}>
          {STAGES.map((stage) => {
            const stageContacts = contacts.filter((c) => c.stage === stage.key);
            return (
              <div key={stage.key} className="glass-card" style={{ padding: '12px', minHeight: '200px' }}>
                <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.85rem', marginBottom: '10px', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{stage.label}</span>
                  <span style={{ color: 'var(--text-muted)' }}>{stageContacts.length}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {stageContacts.length === 0 && (
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Vazio</div>
                  )}
                  {stageContacts.map((c) => (
                    <div key={c.id} style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '10px', fontSize: '0.8rem' }}>
                      <div style={{ fontWeight: 600, color: '#fff' }}>{c.profile_name || c.wa_id}</div>
                      <div style={{ color: 'var(--text-muted)', marginTop: '2px' }}>
                        {c.source === 'ad' ? `📢 ${c.ad_headline || 'Veio de anúncio'}` : 'Contato direto'}
                      </div>
                      {c.appointment_at && (
                        <div style={{ color: '#a855f7', marginTop: '4px' }}>
                          📅 {formatAppointment(c.appointment_at)}
                        </div>
                      )}
                      <button
                        onClick={() => onViewConversation && onViewConversation(c.id)}
                        style={{
                          marginTop: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          background: 'none',
                          border: 'none',
                          color: 'var(--accent-primary)',
                          cursor: 'pointer',
                          fontSize: '0.75rem',
                          padding: 0
                        }}
                      >
                        <ExternalLink size={12} /> Ver conversa
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
