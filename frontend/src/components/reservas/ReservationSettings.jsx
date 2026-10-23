import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, ArrowLeft } from 'lucide-react';
import { validateSettingsForm } from './reservationFormat';

// Ordem de exibição (segunda primeiro); a chave é o dia da semana do backend (0 = domingo).
const WEEKDAYS = [[1, 'Segunda'], [2, 'Terça'], [3, 'Quarta'], [4, 'Quinta'], [5, 'Sexta'], [6, 'Sábado'], [0, 'Domingo']];

const MESSAGE_LABELS = {
  askSize: 'Primeira resposta (pergunta quantas pessoas)',
  askSizeAgain: 'Não entendeu o número de pessoas',
  askDay: 'Pergunta o dia',
  askDayAgain: 'Não entendeu o dia',
  dayUnavailable: 'Dia sem reserva',
  askTime: 'Lista de horários',
  askTimeAgain: 'Não entendeu o horário',
  noSlotsSuggest: 'Dia lotado, sugere outro',
  noSlots: 'Sem vaga nos próximos dias',
  askName: 'Confirma o nome',
  askNameEmpty: 'Pede o nome',
  confirm: 'Resumo pra confirmar',
  slotTaken: 'Horário tomado na hora de confirmar',
  confirmed: 'Reserva confirmada',
  aborted: 'Desistiu no meio',
  cancelPick: 'Qual reserva cancelar',
  cancelConfirm: 'Confirma o cancelamento',
  cancelled: 'Cancelada pelo cliente',
  cancelledByStaff: 'Cancelada pela equipe',
  handoff: 'Passa pra equipe',
  adFallbackAsk: 'Pergunta pra quem veio do anúncio sem código',
  changeAsk: 'Mudar reserva: pergunta pra quando',
  changePick: 'Mudar reserva: qual delas',
  changeTimeUnavailable: 'Mudar reserva: horário sem mesa',
  changeNoSlots: 'Mudar reserva: dia lotado',
  changeConfirm: 'Mudar reserva: resumo pra confirmar',
  changed: 'Reserva alterada'
};

function toForm(s) {
  return {
    tables: s.tables.map((t) => ({ seats: String(t.seats), count: String(t.count) })),
    hours: Object.fromEntries(WEEKDAYS.map(([k]) => [k, (s.hours[k] || []).map((x) => ({ ...x }))])),
    exceptions: (s.exceptions || []).map((e) => ({
      date: e.date, closed: Boolean(e.closed),
      tables: (e.tables || []).map((t) => ({ seats: String(t.seats), count: String(t.count) }))
    })),
    duration_minutes: String(s.duration_minutes),
    slot_minutes: String(s.slot_minutes),
    hold_minutes: String(s.hold_minutes),
    min_advance_hours: String(s.min_advance_minutes / 60),
    max_advance_days: String(s.max_advance_days),
    max_party: s.max_party ? String(s.max_party) : '',
    bot_enabled: s.bot_enabled !== false,
    ad_fallback: Boolean(s.ad_fallback),
    messages: { ...(s.messages || {}) }
  };
}

function numTables(rows) {
  return rows.map((t) => ({ seats: Number(t.seats), count: Number(t.count) }));
}

function fromForm(f) {
  const messages = Object.fromEntries(Object.entries(f.messages).filter(([, v]) => v && v.trim()));
  return {
    tables: numTables(f.tables),
    hours: f.hours,
    exceptions: f.exceptions.map((e) => (e.closed ? { date: e.date, closed: true } : { date: e.date, tables: numTables(e.tables) })),
    duration_minutes: Number(f.duration_minutes),
    slot_minutes: Number(f.slot_minutes),
    hold_minutes: Number(f.hold_minutes),
    min_advance_minutes: Math.round(Number(f.min_advance_hours) * 60),
    max_advance_days: Number(f.max_advance_days),
    max_party: f.max_party ? Number(f.max_party) : null,
    bot_enabled: f.bot_enabled,
    ad_fallback: f.ad_fallback,
    messages
  };
}

