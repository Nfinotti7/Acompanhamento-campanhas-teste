import React, { useEffect, useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend
} from 'recharts';
import { LineChart as LineIcon, PieChart as PieIcon, BarChart2, Sparkles } from 'lucide-react';

export const METRIC_CATALOG = {
  spend: { label: 'Investimento', color: '#6366f1', format: 'currency' },
  conversion_value: { label: 'Receita', color: '#a855f7', format: 'currency' },
  clicks: { label: 'Cliques', color: '#3b82f6', format: 'number' },
  impressions: { label: 'Impressões', color: '#8b5cf6', format: 'number' },
  reach: { label: 'Alcance', color: '#06b6d4', format: 'number' },
  conversions: { label: 'Conversões (Resultados)', color: '#10b981', format: 'number' },
  cpa: { label: 'Custo por Resultado (CPA)', color: '#f59e0b', format: 'currency' },
  cpc: { label: 'CPC', color: '#ec4899', format: 'currency' },
  cpm: { label: 'CPM', color: '#eab308', format: 'currency' },
  ctr: { label: 'CTR', color: '#14b8a6', format: 'percent' },
  roas: { label: 'ROAS', color: '#22c55e', format: 'ratio' },
  roi: { label: 'ROI', color: '#ef4444', format: 'percent' }
};

const DEFAULT_METRICS = ['spend', 'conversions', 'cpa', 'roas'];
const METRICS_STORAGE_KEY = 'further_ads_chart_metrics';

function formatMetricValue(format, value) {
  const n = Number(value) || 0;
  if (format === 'currency') return `R$ ${n.toFixed(2)}`;
  if (format === 'percent') return `${n.toFixed(2)}%`;
  if (format === 'ratio') return `${n.toFixed(2)}x`;
  return n.toLocaleString('pt-BR');
}

function loadStoredMetrics() {
  try {
    const stored = JSON.parse(localStorage.getItem(METRICS_STORAGE_KEY));
    if (Array.isArray(stored) && stored.length === 4 && stored.every((k) => k === '' || METRIC_CATALOG[k])) {
      return stored;
    }
  } catch {
    // ignore malformed/missing storage
  }
  return DEFAULT_METRICS;
}

