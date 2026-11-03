import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { AlertTriangle, Timer, Trophy, CalendarClock } from 'lucide-react';

const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (v) => `${Math.round(Number(v || 0) * 100)}%`;

// 0,4 → "menos de 1 min"; 7 → "7 min"; 75 → "1h15"
export function formatMinutes(m) {
  if (m === null || m === undefined) return '—';
  if (m < 1) return 'menos de 1 min';
  if (m < 60) return `${Math.round(m)} min`;
  const h = Math.floor(m / 60);
  const min = Math.round(m % 60);
  return min ? `${h}h${String(min).padStart(2, '0')}` : `${h}h`;
}

const VERDICT = {
  escalar: { label: 'Escalar', color: 'var(--accent-success)' },
  pausar: { label: 'Pausar?', color: 'var(--accent-danger)' }
};

const th = { padding: '8px 10px', fontWeight: 600, borderBottom: '1px solid var(--border-color)', textAlign: 'left', whiteSpace: 'nowrap' };
const td = { padding: '10px', borderBottom: '1px solid var(--border-color)' };

function Box({ title, icon, children }) {
  return (
    <div className="glass-card" style={{ padding: '20px', marginBottom: '16px' }}>
      <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        {icon}{title}
      </h3>
      {children}
    </div>
  );
}

export default function InsightsPanel({ clientId, range }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!clientId) return undefined;
    let cancelled = false;
    setError('');
    axios.get('/api/whatsapp/insights', { params: { clientId, range } })
      .then((res) => { if (!cancelled) setData(res.data); })
      .catch((err) => { if (!cancelled) setError(err.response?.data?.error || 'Erro ao carregar os indicadores.'); });
    return () => { cancelled = true; };
  }, [clientId, range]);

  if (error) return <p style={{ color: 'var(--accent-danger)' }}>{error}</p>;
  if (!data) return null;
  const { creatives, responseTimes: rt, alerts } = data;

  return (
    <>
      {alerts.length > 0 && (
        <Box title="Atenção nas campanhas" icon={<AlertTriangle size={18} color="var(--accent-warning)" />}>
          <ul style={{ margin: 0, paddingLeft: '18px', display: 'grid', gap: '6px', fontSize: '0.88rem', color: 'var(--text-primary)' }}>
            {alerts.map((a, i) => (
              <li key={i}>{a.message.replace(/\*/g, '')}</li>
            ))}
          </ul>
        </Box>
      )}

      {data.upcomingDates?.length > 0 && (
        <Box title="Datas para planejar campanha" icon={<CalendarClock size={18} color="var(--accent-primary)" />}>
          <div style={{ display: 'grid', gap: '10px' }}>
            {data.upcomingDates.map((d) => (
              <div key={d.key} style={{ display: 'grid', gap: 2, paddingBottom: 8, borderBottom: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <strong style={{ color: 'var(--text-primary)', fontSize: '0.9rem' }}>{d.name}</strong>
                  <span style={{ fontSize: '0.78rem', color: d.status === 'comecar_agora' ? 'var(--accent-warning)' : 'var(--text-muted)', fontWeight: 700 }}>
                    {d.date.slice(8, 10)}/{d.date.slice(5, 7)} · em {d.daysUntil} {d.daysUntil === 1 ? 'dia' : 'dias'}
                    {d.status === 'comecar_agora' ? ' · começar a campanha agora' : ` · começar em ${d.startOn.slice(8, 10)}/${d.startOn.slice(5, 7)}`}
                  </span>
                </div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{d.tip}</span>
              </div>
            ))}
          </div>
        </Box>
      )}

      <Box title="Tempo de resposta" icon={<Timer size={18} color="var(--accent-primary)" />}>
        {rt.conversations === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>Nenhuma conversa nova no período.</p>
        ) : (
          <div style={{ display: 'flex', gap: '28px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Primeira resposta (típico)</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)' }}>{formatMinutes(rt.medianMinutes)}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Respondidas em até 5 min</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: rt.within5Pct !== null && rt.within5Pct >= 0.7 ? 'var(--accent-success)' : 'var(--accent-warning)' }}>
                {rt.within5Pct === null ? '—' : pct(rt.within5Pct)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Sem resposta</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: rt.unanswered > 0 ? 'var(--accent-danger)' : 'var(--text-primary)' }}>{rt.unanswered}</div>
            </div>
          </div>
        )}
      </Box>

      <Box title="Anúncios que geram reserva" icon={<Trophy size={18} color="var(--accent-primary)" />}>
        {creatives.ads.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>Nenhuma conversa com anúncio identificado no período.</p>
        ) : (
          <>
            <h4 style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 6px' }}>Por campanha</h4>
            <div style={{ overflowX: 'auto', marginBottom: '16px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead><tr style={{ color: 'var(--text-muted)' }}>
                  {['Campanha', 'Conversas', 'Reservas', 'Investimento', 'Custo/reserva', 'Não vieram'].map((h) => <th key={h} style={th}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {creatives.campaigns.map((c) => (
                    <tr key={c.campaignId} style={{ color: 'var(--text-primary)' }}>
                      <td style={td}>{c.campaignName}</td>
                      <td style={td}>{c.conversations}</td>
                      <td style={{ ...td, fontWeight: 700 }}>{c.reservations}</td>
                      <td style={td}>{c.spend > 0 ? brl(c.spend) : '—'}</td>
                      <td style={td}>{c.costPerReservation === null ? '—' : brl(c.costPerReservation)}</td>
                      <td style={td}>{c.noShowRate === null ? '—' : pct(c.noShowRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h4 style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 6px' }}>Por anúncio</h4>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead><tr style={{ color: 'var(--text-muted)' }}>
                  {['Anúncio', 'Campanha', 'Conversas', 'Reservas', 'Conversão', 'Não vieram', ''].map((h, i) => <th key={i} style={th}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {creatives.ads.map((a) => (
                    <tr key={a.adId} style={{ color: 'var(--text-primary)' }}>
                      <td style={td}>{a.adName}</td>
                      <td style={{ ...td, color: 'var(--text-secondary)' }}>{a.campaignName}</td>
                      <td style={td}>{a.conversations}</td>
                      <td style={{ ...td, fontWeight: 700 }}>{a.reservations}</td>
                      <td style={td}>{pct(a.reservationRate)}</td>
                      <td style={td}>{a.noShowRate === null ? '—' : pct(a.noShowRate)}</td>
                      <td style={{ ...td, fontWeight: 700, color: VERDICT[a.verdict]?.color }}>{VERDICT[a.verdict]?.label || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: 0 }}>
              "Escalar" = converte pelo menos 1,5× a média em reservas. "Pausar?" = 10 ou mais conversas e nenhuma reserva. Só vale com volume: é um sinal pra olhar, não uma ordem.
            </p>
          </>
        )}
      </Box>
    </>
  );
}
