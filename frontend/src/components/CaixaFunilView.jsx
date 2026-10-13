import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import ContactDetailPanel from './ContactDetailPanel';
import CrmBoard from './crm/CrmBoard';

function todayISODate() {
  // Monta a data a partir dos componentes locais (não new Date().toISOString(),
  // que usa UTC e mostraria o dia errado depois das 21h no Brasil).
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function CaixaFunilView({ caixaApi, inputStyle, view, lastEvent }) {
  const [appointments, setAppointments] = useState([]);
  const [date, setDate] = useState(todayISODate());
  const [loading, setLoading] = useState(true);
  const [openContact, setOpenContact] = useState(null);

  useEffect(() => {
    if (view === 'agenda') fetchAgenda();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, date]);

  useEffect(() => {
    if (!lastEvent) return;
    if (view === 'agenda') fetchAgenda();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEvent]);

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

  const refetch = () => fetchAgenda();

  if (view === 'funil') {
    return <CrmBoard apiClient={caixaApi} lastEvent={lastEvent} />;
  }

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
              onDeleted={() => { setOpenContact(null); refetch(); }}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
