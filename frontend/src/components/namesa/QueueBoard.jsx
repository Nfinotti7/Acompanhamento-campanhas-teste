import React, { useState, useEffect, useCallback } from 'react';
import { Bell, Check, UserX, Trash2, Plus, Pencil, AlertTriangle, MessageCircle } from 'lucide-react';

const C = { panel: '#131b2e', border: 'rgba(255,255,255,0.1)', muted: '#94a3b8', accent: '#f59e0b', red: '#ef4444', green: '#22c55e' };

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

const actionBtn = (bg, color = '#fff') => ({
  padding: '12px 14px', borderRadius: '10px', border: 'none', background: bg, color,
  fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
});

export default function QueueBoard({ api, refreshKey }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', partySize: '2' });
  const [busyId, setBusyId] = useState(null);

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

  if (!data) return <p style={{ color: C.muted }}>{error || 'Carregando...'}</p>;

  const hold = data.settings?.hold_minutes ?? 10;
  const waWarning = WA_LABEL[data.whatsappStatus];
  const s = data.summary;

  const row = (entry, kind) => {
    const waited = minutesSince(entry.joined_at, now);
    const calledFor = entry.called_at ? minutesSince(entry.called_at, now) : null;
    const late = kind === 'called' && calledFor > hold;
    return (
      <div key={entry.id} style={{
        display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', padding: '14px',
        background: C.panel, borderRadius: '12px', marginBottom: '10px',
        border: `1px solid ${late ? C.red : kind === 'called' ? C.accent : C.border}`
      }}>
        {kind === 'waiting' && <div style={{ fontSize: '1.6rem', fontWeight: 800, width: '44px', textAlign: 'center' }}>{entry.position}</div>}
        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>
            {entry.name || 'Sem nome'} · {entry.party_size ?? '?'} {entry.party_size === 1 ? 'pessoa' : 'pessoas'}
            {entry.needs_check && <span style={{ color: C.accent, fontSize: '0.85rem', marginLeft: '8px' }}><AlertTriangle size={14} style={{ verticalAlign: 'middle' }} /> conferir pessoas</span>}
          </div>
          <div style={{ color: late ? C.red : C.muted, fontSize: '0.9rem' }}>
            {kind === 'called' ? `Chamado há ${calledFor} min` : `Esperando há ${waited} min · ~${entry.estimated_wait} min`}
            {' · '}{entry.source === 'whatsapp' ? <><MessageCircle size={12} style={{ verticalAlign: 'middle' }} /> WhatsApp</> : 'manual'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {kind === 'waiting' && <button disabled={busyId === entry.id} style={actionBtn(C.accent, '#111')} onClick={() => act(entry, 'call')}><Bell size={16} /> Chamar</button>}
          <button disabled={busyId === entry.id} style={actionBtn(C.green, '#111')} onClick={() => act(entry, 'seat')}><Check size={16} /> Sentou</button>
          <button disabled={busyId === entry.id} style={actionBtn('#334155')} onClick={() => act(entry, 'no-show')}><UserX size={16} /> Não veio</button>
          <button style={actionBtn('transparent', C.muted)} onClick={() => edit(entry)} title="Editar"><Pencil size={16} /></button>
          <button style={actionBtn('transparent', C.muted)} onClick={() => act(entry, 'remove')} title="Remover"><Trash2 size={16} /></button>
        </div>
      </div>
    );
  };

  const stat = (label, value) => (
    <div style={{ background: C.panel, borderRadius: '12px', padding: '12px 16px', flex: '1 1 120px' }}>
      <div style={{ color: C.muted, fontSize: '0.8rem' }}>{label}</div>
      <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{value}</div>
    </div>
  );

  return (
    <div>
      {waWarning && (
        <div style={{ background: 'rgba(239,68,68,0.15)', border: `1px solid ${C.red}`, color: '#fca5a5', padding: '12px', borderRadius: '10px', marginBottom: '12px' }}>
          <AlertTriangle size={16} style={{ verticalAlign: 'middle' }} /> {waWarning}
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {stat('Na fila agora', data.waiting.length)}
        {stat('Entraram hoje', s.total)}
        {stat('Sentaram', s.seated)}
        {stat('Desistiram', s.gaveUp)}
        {stat('Espera média', s.avgWaitMinutes === null ? '-' : `${s.avgWaitMinutes} min`)}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
        <button style={actionBtn(C.accent, '#111')} onClick={() => setAdding((v) => !v)}><Plus size={16} /> Adicionar</button>
      </div>

      {adding && (
        <form onSubmit={submitAdd} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', background: C.panel, padding: '12px', borderRadius: '12px', marginBottom: '16px' }}>
          {[['name', 'Nome', 'text'], ['phone', 'WhatsApp (opcional)', 'tel'], ['partySize', 'Pessoas', 'number']].map(([key, ph, type]) => (
            <input key={key} required={key !== 'phone'} type={type} min={key === 'partySize' ? 1 : undefined} max={key === 'partySize' ? 30 : undefined}
              placeholder={ph} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              style={{ flex: key === 'partySize' ? '0 0 100px' : '1 1 180px', padding: '12px', borderRadius: '10px', border: `1px solid ${C.border}`, background: '#0b1120', color: '#fff', fontSize: '1rem' }} />
          ))}
          <button type="submit" style={actionBtn(C.green, '#111')}>Colocar na fila</button>
        </form>
      )}

      {data.called.length > 0 && <h3 style={{ margin: '8px 0' }}>Chamados</h3>}
      {data.called.map((e) => row(e, 'called'))}

      <h3 style={{ margin: '8px 0' }}>Esperando</h3>
      {data.waiting.length === 0 && <p style={{ color: C.muted }}>Ninguém na fila.</p>}
      {data.waiting.map((e) => row(e, 'waiting'))}

      {data.awaitingSize.length > 0 && (
        <p style={{ color: C.muted, marginTop: '12px' }}>
          Respondendo quantas pessoas: {data.awaitingSize.map((e) => e.name || 'sem nome').join(', ')}
        </p>
      )}
    </div>
  );
}
