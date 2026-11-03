import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Gauge, Printer, ArrowUp, ArrowDown } from 'lucide-react';

const PERIODS = [
  ['week', 'Última semana'],
  ['month', 'Este mês'],
  ['last_month', 'Mês passado']
];

const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (v) => (v === null || v === undefined ? '—' : `${Math.round(v * 100)}%`);
const dm = (day) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

// Variação em relação ao período anterior. lowerIsBetter: custo que cai é bom.
function Delta({ now, before, lowerIsBetter = false }) {
  if (!before || now === null || now === undefined) return null;
  const change = (now - before) / before;
  const p = Math.round(Math.abs(change) * 100);
  if (p === 0) return <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>igual ao anterior</span>;
  const good = lowerIsBetter ? change < 0 : change > 0;
  const Icon = change > 0 ? ArrowUp : ArrowDown;
  return (
    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: good ? 'var(--accent-success)' : 'var(--accent-danger)', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
      <Icon size={12} />{p}% <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>vs anterior</span>
    </span>
  );
}

function Big({ label, value, sub, children }) {
  return (
    <div className="glass-card" style={{ padding: '18px' }}>
      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4 }}>{sub}</div>}
      <div style={{ marginTop: 6 }}>{children}</div>
    </div>
  );
}

export default function OwnerSummaryPage({ selectedClient }) {
  const [period, setPeriod] = useState('week');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError('');
    axios.get('/api/owner/summary', { params: { clientId: selectedClient || undefined, period } })
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.error || 'Erro ao carregar o resumo.'))
      .finally(() => setLoading(false));
  }, [selectedClient, period]);

  const print = () => {
    setPrinting(true);
    const done = () => { setPrinting(false); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => window.print(), 80);
  };

  if (error) return <p style={{ color: 'var(--accent-danger)' }}>{error}</p>;
  if (!data) return <p style={{ color: 'var(--text-muted)' }}>{loading ? 'Carregando...' : 'Selecione um cliente no topo da página.'}</p>;

  const { current: c, previous: p, headline } = data;
  const name = data.client?.company || data.client?.name || 'Restaurante';

  return (
    <div className="animate-fade-in" style={{ opacity: loading ? 0.6 : 1 }}>
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Gauge size={28} color="var(--accent-primary)" /> Resumo do dono
          </h1>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Os números que importam, em linguagem simples.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {PERIODS.map(([key, label]) => (
            <button key={key} type="button" onClick={() => setPeriod(key)} className={period === key ? 'btn btn-primary' : 'btn btn-secondary'} style={{ fontSize: '0.82rem', padding: '8px 14px' }}>{label}</button>
          ))}
          <button type="button" onClick={print} className="btn btn-secondary" style={{ fontSize: '0.82rem', padding: '8px 14px' }} title="Imprimir ou salvar em PDF">
            <Printer size={16} /> <span className="btn-label">Imprimir / PDF</span>
          </button>
        </div>
      </div>

      <div id="printable-report-area" data-theme={printing ? 'light' : undefined} style={{ display: 'grid', gap: 16 }}>
        <div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>{name}</h2>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            {PERIODS.find(([k]) => k === period)?.[1]} · {dm(data.period.from)} a {dm(data.period.to)} · comparado com {dm(data.previousPeriod.from)} a {dm(data.previousPeriod.to)}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
          <Big label="Conversas novas" value={c.conversations} sub={c.fromAds ? `${c.fromAds} vindas de anúncio` : null}>
            <Delta now={c.conversations} before={p.conversations} />
          </Big>
          <Big label="Reservas" value={c.reservations} sub={c.people ? `${c.people} pessoas` : null}>
            <Delta now={c.reservations} before={p.reservations} />
          </Big>
          <Big label="Comparecimento" value={pct(c.attendance)} sub={c.attendance === null && c.unmarked ? `${c.unmarked} sem marcação no Balcão` : `${c.arrived} vieram, ${c.noShow} não vieram`} />
          <Big label="Investido em anúncios" value={brl(c.spend)}>
            <Delta now={c.spend} before={p.spend} lowerIsBetter />
          </Big>
          <Big label="Custo por reserva" value={c.costPerReservation === null ? '—' : brl(c.costPerReservation)}>
            <Delta now={c.costPerReservation} before={p.costPerReservation} lowerIsBetter />
          </Big>
          {c.revenue > 0 && (
            <Big label="Vendas lançadas" value={brl(c.revenue)} sub={c.roas ? `${c.roas.toFixed(1).replace('.', ',')}x o investimento` : null}>
              <Delta now={c.revenue} before={p.revenue} />
            </Big>
          )}
        </div>

        <div className="glass-card" style={{ padding: '18px' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>Em resumo</h3>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6, color: 'var(--text-primary)', fontSize: '0.92rem' }}>
            {headline.map((line, i) => <li key={i}>{line}</li>)}
          </ul>
        </div>

        {c.response?.answered > 0 && (
          <div className="glass-card" style={{ padding: '18px', fontSize: '0.9rem', color: 'var(--text-primary)' }}>
            <strong>Atendimento:</strong> {Math.round((c.response.within5Pct || 0) * 100)}% das conversas novas foram respondidas em até 5 minutos
            {c.response.unanswered > 0 ? `, e ${c.response.unanswered} ficaram sem resposta.` : '.'}
          </div>
        )}
      </div>
    </div>
  );
}
