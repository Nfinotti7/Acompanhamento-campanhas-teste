import React, { useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import Sheet from '../ui/Sheet';
import { todayBrasilia, timeOf } from './reservationFormat';

// Reserva manual (telefone, balcão) ou edição. Os horários vêm de /availability e só
// mostram os que têm mesa; "outro horário" grava acima do limite, com aviso.
// clientId: só no painel do admin (o token de staff já é do restaurante).
export default function ReservationForm({ api, clientId, open, onClose, onSaved, initial = {}, reservation = null }) {
  const editing = Boolean(reservation);
  const [form, setForm] = useState({ name: '', phone: '', partySize: '2', day: todayBrasilia() });
  const [time, setTime] = useState('');
  const [customTime, setCustomTime] = useState(false);
  const [slots, setSlots] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (reservation) {
      setForm({
        name: reservation.name || '', phone: reservation.phone || '',
        partySize: String(reservation.party_size), day: todayBrasilia(new Date(reservation.starts_at))
      });
      setTime(timeOf(reservation.starts_at));
    } else {
      setForm({ name: initial.name || '', phone: initial.phone || '', partySize: String(initial.partySize || 2), day: initial.day || todayBrasilia() });
      setTime('');
    }
    setCustomTime(false);
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reservation]);

  useEffect(() => {
    if (!open || !form.day || !Number(form.partySize)) return;
    let alive = true;
    setSlots(null);
    api.get('/api/reservations/availability', { params: { day: form.day, party: form.partySize, clientId } })
      .then((res) => { if (alive) setSlots(res.data.slots || []); })
      .catch(() => { if (alive) setSlots([]); });
    return () => { alive = false; };
  }, [api, clientId, open, form.day, form.partySize]);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (!time) { setError('Escolha um horário.'); return; }
    // Editando sem mudar o horário: a própria reserva ocupa a mesa, então o horário pode
    // não aparecer na lista; o backend revalida sem contar ela.
    const sameSlot = editing && time === timeOf(reservation.starts_at) && form.day === todayBrasilia(new Date(reservation.starts_at));
    const overLimit = !sameSlot && (customTime || (slots && !slots.includes(time)));
    if (overLimit && !window.confirm('Esse horário está sem mesa livre pra esse grupo. Reservar mesmo assim (acima do limite)?')) return;
    setSaving(true);
    setError('');
    const body = { name: form.name.trim(), partySize: Number(form.partySize), day: form.day, time, force: overLimit, clientId };
    try {
      if (editing) await api.patch(`/api/reservations/${reservation.id}`, body);
      else await api.post('/api/reservations', { ...body, phone: form.phone.trim() });
      onSaved?.();
      onClose();
    } catch (err) {
      if (err.response?.status === 409 && err.response.data.slots) setSlots(err.response.data.slots);
      setError(err.response?.data?.error || 'Não foi possível salvar a reserva.');
    } finally {
      setSaving(false);
    }
  };

  const slotButton = (t) => (
    <button key={t} type="button" onClick={() => { setTime(t); setCustomTime(false); }}
      className={`nm-btn ${time === t && !customTime ? 'nm-btn-primary' : 'nm-btn-muted'}`}
      style={{ minHeight: '44px', padding: '8px 12px' }}>
      {t}
    </button>
  );

  return (
    <Sheet open={open} onClose={onClose} title={editing ? 'Editar reserva' : 'Nova reserva'}>
      <form onSubmit={submit} style={{ display: 'grid', gap: '12px' }}>
        <label style={{ display: 'grid', gap: '4px' }}>
          <span>Nome</span>
          <input className="nm-input" value={form.name} onChange={set('name')} required autoFocus />
        </label>
        {!editing && (
          <label style={{ display: 'grid', gap: '4px' }}>
            <span>Telefone (WhatsApp)</span>
            <input className="nm-input" value={form.phone} onChange={set('phone')} inputMode="tel" placeholder="(11) 99999-8888" />
          </label>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: '10px' }}>
          <label style={{ display: 'grid', gap: '4px' }}>
            <span>Pessoas</span>
            <input className="nm-input" type="number" min="1" max="30" value={form.partySize} onChange={set('partySize')} required />
          </label>
          <label style={{ display: 'grid', gap: '4px' }}>
            <span>Dia</span>
            <input className="nm-input" type="date" value={form.day} onChange={(e) => { set('day')(e); setTime(''); }} required />
          </label>
        </div>

        <div style={{ display: 'grid', gap: '6px' }}>
          <span>Horário</span>
          {slots === null ? (
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Carregando horários...</span>
          ) : slots.length === 0 ? (
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Nenhum horário com mesa livre pra esse grupo nesse dia.</span>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>{slots.map(slotButton)}</div>
          )}
          {customTime ? (
            <div style={{ display: 'grid', gap: '6px' }}>
              <input className="nm-input" type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
              <span style={{ display: 'flex', gap: '6px', alignItems: 'center', color: 'var(--accent-warning)', fontSize: '0.85rem' }}>
                <AlertTriangle size={14} /> Fora da lista: grava acima do limite de mesas.
              </span>
            </div>
          ) : (
            <button type="button" className="nm-btn nm-btn-ghost" style={{ justifySelf: 'start', color: 'var(--accent-link)' }}
              onClick={() => { setCustomTime(true); setTime(''); }}>
              Outro horário
            </button>
          )}
        </div>

        {error && <p style={{ color: 'var(--accent-danger)', margin: 0 }}>{error}</p>}
        <button type="submit" className="nm-btn nm-btn-primary" disabled={saving}>
          {saving ? 'Salvando...' : editing ? 'Salvar' : 'Reservar'}
        </button>
      </form>
    </Sheet>
  );
}
