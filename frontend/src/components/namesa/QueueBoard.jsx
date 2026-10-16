import React, { useState, useEffect, useCallback } from 'react';
import { Bell, Check, UserX, Trash2, Plus, Pencil, AlertTriangle, MessageCircle, MoreVertical } from 'lucide-react';
import { useBreakpoint } from '../../responsive/useBreakpoint';
import Sheet from '../ui/Sheet';

function minutesSince(ts, now) {
  return Math.max(0, Math.floor((now - new Date(ts).getTime()) / 60000));
}

const WA_LABEL = {
  qr: 'WhatsApp desconectado: avisos não estão saindo. Peça pra reconectar o QR em Chaves e APIs.',
  disconnected: 'WhatsApp desconectado: avisos não estão saindo.',
  connecting: 'WhatsApp reconectando... avisos podem atrasar.',
  standby: 'WhatsApp em espera: avisos podem não estar saindo.',
  not_configured: 'WhatsApp não configurado pra este restaurante.'
};

export default function QueueBoard({ api, refreshKey }) {
  const bp = useBreakpoint();
  const phone = bp === 'phone';
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', partySize: '2' });
  const [busyId, setBusyId] = useState(null);
  const [menuEntry, setMenuEntry] = useState(null);

  const load = useCallback(() => {
    api.get('/api/waitlist')
      .then((res) => { setData(res.data); setError(''); })
      .catch(() => setError('Não foi possível carregar a fila.'));
  }, [api]);

  useEffect(() => { load(); }, [load, refreshKey]);
  useEffect(() => {
    const t = setInterval(() => { setNow(Date.now()); load(); }, 30000);
    return () => clearInterval(t);
  }, [load]);

  const act = async (entry, action) => {
    if (action === 'remove' && !window.confirm(`Remover ${entry.name || 'esta pessoa'} da fila?`)) return;
    setBusyId(entry.id);
    try {
      await api.post(`/api/waitlist/${entry.id}/${action}`);
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao atualizar a fila.');
    } finally {
      setBusyId(null);
      load();
    }
  };

  const edit = async (entry) => {
    const name = window.prompt('Nome', entry.name || '');
    if (name === null) return;
    const partySize = window.prompt('Quantas pessoas?', String(entry.party_size || ''));
    if (partySize === null) return;
    try {
      await api.patch(`/api/waitlist/${entry.id}`, { name, partySize: Number(partySize) });
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao editar.');
    }
    load();
  };

  const submitAdd = async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/waitlist', { name: form.name, phone: form.phone, partySize: Number(form.partySize) });
      setForm({ name: '', phone: '', partySize: '2' });
      setAdding(false);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao adicionar.');
    }
  };

  if (!data) return <p style={{ color: 'var(--text-muted)' }}>{error || 'Carregando...'}</p>;

  const hold = data.settings?.hold_minutes ?? 10;
  const waWarning = WA_LABEL[data.whatsappStatus];
  const s = data.summary;

  const actionButtons = (entry, kind) => (
    <>
      {kind === 'waiting' && (
        <button disabled={busyId === entry.id} className="nm-btn nm-btn-call" onClick={() => act(entry, 'call')}><Bell size={16} /> Chamar</button>
      )}
      <button disabled={busyId === entry.id} className="nm-btn nm-btn-seat" onClick={() => act(entry, 'seat')}><Check size={16} /> Sentou</button>
      <button disabled={busyId === entry.id} className="nm-btn nm-btn-muted" onClick={() => act(entry, 'no-show')}><UserX size={16} /> Não veio</button>
    </>
  );

  const row = (entry, kind) => {
    const waited = minutesSince(entry.joined_at, now);
    const calledFor = entry.called_at ? minutesSince(entry.called_at, now) : null;
    const late = kind === 'called' && calledFor > hold;
    const borderColor = late ? 'var(--accent-danger)' : kind === 'called' ? 'var(--accent-warning)' : 'var(--border-color)';
    const title = (
      <div style={{ fontWeight: 700, fontSize: '1.1rem', overflowWrap: 'anywhere' }}>
        {entry.name || 'Sem nome'} · {entry.party_size ?? '?'} {entry.party_size === 1 ? 'pessoa' : 'pessoas'}
        {entry.needs_check && (
          <span style={{ color: 'var(--accent-warning)', fontSize: '0.85rem', marginLeft: '8px', whiteSpace: 'nowrap' }}>
            <AlertTriangle size={14} style={{ verticalAlign: 'middle' }} /> conferir pessoas
          </span>
        )}
      </div>
    );
    const meta = (
      <div style={{ color: late ? 'var(--accent-danger)' : 'var(--text-secondary)', fontSize: '0.9rem' }}>
        {kind === 'called' ? `Chamado há ${calledFor} min` : `Esperando há ${waited} min · ~${entry.estimated_wait} min`}
        {' · '}{entry.source === 'whatsapp' ? <><MessageCircle size={12} style={{ verticalAlign: 'middle' }} /> WhatsApp</> : 'manual'}
      </div>
    );
    const position = kind === 'waiting' && (
      <div style={{ fontSize: phone ? '1.8rem' : '1.6rem', fontWeight: 800, minWidth: '40px', textAlign: 'center', color: 'var(--accent-link)' }}>{entry.position}</div>
    );

    if (phone) {
      return (
        <div key={entry.id} className="nm-card" style={{ padding: '14px', marginBottom: '10px', borderColor }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            {position}
            <div style={{ flex: 1, minWidth: 0 }}>{title}{meta}</div>
            <button className="nm-btn nm-btn-ghost" aria-label="Mais opções" onClick={() => setMenuEntry(entry)}><MoreVertical size={18} /></button>
          </div>
          <div className="nm-phone-actions" style={{ display: 'grid', gridTemplateColumns: kind === 'waiting' ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)', gap: '8px', marginTop: '12px' }}>
            {actionButtons(entry, kind)}
          </div>
        </div>
      );
    }

    return (
      <div key={entry.id} className="nm-card" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', padding: '14px', marginBottom: '10px', borderColor }}>
        {position}
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>{title}{meta}</div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {actionButtons(entry, kind)}
          <button className="nm-btn nm-btn-ghost" onClick={() => edit(entry)} title="Editar" aria-label="Editar"><Pencil size={16} /></button>
          <button className="nm-btn nm-btn-ghost" onClick={() => act(entry, 'remove')} title="Remover" aria-label="Remover"><Trash2 size={16} /></button>
        </div>
      </div>
    );
  };

  const stat = (label, value) => (
    <div className="nm-card" style={{ padding: '12px 16px', flex: phone ? '0 0 auto' : '1 1 120px', minWidth: phone ? '120px' : undefined, scrollSnapAlign: 'start' }}>
      <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{label}</div>
      <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{value}</div>
    </div>
  );

  const addForm = (
    <form onSubmit={submitAdd} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', flexDirection: phone ? 'column' : 'row' }}>
      {[['name', 'Nome', 'text'], ['phone', 'WhatsApp (opcional)', 'tel'], ['partySize', 'Pessoas', 'number']].map(([key, ph, type]) => (
        <input key={key} className="nm-input" required={key !== 'phone'} type={type}
          inputMode={key === 'partySize' ? 'numeric' : undefined}
          min={key === 'partySize' ? 1 : undefined} max={key === 'partySize' ? 30 : undefined}
          placeholder={ph} aria-label={ph} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          style={{ flex: phone ? 'none' : key === 'partySize' ? '0 0 110px' : '1 1 180px', width: phone ? '100%' : undefined }} />
      ))}
      <button type="submit" className="nm-btn nm-btn-seat" style={{ width: phone ? '100%' : undefined }}>Colocar na fila</button>
    </form>
  );

  return (
    <div style={{ paddingBottom: phone ? '96px' : 0 }}>
      {waWarning && (
        <div style={{
          background: 'color-mix(in srgb, var(--accent-danger) 12%, transparent)', border: '1px solid var(--accent-danger)',
          color: 'var(--text-primary)', padding: '12px', borderRadius: '10px', marginBottom: '12px'
        }}>
          <AlertTriangle size={16} style={{ verticalAlign: 'middle', color: 'var(--accent-danger)' }} /> {waWarning}
        </div>
      )}

      <div style={{
        display: 'flex', gap: '10px', marginBottom: '16px',
        flexWrap: phone ? 'nowrap' : 'wrap', overflowX: phone ? 'auto' : 'visible',
        scrollSnapType: phone ? 'x mandatory' : undefined, paddingBottom: phone ? '4px' : 0
      }}>
        {stat('Na fila agora', data.waiting.length)}
        {stat('Entraram hoje', s.total)}
        {stat('Sentaram', s.seated)}
        {stat('Desistiram', s.gaveUp)}
        {stat('Espera média', s.avgWaitMinutes === null ? '-' : `${s.avgWaitMinutes} min`)}
      </div>

      {!phone && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
            <button className="nm-btn nm-btn-primary" onClick={() => setAdding((v) => !v)}><Plus size={16} /> Adicionar</button>
          </div>
          {adding && <div className="nm-card" style={{ padding: '12px', marginBottom: '16px' }}>{addForm}</div>}
        </>
      )}

      {data.called.length > 0 && <h3 style={{ margin: '8px 0' }}>Chamados</h3>}
      {data.called.map((e) => row(e, 'called'))}

      <h3 style={{ margin: '8px 0' }}>Esperando</h3>
      {data.waiting.length === 0 && <p style={{ color: 'var(--text-muted)' }}>Ninguém na fila.</p>}
      {data.waiting.map((e) => row(e, 'waiting'))}

      {data.awaitingSize.length > 0 && (
        <p style={{ color: 'var(--text-muted)', marginTop: '12px' }}>
          Respondendo quantas pessoas: {data.awaitingSize.map((e) => e.name || 'sem nome').join(', ')}
        </p>
      )}

      {phone && (
        <>
          <button className="nm-fab" aria-label="Adicionar na fila" onClick={() => setAdding(true)}><Plus size={26} /></button>
          <Sheet open={adding} onClose={() => setAdding(false)} title="Adicionar na fila">{addForm}</Sheet>
          <Sheet open={Boolean(menuEntry)} onClose={() => setMenuEntry(null)} title={menuEntry?.name || 'Opções'}>
            <div style={{ display: 'grid', gap: '8px' }}>
              <button className="nm-btn nm-btn-muted" onClick={() => { const e = menuEntry; setMenuEntry(null); edit(e); }}><Pencil size={16} /> Editar nome e pessoas</button>
              <button className="nm-btn nm-btn-muted" style={{ color: 'var(--accent-danger)' }} onClick={() => { const e = menuEntry; setMenuEntry(null); act(e, 'remove'); }}><Trash2 size={16} /> Remover da fila</button>
            </div>
          </Sheet>
        </>
      )}
    </div>
  );
}
