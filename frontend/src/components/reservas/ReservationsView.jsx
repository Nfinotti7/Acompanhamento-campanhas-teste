import React, { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Plus, Check, UserX, X, Pencil, AlertTriangle, Undo2, Settings } from 'lucide-react';
import Modal from '../Modal';
import Sheet from '../ui/Sheet';
import ContactDetailPanel from '../ContactDetailPanel';
import ReservationForm from './ReservationForm';
import ReservationSettings from './ReservationSettings';
import { useBreakpoint } from '../../responsive/useBreakpoint';
import { groupByTime, originLabel, statusLabel, todayBrasilia, addDaysISO, dayTitle } from './reservationFormat';

const STATUS_COLOR = {
  confirmed: 'var(--accent-link)',
  arrived: 'var(--accent-success)',
  no_show: 'var(--accent-danger)',
  cancelled: 'var(--text-muted)'
};

function OccupancyStrip({ occupancy }) {
  if (!occupancy?.length) return null;
  const sizes = Object.keys(occupancy[0].free).map(Number).sort((a, b) => a - b);
  return (
    <div className="nm-card" style={{ padding: '10px 12px', overflowX: 'auto' }}>
      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Mesas livres por horário</div>
      <table style={{ borderCollapse: 'collapse', fontSize: '0.8rem', minWidth: '100%' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '2px 8px 2px 0', color: 'var(--text-muted)', fontWeight: 600 }}>Lugares</th>
            {occupancy.map((o) => (
              <th key={o.time} style={{ padding: '2px 6px', color: 'var(--text-muted)', fontWeight: 600 }}>{o.time}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sizes.map((s) => (
            <tr key={s}>
              <td style={{ padding: '2px 8px 2px 0', fontWeight: 700 }}>{s}</td>
              {occupancy.map((o) => {
                const n = o.free[s];
                return (
                  <td key={o.time} style={{
                    textAlign: 'center', padding: '2px 6px', fontWeight: 700,
                    color: n <= 0 ? 'var(--accent-danger)' : 'var(--text-primary)'
                  }}>{n}</td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ReservationsView({ api, lastEvent }) {
  const phone = useBreakpoint() === 'phone';
  const today = todayBrasilia();
  const [day, setDay] = useState(today);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [notify, setNotify] = useState(true);
  const [openContact, setOpenContact] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  const load = useCallback(() => {
    api.get('/api/reservations', { params: { day } })
      .then((res) => { setData(res.data); setError(''); })
      .catch((err) => setError(err.response?.data?.error || 'Não foi possível carregar as reservas.'));
  }, [api, day]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (lastEvent?.kind === 'reservation') load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEvent]);

  const act = async (r, action) => {
    setBusyId(r.id);
    try {
      await api.post(`/api/reservations/${r.id}/${action}`);
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao atualizar a reserva.');
    } finally {
      setBusyId(null);
      load();
    }
  };

  const confirmCancel = async () => {
    const r = cancelling;
    setCancelling(null);
    setBusyId(r.id);
    try {
      const res = await api.post(`/api/reservations/${r.id}/cancel`, { notify });
      if (notify && r.contact_id && !res.data.notified) alert('Reserva cancelada, mas o aviso pelo WhatsApp não saiu.');
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao cancelar a reserva.');
    } finally {
      setBusyId(null);
      load();
    }
  };

  if (showSettings) {
    return (
      <div style={{ height: '100%', overflow: 'auto', padding: phone ? '12px' : 0 }}>
        <ReservationSettings api={api} onBack={() => { setShowSettings(false); load(); }} />
      </div>
    );
  }

  const reservations = data?.reservations || [];
  const active = reservations.filter((r) => r.status !== 'cancelled');
  const people = active.reduce((sum, r) => sum + r.party_size, 0);

  const card = (r) => {
    const origin = originLabel(r);
    const busy = busyId === r.id;
    return (
      <div key={r.id} className="nm-card" style={{ padding: '12px', display: 'grid', gap: '8px', opacity: r.status === 'cancelled' ? 0.6 : 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'flex-start' }}>
          <button type="button" onClick={() => r.contact_id && setOpenContact({ id: r.contact_id, profile_name: r.profile_name || r.name, wa_id: r.wa_id })}
            style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', color: 'var(--text-primary)', cursor: r.contact_id ? 'pointer' : 'default', font: 'inherit' }}>
            <div style={{ fontWeight: 700, fontSize: '1rem' }}>{r.name || r.profile_name || 'Sem nome'}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              {r.party_size} {r.party_size === 1 ? 'pessoa' : 'pessoas'} · mesa de {r.table_seats}
            </div>
          </button>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: STATUS_COLOR[r.status], whiteSpace: 'nowrap' }}>{statusLabel(r.status)}</span>
        </div>
        {(origin || r.over_limit) && (
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {origin && (
              <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', background: 'var(--surface-subtle)', color: 'var(--text-secondary)' }}>{origin}</span>
            )}
            {r.over_limit && (
              <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', color: 'var(--accent-warning)', border: '1px solid var(--accent-warning)' }}>Acima do limite</span>
            )}
          </div>
        )}
        {r.status === 'confirmed' && (
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button type="button" className="nm-btn nm-btn-seat" disabled={busy} onClick={() => act(r, 'arrived')}><Check size={16} /> Chegou</button>
            <button type="button" className="nm-btn nm-btn-muted" disabled={busy} onClick={() => act(r, 'no-show')}><UserX size={16} /> Não veio</button>
            <button type="button" className="nm-btn nm-btn-ghost" disabled={busy} onClick={() => setEditing(r)} aria-label="Editar"><Pencil size={16} /></button>
            <button type="button" className="nm-btn nm-btn-ghost" disabled={busy} onClick={() => { setNotify(true); setCancelling(r); }} aria-label="Cancelar"><X size={16} /></button>
          </div>
        )}
        {(r.status === 'arrived' || r.status === 'no_show') && (
          <button type="button" className="nm-btn nm-btn-ghost" style={{ justifySelf: 'start' }} disabled={busy} onClick={() => act(r, 'confirm')}>
            <Undo2 size={16} /> Desfazer
          </button>
        )}
      </div>
    );
  };

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: phone ? '12px' : 0, display: 'grid', gap: '12px', alignContent: 'start', maxWidth: '980px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <button type="button" className="nm-btn nm-btn-ghost" onClick={() => setDay(addDaysISO(day, -1))} aria-label="Dia anterior"><ChevronLeft size={20} /></button>
        <input type="date" className="nm-input" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} style={{ width: 'auto' }} aria-label="Dia" />
        <button type="button" className="nm-btn nm-btn-ghost" onClick={() => setDay(addDaysISO(day, 1))} aria-label="Próximo dia"><ChevronRight size={20} /></button>
        {day !== today && <button type="button" className="nm-btn nm-btn-muted" onClick={() => setDay(today)}>Hoje</button>}
        <div style={{ flex: 1 }} />
        <button type="button" className="nm-btn nm-btn-muted" onClick={() => setShowSettings(true)}><Settings size={16} /> Configurar</button>
        {!phone && <button type="button" className="nm-btn nm-btn-primary" onClick={() => setFormOpen(true)}><Plus size={18} /> Reserva</button>}
      </div>

      <div>
        <h2 style={{ fontSize: '1.15rem', margin: 0 }}>{dayTitle(day, today)}</h2>
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          {active.length} {active.length === 1 ? 'reserva' : 'reservas'} · {people} {people === 1 ? 'pessoa' : 'pessoas'}
        </div>
      </div>

      {error && <p style={{ color: 'var(--accent-danger)', margin: 0 }}>{error} <button type="button" className="nm-btn nm-btn-ghost" onClick={load}>Tentar de novo</button></p>}
      {data?.overLimit && (
        <div className="nm-card" style={{ padding: '10px 12px', display: 'flex', gap: '8px', alignItems: 'center', borderColor: 'var(--accent-warning)' }}>
          <AlertTriangle size={18} style={{ color: 'var(--accent-warning)', flexShrink: 0 }} />
          <span>Esse dia está acima do limite de mesas. Reservas novas pelo WhatsApp ficam bloqueadas até sobrar mesa.</span>
        </div>
      )}

      <OccupancyStrip occupancy={data?.occupancy} />

      {!data && !error && <p style={{ color: 'var(--text-secondary)' }}>Carregando...</p>}
      {data && reservations.length === 0 && <p style={{ color: 'var(--text-secondary)' }}>Nenhuma reserva nesse dia.</p>}
      {groupByTime(reservations).map((g) => (
        <section key={g.time} style={{ display: 'grid', gap: '8px' }}>
          <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-secondary)' }}>{g.time}</h3>
          <div style={{ display: 'grid', gap: '8px', gridTemplateColumns: phone ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {g.items.map(card)}
          </div>
        </section>
      ))}

      {phone && (
        <button type="button" className="nm-fab nm-btn nm-btn-primary" onClick={() => setFormOpen(true)} aria-label="Nova reserva" style={{ bottom: 'calc(72px + env(safe-area-inset-bottom))' }}>
          <Plus size={22} /> Reserva
        </button>
      )}

      <ReservationForm api={api} open={formOpen} onClose={() => setFormOpen(false)} onSaved={load} initial={{ day }} />
      <ReservationForm api={api} open={Boolean(editing)} reservation={editing} onClose={() => setEditing(null)} onSaved={load} />

      <Sheet open={Boolean(cancelling)} onClose={() => setCancelling(null)} title="Cancelar reserva">
        {cancelling && (
          <div style={{ display: 'grid', gap: '12px' }}>
            <p style={{ margin: 0 }}>Cancelar a reserva de <strong>{cancelling.name || cancelling.profile_name || 'sem nome'}</strong>?</p>
            {cancelling.contact_id && (
              <label style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
                Avisar o cliente pelo WhatsApp
              </label>
            )}
            <button type="button" className="nm-btn nm-btn-primary" onClick={confirmCancel}>Cancelar reserva</button>
            <button type="button" className="nm-btn nm-btn-muted" onClick={() => setCancelling(null)}>Voltar</button>
          </div>
        )}
      </Sheet>

      {openContact && (
        <Modal onClose={() => setOpenContact(null)} maxWidth="520px">
          <div style={{ height: '70vh' }}>
            <ContactDetailPanel
              apiClient={api}
              contact={openContact}
              onClose={() => setOpenContact(null)}
              onUpdated={load}
              onDeleted={() => { setOpenContact(null); load(); }}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
