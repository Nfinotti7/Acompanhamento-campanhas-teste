import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import ContactDetailPanel from './ContactDetailPanel';

const STAGES = [
  { key: 'novo_lead', label: 'Novo Lead' },
  { key: 'em_atendimento', label: 'Em Atendimento' },
  { key: 'agendado', label: 'Agendado' },
  { key: 'nao_compareceu', label: 'Não Compareceu' },
  { key: 'compareceu', label: 'Compareceu' },
  { key: 'remarketing', label: 'Remarketing' }
];

function todayISODate() {
  // Monta a data a partir dos componentes locais (não new Date().toISOString(),
  // que usa UTC e mostraria o dia errado depois das 21h no Brasil).
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatAppointment(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function CaixaFunilView({ caixaApi, inputStyle, view }) {
  const [contacts, setContacts] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [date, setDate] = useState(todayISODate());
  const [loading, setLoading] = useState(true);
  const [openContact, setOpenContact] = useState(null);

  useEffect(() => {
    if (view === 'funil') {
      fetchKanban();
    } else {
      fetchAgenda();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, date]);

  const fetchKanban = async () => {
    setLoading(true);
    try {
      const res = await caixaApi.get('/api/whatsapp/kanban');
      setContacts(res.data.contacts || []);
    } catch (err) {
      console.error('Error fetching kanban:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAgenda = async () => {
    setLoading(true);
    try {
      const res = await caixaApi.get('/api/whatsapp/agenda', { params: { date } });
      setAppointments(res.data.appointments || []);
    } catch (err) {
      console.error('Error fetching agenda:', err);
    } finally {
      setLoading(false);
    }
  };

  const refetch = () => (view === 'funil' ? fetchKanban() : fetchAgenda());

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {view === 'agenda' && (
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={{ ...inputStyle, maxWidth: '220px', flexShrink: 0 }}
        />
      )}

      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading ? (
          <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Carregando...</p>
        ) : view === 'funil' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(200px, 1fr))', gap: '12px' }}>
            {STAGES.map((stage) => {
              const stageContacts = contacts.filter((c) => c.stage === stage.key);
              return (
                <div key={stage.key} style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', padding: '12px', minHeight: '200px' }}>
                  <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.85rem', marginBottom: '10px', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{stage.label}</span>
                    <span style={{ color: '#64748b' }}>{stageContacts.length}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {stageContacts.length === 0 ? (
                      <p style={{ color: '#64748b', fontSize: '0.75rem' }}>Vazio</p>
                    ) : (
                      stageContacts.map((c) => (
                        <div
                          key={c.id}
                          onClick={() => setOpenContact(c)}
                          style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: '8px', padding: '10px', fontSize: '0.8rem', cursor: 'pointer' }}
                        >
                          <div style={{ fontWeight: 600, color: '#fff' }}>{c.profile_name || c.wa_id}</div>
                          <div style={{ color: '#94a3b8' }}>{c.wa_id}</div>
                          {c.appointment_at && (
                            <div style={{ color: '#a855f7', marginTop: '2px' }}>📅 {formatAppointment(c.appointment_at)}</div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {appointments.length === 0 ? (
              <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Nenhum agendamento nesse dia.</p>
            ) : (
              appointments.map((a) => (
                <div
                  key={a.id}
                  onClick={() => setOpenContact(a)}
                  style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '10px', fontSize: '0.85rem', cursor: 'pointer' }}
                >
                  <div style={{ fontWeight: 600, color: '#fff' }}>{a.profile_name || a.wa_id}</div>
                  <div style={{ color: '#94a3b8' }}>
                    {new Date(a.appointment_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {openContact && (
        <Modal onClose={() => setOpenContact(null)} maxWidth="520px">
          <div style={{ height: '70vh' }}>
            <ContactDetailPanel
              apiClient={caixaApi}
              contact={openContact}
              onClose={() => setOpenContact(null)}
              onUpdated={refetch}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
