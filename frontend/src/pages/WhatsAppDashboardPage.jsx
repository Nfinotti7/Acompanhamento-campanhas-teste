import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { PieChart as PieIcon } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from 'recharts';
import { ORIGIN_META } from '../components/AttributionView';

const ORIGIN_KEYS = ['meta_ads', 'google_ads', 'outras', 'nao_rastreada'];

const brl = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (value) => `${(Number(value || 0) * 100).toFixed(1).replace('.', ',')}%`;
const shortDay = (day) => day.slice(8, 10) + '/' + day.slice(5, 7);

const tooltipStyle = { backgroundColor: '#0f1420', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff' };

function Card({ title, children, style }) {
  return (
    <div className="glass-card" style={{ padding: '20px', ...style }}>
      {title && <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff', marginBottom: '16px' }}>{title}</h3>}
      {children}
    </div>
  );
}

function Stat({ label, value, color = '#fff', sub }) {
  return (
    <div>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: '1.6rem', fontWeight: 800, color }}>{value}</div>
      {sub && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{sub}</div>}
    </div>
  );
}

function FunnelBar({ label, value, total, color }) {
  const share = total > 0 ? value / total : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: 4 }}>
        <span>{label}</span>
        <span>{value} <span style={{ color: 'var(--text-muted)' }}>({pct(share)})</span></span>
      </div>
      <div style={{ height: 10, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 6 }}>
        <div style={{ width: `${Math.max(share * 100, value > 0 ? 2 : 0)}%`, height: '100%', backgroundColor: color, borderRadius: 6 }} />
      </div>
    </div>
  );
}

export default function WhatsAppDashboardPage({ selectedClient, selectedRange }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!selectedClient) return;
    setLoading(true);
    setError('');
    axios.get('/api/whatsapp/dashboard', { params: { clientId: selectedClient, range: selectedRange } })
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.error || 'Erro ao carregar o dashboard.'))
      .finally(() => setLoading(false));
  }, [selectedClient, selectedRange]);

  const header = (
    <div style={{ marginBottom: '24px' }}>
      <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <PieIcon size={28} color="var(--accent-primary)" />
        Dashboard WhatsApp
      </h1>
      <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
        De onde vêm as conversas, quanto avançam no funil e quanto cada campanha vendeu de verdade.
      </p>
    </div>
  );

  if (!selectedClient) {
    return <div className="animate-fade-in">{header}<Card><p style={{ color: 'var(--text-muted)' }}>Selecione um cliente no topo da página.</p></Card></div>;
  }
  if (loading && !data) return <div className="animate-fade-in">{header}<p style={{ color: 'var(--text-muted)' }}>Carregando...</p></div>;
  if (error) return <div className="animate-fade-in">{header}<p style={{ color: '#f87171' }}>{error}</p></div>;
  if (!data) return null;

  const { conversations, funnel, sales, campaigns } = data;
  const donut = [
    { name: 'Rastreadas', value: conversations.tracked, color: '#10b981' },
    { name: 'Não rastreadas', value: conversations.untracked, color: '#f59e0b' }
  ];

  return (
    <div className="animate-fade-in" style={{ opacity: loading ? 0.6 : 1 }}>
      {header}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) 2fr', gap: '16px', marginBottom: '16px' }}>
        <Card title="Visão geral das conversas">
          <Stat label="Conversas novas no período" value={conversations.total} />
          <div style={{ height: 170, marginTop: 8 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={donut} dataKey="value" innerRadius={50} outerRadius={70} stroke="none">
                  {donut.map((d) => <Cell key={d.name} fill={d.color} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-around', fontSize: '0.8rem' }}>
            <span style={{ color: '#10b981' }}>{conversations.tracked} rastreadas ({pct(conversations.total ? conversations.tracked / conversations.total : 0)})</span>
            <span style={{ color: '#f59e0b' }}>{conversations.untracked} não rastreadas</span>
          </div>
        </Card>

        <Card title="Origem das conversas">
          <div style={{ display: 'flex', gap: '28px', flexWrap: 'wrap', marginBottom: 12 }}>
            {ORIGIN_KEYS.map((key) => (
              <Stat key={key} label={ORIGIN_META[key].label} value={conversations.byOrigin[key]} color={ORIGIN_META[key].color} />
            ))}
          </div>
          <div style={{ height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={conversations.daily}>
                <XAxis dataKey="day" tickFormatter={shortDay} stroke="#64748b" fontSize={11} />
                <YAxis allowDecimals={false} stroke="#64748b" fontSize={11} width={28} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={shortDay} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <Legend formatter={(key) => ORIGIN_META[key]?.label || key} wrapperStyle={{ fontSize: 12 }} />
                {ORIGIN_KEYS.map((key) => (
                  <Bar key={key} dataKey={key} stackId="origem" fill={ORIGIN_META[key].color} name={key} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) 2fr', gap: '16px', marginBottom: '16px' }}>
        <Card title="Funil das conversas do período">
          <FunnelBar label="Fez contato" value={funnel.contacted} total={funnel.contacted} color="#6366f1" />
          <FunnelBar label="Foi respondido" value={funnel.answered} total={funnel.contacted} color="#3b82f6" />
          <FunnelBar label="Agendou" value={funnel.scheduled} total={funnel.contacted} color="#a855f7" />
          <FunnelBar label="Comprou" value={funnel.bought} total={funnel.contacted} color="#10b981" />
        </Card>

        <Card title="Vendas">
          <div style={{ display: 'flex', gap: '28px', flexWrap: 'wrap', marginBottom: 12 }}>
            <Stat label="Vendas lançadas" value={sales.total} />
            <Stat label="Faturamento" value={brl(sales.revenue)} color="#10b981" />
            <Stat label="Conversão" value={pct(sales.conversionRate)} sub="das conversas novas que compraram" />
          </div>
          <div style={{ height: 200 }}>
            <ResponsiveContainer>
              <BarChart data={sales.daily}>
                <XAxis dataKey="day" tickFormatter={shortDay} stroke="#64748b" fontSize={11} />
                <YAxis allowDecimals={false} stroke="#64748b" fontSize={11} width={28} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={shortDay} cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  formatter={(value, name) => (name === 'revenue' ? [brl(value), 'Faturamento'] : [value, 'Vendas'])} />
                <Bar dataKey="sales" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card title="Resultado por campanha (Meta Ads)">
        {campaigns.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Nenhuma conversa de anúncio com campanha identificada no período. A campanha só é identificada em
            conversas que chegam pela API oficial do WhatsApp (o modo WhatsApp Web não informa o anúncio).
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}>
                  {['Campanha', 'Conversas', 'Vendas', 'Faturamento', 'Investimento', 'Custo/conversa', 'ROAS'].map((h) => (
                    <th key={h} style={{ padding: '8px 10px', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.campaignId} style={{ color: '#fff' }}>
                    <td style={{ padding: '10px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>{c.campaignName}</td>
                    <td style={{ padding: '10px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>{c.conversations}</td>
                    <td style={{ padding: '10px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>{c.sales}</td>
                    <td style={{ padding: '10px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#10b981' }}>{brl(c.revenue)}</td>
                    <td style={{ padding: '10px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>{brl(c.spend)}</td>
                    <td style={{ padding: '10px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>{c.costPerConversation === null ? '—' : brl(c.costPerConversation)}</td>
                    <td style={{ padding: '10px', borderBottom: '1px solid rgba(255,255,255,0.04)', fontWeight: 700 }}>{c.roas === null ? '—' : `${c.roas.toFixed(2).replace('.', ',')}x`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
