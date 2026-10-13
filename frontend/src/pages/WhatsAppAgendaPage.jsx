import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { CalendarDays, ExternalLink } from 'lucide-react';
import Modal from '../components/Modal';
import ContactDetailPanel from '../components/ContactDetailPanel';

function todayISODate() {
  // new Date().toISOString() usa UTC: depois das 21h em fusos como o do Brasil (UTC-3),
  // isso já mostra a data de amanhã. Monta a data a partir dos componentes locais.
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function WhatsAppAgendaPage({ selectedClient, onViewConversation }) {
  const [date, setDate] = useState(todayISODate());
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openContact, setOpenContact] = useState(null);

  useEffect(() => {
    fetchAgenda();
  }, [selectedClient, date]);

  const fetchAgenda = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/whatsapp/agenda', { params: { clientId: selectedClient, date } });
      setAppointments(res.data.appointments || []);
    } catch (err) {
      console.error('Error fetching WhatsApp agenda:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <CalendarDays size={28} color="var(--accent-primary)" />
          Agenda
        </h1>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          Agendamentos marcados pelo caixa, por dia.
        </p>
      </div>

      <div className="glass-card" style={{ padding: '20px' }}>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="form-input"
          style={{ maxWidth: '220px', marginBottom: '20px' }}
        />

        {loading ? (
          <div style={{ color: 'var(--text-muted)' }}>Carregando...</div>
        ) : appointments.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Nenhum agendamento nesse dia.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {appointments.map((a) => (
              <div
                key={a.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 16px',
                  backgroundColor: 'rgba(255,255,255,0.03)',
                  borderRadius: '8px'
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, color: '#fff' }}>{a.profile_name || a.wa_id}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    {new Date(a.appointment_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <button
                  onClick={() => setOpenContact(a)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent-primary)',
                    cursor: 'pointer',
                    fontSize: '0.8rem'
                  }}
                >
                  <ExternalLink size={14} /> Abrir
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {openContact && (
        <Modal onClose={() => setOpenContact(null)} maxWidth="640px">
          <div style={{ height: '70vh' }}>
            <ContactDetailPanel
              apiClient={axios}
              clientId={selectedClient}
              contact={openContact}
              onClose={() => setOpenContact(null)}
              onUpdated={fetchAgenda}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