function TablesEditor({ rows, onChange }) {
  const update = (i, key, value) => onChange(rows.map((r, j) => (j === i ? { ...r, [key]: value } : r)));
  const total = rows.reduce((sum, r) => sum + (Number(r.count) || 0), 0);
  return (
    <div style={{ display: 'grid', gap: '6px' }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <input className="nm-input" type="number" min="1" max="50" value={r.count} onChange={(e) => update(i, 'count', e.target.value)} style={{ width: '80px' }} aria-label="Quantidade de mesas" />
          <span>mesas de</span>
          <input className="nm-input" type="number" min="1" max="30" value={r.seats} onChange={(e) => update(i, 'seats', e.target.value)} style={{ width: '80px' }} aria-label="Lugares" />
          <span>lugares</span>
          <button type="button" className="nm-btn nm-btn-ghost" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label="Remover"><Trash2 size={16} /></button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <button type="button" className="nm-btn nm-btn-muted" onClick={() => onChange([...rows, { seats: '', count: '1' }])}><Plus size={16} /> Tamanho de mesa</button>
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Total: {total} {total === 1 ? 'mesa' : 'mesas'}</span>
      </div>
    </div>
  );
}

const section = { padding: '14px', display: 'grid', gap: '10px' };

export default function ReservationSettings({ api, onBack }) {
  const [form, setForm] = useState(null);
  const [defaults, setDefaults] = useState({});
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoadError('');
    api.get('/api/reservations/settings')
      .then((res) => { setForm(toForm(res.data.settings)); setDefaults(res.data.defaultMessages || {}); })
      .catch((err) => setLoadError(err.response?.data?.error || 'Não foi possível carregar a configuração.'));
  }, [api]);

  useEffect(() => { load(); }, [load]);

  if (loadError) {
    return (
      <div style={{ display: 'grid', gap: '10px', justifyItems: 'start' }}>
        <p style={{ color: 'var(--accent-danger)', margin: 0 }}>{loadError}</p>
        <button type="button" className="nm-btn nm-btn-muted" onClick={load}>Tentar de novo</button>
      </div>
    );
  }
  if (!form) return <p style={{ color: 'var(--text-secondary)' }}>Carregando...</p>;

  const set = (patch) => { setForm({ ...form, ...patch }); setSaved(false); };
  const setShifts = (day, shifts) => set({ hours: { ...form.hours, [day]: shifts } });
  const setException = (i, patch) => set({ exceptions: form.exceptions.map((e, j) => (j === i ? { ...e, ...patch } : e)) });

  const save = async () => {
    const payload = fromForm(form);
    const problem = validateSettingsForm(payload);
    if (problem) { setError(problem); return; }
    setSaving(true);
    setError('');
    try {
      const res = await api.put('/api/reservations/settings', payload);
      setForm(toForm(res.data.settings));
      setSaved(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  };

  const number = (key, label, suffix) => (
    <label style={{ display: 'grid', gap: '4px' }}>
      <span style={{ fontSize: '0.9rem' }}>{label}</span>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        <input className="nm-input" type="number" min="0" value={form[key]} onChange={(e) => set({ [key]: e.target.value })} style={{ width: '100px' }} />
        {suffix && <span style={{ color: 'var(--text-secondary)' }}>{suffix}</span>}
      </div>
    </label>
  );

  return (
    <div style={{ display: 'grid', gap: '12px', maxWidth: '720px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button type="button" className="nm-btn nm-btn-ghost" onClick={onBack} aria-label="Voltar"><ArrowLeft size={18} /></button>
        <h2 style={{ margin: 0, fontSize: '1.15rem' }}>Configurar reservas</h2>
      </div>

      <div className="nm-card" style={section}>
        <label style={{ display: 'flex', gap: '8px', alignItems: 'center', fontWeight: 600 }}>
          <input type="checkbox" checked={form.bot_enabled} onChange={(e) => set({ bot_enabled: e.target.checked })} />
          Robô de reserva ligado (responde quem manda o código RESERVA)
        </label>
        <label style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input type="checkbox" checked={form.ad_fallback} onChange={(e) => set({ ad_fallback: e.target.checked })} />
          Toda conversa nova vinda de anúncio pergunta se quer reservar (mesmo sem o código)
        </label>
      </div>

      <div className="nm-card" style={section}>
        <strong>Mesas liberadas pra reserva</strong>
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Só as mesas que podem ser reservadas. O sistema desconta sozinho o que já está reservado em cada horário.</span>
        <TablesEditor rows={form.tables} onChange={(tables) => set({ tables })} />
      </div>

      <div className="nm-card" style={section}>
        <strong>Datas diferentes do normal</strong>
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Feriado, evento, salão fechado: nessa data vale o que estiver aqui.</span>
        {form.exceptions.map((e, i) => (
          <div key={i} style={{ display: 'grid', gap: '8px', padding: '10px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <input className="nm-input" type="date" value={e.date} onChange={(ev) => setException(i, { date: ev.target.value })} style={{ width: 'auto' }} aria-label="Data" />
              <label style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <input type="checkbox" checked={e.closed} onChange={(ev) => setException(i, { closed: ev.target.checked })} /> Sem reserva nesse dia
              </label>
              <button type="button" className="nm-btn nm-btn-ghost" onClick={() => set({ exceptions: form.exceptions.filter((_, j) => j !== i) })} aria-label="Remover data"><Trash2 size={16} /></button>
            </div>
            {!e.closed && <TablesEditor rows={e.tables} onChange={(tables) => setException(i, { tables })} />}
          </div>
        ))}
        <button type="button" className="nm-btn nm-btn-muted" style={{ justifySelf: 'start' }}
          onClick={() => set({ exceptions: [...form.exceptions, { date: '', closed: false, tables: form.tables.map((t) => ({ ...t })) }] })}>
          <Plus size={16} /> Data
        </button>
      </div>

      <div className="nm-card" style={section}>
        <strong>Horários de reserva</strong>
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Do primeiro ao último horário em que dá pra marcar (não o horário de fechar).</span>
        {WEEKDAYS.map(([k, label]) => (
          <div key={k} style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: '8px', alignItems: 'start' }}>
            <span style={{ fontWeight: 600, paddingTop: '12px' }}>{label}</span>
            <div style={{ display: 'grid', gap: '6px' }}>
              {form.hours[k].length === 0 && <span style={{ color: 'var(--text-muted)', paddingTop: '12px' }}>Sem reserva</span>}
              {form.hours[k].map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <input className="nm-input" type="time" value={s.start} onChange={(e) => setShifts(k, form.hours[k].map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} style={{ width: 'auto' }} aria-label="Início" />
                  <span>até</span>
                  <input className="nm-input" type="time" value={s.lastBooking} onChange={(e) => setShifts(k, form.hours[k].map((x, j) => (j === i ? { ...x, lastBooking: e.target.value } : x)))} style={{ width: 'auto' }} aria-label="Último horário" />
                  <button type="button" className="nm-btn nm-btn-ghost" onClick={() => setShifts(k, form.hours[k].filter((_, j) => j !== i))} aria-label="Remover turno"><Trash2 size={16} /></button>
                </div>
              ))}
              <button type="button" className="nm-btn nm-btn-ghost" style={{ justifySelf: 'start', color: 'var(--accent-link)' }}
                onClick={() => setShifts(k, [...form.hours[k], { start: '18:00', lastBooking: '22:00' }])}>
                <Plus size={14} /> Turno
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="nm-card" style={{ ...section, gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
        {number('duration_minutes', 'Mesa fica ocupada por', 'min')}
        {number('slot_minutes', 'Horários de quanto em quanto', 'min')}
        {number('hold_minutes', 'Tolerância de atraso', 'min')}
        {number('min_advance_hours', 'Antecedência mínima', 'horas')}
        {number('max_advance_days', 'Reserva até quantos dias pra frente', 'dias')}
        <label style={{ display: 'grid', gap: '4px' }}>
          <span style={{ fontSize: '0.9rem' }}>Grupo maior que isso vai pra equipe</span>
          <input className="nm-input" type="number" min="1" value={form.max_party} placeholder="maior mesa" onChange={(e) => set({ max_party: e.target.value })} style={{ width: '120px' }} />
        </label>
      </div>

      <details className="nm-card" style={section}>
        <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Textos do robô</summary>
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Em branco usa o texto padrão. Variáveis: {'{nome}'}, {'{restaurante}'}, {'{dia}'}, {'{hora}'}, {'{pessoas}'}, {'{opcoes}'}, {'{nomeReserva}'}, {'{tolerancia}'}, {'{proximoDia}'}.</span>
        {Object.keys(MESSAGE_LABELS).map((key) => (
          <label key={key} style={{ display: 'grid', gap: '4px' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{MESSAGE_LABELS[key]}</span>
            <textarea className="nm-input" rows={2} value={form.messages[key] || ''} placeholder={defaults[key] || ''}
              onChange={(e) => set({ messages: { ...form.messages, [key]: e.target.value } })} />
          </label>
        ))}
      </details>

      {error && <p style={{ color: 'var(--accent-danger)', margin: 0 }}>{error}</p>}
      {saved && <p style={{ color: 'var(--accent-success)', margin: 0 }}>Configuração salva.</p>}
      <button type="button" className="nm-btn nm-btn-primary" onClick={save} disabled={saving} style={{ justifySelf: 'start' }}>
        {saving ? 'Salvando...' : 'Salvar configuração'}
      </button>
    </div>
  );
}
