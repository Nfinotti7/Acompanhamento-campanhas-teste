import React, { useState, useEffect } from 'react';

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

export default function CaixaFunilView({ caixaApi, inputStyle }) {
  const [tab, setTab] = useState('kanban');
  const [contacts, setContacts] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [date, setDate] = useState(todayISODate());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (tab === 'kanban') {
      fetchKanban();
    } else {
      fetchAgenda();
    }
  }, [tab, date]);

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

  const tabButtonStyle = (active) => ({
    flex: 1,
    padding: '10px',
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '0.85rem',
    backgroundColor: active ? '#6366f1' : 'rgba(255,255,255,0.05)',
    color: active ? '#fff' : '#94a3b8'
  });

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button type="button" onClick={() => setTab('kanban')} style={tabButtonStyle(tab === 'kanban')}>Funil</button>
        <button type="button" onClick={() => setTab('agenda')} style={tabButtonStyle(tab === 'agenda')}>Agenda</button>
      </div>

      {tab === 'agenda' && (
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={inputStyle}
        />
      )}

      {loading ? (
        <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Carregando...</p>
      ) : tab === 'kanban' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {STAGES.map((stage) => {
            const stageContacts = contacts.filter((c) => c.stage === stage.key);
            return (
              <div key={stage.key}>
                <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.85rem', marginBottom: '6px' }}>
                  {stage.label} ({stageContacts.length})
                </div>
                {stageContacts.length === 0 ? (
                  <p style={{ color: '#64748b', fontSize: '0.78rem' }}>Vazio</p>
                ) : (
                  stageContacts.map((c) => (
                    <div key={c.id} style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '10px', marginBottom: '6px', fontSize: '0.8rem' }}>
                      <div style={{ fontWeight: 600, color: '#fff' }}>{c.profile_name || c.wa_id}</div>
                      <div style={{ color: '#94a3b8' }}>{c.wa_id}</div>
                      {c.appointment_at && (
                        <div style={{ color: '#a855f7', marginTop: '2px' }}>📅 {formatAppointment(c.appointment_at)}</div>
                      )}
                    </div>
                  ))
                )}
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
              <div key={a.id} style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '10px', fontSize: '0.85rem' }}>
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
  );
}