export default function ChartsSection({ dailyData = [], platformBreakdown = [], hidePlatformBreakdown = false }) {
  const [selectedMetrics, setSelectedMetrics] = useState(loadStoredMetrics);
  const [chartType, setChartType] = useState('area'); // 'area' or 'line'

  useEffect(() => {
    try {
      localStorage.setItem(METRICS_STORAGE_KEY, JSON.stringify(selectedMetrics));
    } catch {
      // localStorage unavailable (private browsing, etc) — selection just won't persist
    }
  }, [selectedMetrics]);

  const changeMetricSlot = (slotIndex, newKey) => {
    setSelectedMetrics((prev) => {
      const next = [...prev];
      next[slotIndex] = newKey;
      return next;
    });
  };

  // Empty slots ('') mean "no metric" — only slots with a real metric become chart lines.
  const activeMetrics = selectedMetrics.filter(Boolean);

  // Normalize each selected metric to 0-100% of its own max so wildly different
  // units (R$, %, count, "x") can share one visual scale. Tooltip still shows
  // the real value with the right unit, read from the untouched fields below.
  const maxByMetric = activeMetrics.reduce((acc, key) => {
    acc[key] = Math.max(1, ...dailyData.map((d) => Number(d[key]) || 0));
    return acc;
  }, {});

  const chartData = dailyData.map((row) => {
    const point = { ...row };
    for (const key of activeMetrics) {
      point[`${key}__norm`] = ((Number(row[key]) || 0) / maxByMetric[key]) * 100;
    }
    return point;
  });

  const PLATFORM_COLORS = {
    google: '#4285f4',
    meta: '#0084ff'
  };

  const formattedPlatformData = platformBreakdown.map(p => ({
    name: p.platform === 'google' ? 'Google Ads' : 'Meta Ads',
    value: p.spend,
    conversions: p.conversions,
    color: PLATFORM_COLORS[p.platform] || '#6366f1'
  }));

  const MultiMetricTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null;
    return (
      <div style={{
        backgroundColor: '#0f1627',
        border: '1px solid var(--border-glow)',
        padding: '12px 16px',
        borderRadius: 'var(--radius-sm)',
        boxShadow: 'var(--shadow-card)'
      }}>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
          Data: {label}
        </p>
        {activeMetrics.map((key) => {
          const meta = METRIC_CATALOG[key];
          const row = payload[0]?.payload || {};
          return (
            <p key={key} style={{ fontSize: '0.85rem', fontWeight: 600, color: meta.color, marginBottom: '4px' }}>
              {meta.label}: {formatMetricValue(meta.format, row[key])}
            </p>
          );
        })}
      </div>
    );
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px', marginBottom: '32px' }}>

      {/* 1. Primary Interactive Performance Chart */}
      <div className="glass-card" style={{ padding: '24px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '20px',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <LineIcon size={20} color="var(--accent-primary)" />
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Evolução de Desempenho no Tempo
              </h3>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              Escolha de 1 a 4 métricas — cada uma vira uma linha no gráfico
            </p>
          </div>

          <div style={{
            display: 'flex',
            backgroundColor: 'var(--bg-dark)',
            borderRadius: '6px',
            padding: '2px',
            border: '1px solid var(--border-color)'
          }}>
            <button
              onClick={() => setChartType('area')}
              style={{
                padding: '4px 10px',
                borderRadius: '4px',
                border: 'none',
                backgroundColor: chartType === 'area' ? 'var(--accent-primary)' : 'transparent',
                color: chartType === 'area' ? '#fff' : 'var(--text-muted)',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Área
            </button>
            <button
              onClick={() => setChartType('line')}
              style={{
                padding: '4px 10px',
                borderRadius: '4px',
                border: 'none',
                backgroundColor: chartType === 'line' ? 'var(--accent-primary)' : 'transparent',
                color: chartType === 'line' ? '#fff' : 'var(--text-muted)',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Linha
            </button>
          </div>
        </div>

        {/* 4 independent metric selector slots */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '16px' }}>
          {selectedMetrics.map((key, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Sparkles size={13} color={key ? METRIC_CATALOG[key].color : 'var(--text-muted)'} style={{ flexShrink: 0 }} />
              <select
                value={key}
                onChange={(e) => changeMetricSlot(idx, e.target.value)}
                className="form-select"
                style={{ width: '100%', fontSize: '0.8rem', padding: '6px 10px', backgroundColor: 'var(--bg-dark)' }}
              >
                <option value="">— Nenhuma —</option>
                {Object.entries(METRIC_CATALOG).map(([mKey, m]) => (
                  <option key={mKey} value={mKey}>{m.label}</option>
                ))}
              </select>
            </div>
          ))}
        </div>

        {/* Chart Render */}
        <div style={{ width: '100%', height: '340px' }}>
          {activeMetrics.length === 0 ? (
            <div style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)',
              fontSize: '0.85rem'
            }}>
              Selecione ao menos uma métrica acima para ver o gráfico.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              {chartType === 'area' ? (
                <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    {activeMetrics.map((key) => (
                      <linearGradient key={key} id={`color-${key}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={METRIC_CATALOG[key].color} stopOpacity={0.35} />
                        <stop offset="95%" stopColor={METRIC_CATALOG[key].color} stopOpacity={0} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
                  <Tooltip content={<MultiMetricTooltip />} />
                  <Legend formatter={(key) => METRIC_CATALOG[key.replace('__norm', '')]?.label || key} />
                  {activeMetrics.map((key) => (
                    <Area
                      key={key}
                      type="monotone"
                      dataKey={`${key}__norm`}
                      name={key}
                      stroke={METRIC_CATALOG[key].color}
                      strokeWidth={2}
                      fillOpacity={1}
                      fill={`url(#color-${key})`}
                    />
                  ))}
                </AreaChart>
              ) : (
                <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
                  <Tooltip content={<MultiMetricTooltip />} />
                  <Legend formatter={(key) => METRIC_CATALOG[key.replace('__norm', '')]?.label || key} />
                  {activeMetrics.map((key) => (
                    <Line
                      key={key}
                      type="monotone"
                      dataKey={`${key}__norm`}
                      name={key}
                      stroke={METRIC_CATALOG[key].color}
                      strokeWidth={3}
                      dot={{ r: 3 }}
                    />
                  ))}
                </LineChart>
              )}
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* 2. Secondary Row: Platform Share Donut & Daily Conversions Bar */}
      <div style={{ display: 'grid', gridTemplateColumns: hidePlatformBreakdown ? '1fr' : 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>

        {/* Platform Share Donut */}
        {!hidePlatformBreakdown && (
          <div className="glass-card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <PieIcon size={18} color="var(--accent-google)" />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Divisão por Plataforma (Google Ads vs Meta Ads)
              </h3>
            </div>

            <div style={{ width: '100%', height: '240px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={formattedPlatformData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={85}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {formattedPlatformData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(val) => `R$ ${val.toFixed(2)}`} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Conversions Bar Chart */}
        <div className="glass-card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <BarChart2 size={18} color="var(--accent-success)" />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              Volume Diário de Conversões
            </h3>
          </div>

          <div style={{ width: '100%', height: '240px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 10 }} />
                <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="conversions" name="Conversões" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

    </div>
  );
}
