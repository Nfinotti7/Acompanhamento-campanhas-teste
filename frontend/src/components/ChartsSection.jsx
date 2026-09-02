import React, { useState } from 'react';
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

export default function ChartsSection({ dailyData = [], platformBreakdown = [] }) {
  const [metricChoice, setMetricChoice] = useState('spend_conversions');
  const [chartType, setChartType] = useState('area'); // 'area' or 'line'

  // Metric options mapping
  const metricOptions = {
    spend_conversions: {
      primaryKey: 'spend',
      primaryLabel: 'Gasto (R$)',
      primaryColor: '#6366f1',
      secondaryKey: 'conversions',
      secondaryLabel: 'Conversões',
      secondaryColor: '#10b981'
    },
    clicks_impressions: {
      primaryKey: 'clicks',
      primaryLabel: 'Cliques',
      primaryColor: '#3b82f6',
      secondaryKey: 'impressions',
      secondaryLabel: 'Impressões',
      secondaryColor: '#8b5cf6'
    },
    value_roas: {
      primaryKey: 'conversion_value',
      primaryLabel: 'Receita (R$)',
      primaryColor: '#a855f7',
      secondaryKey: 'spend',
      secondaryLabel: 'Gasto (R$)',
      secondaryColor: '#f59e0b'
    }
  };

  const currentMetric = metricOptions[metricChoice];

  // Pie chart colors
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

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
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
          {payload.map((entry, index) => (
            <p key={`item-${index}`} style={{ fontSize: '0.85rem', fontWeight: 600, color: entry.color, marginBottom: '4px' }}>
              {entry.name}: {typeof entry.value === 'number' && entry.name.includes('R$') ? `R$ ${entry.value.toFixed(2)}` : entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
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
              Gráfico interativo dos dados selecionados
            </p>
          </div>

          {/* Metric Selector & Chart Type Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Sparkles size={14} color="var(--accent-warning)" />
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                Métrica:
              </span>
              <select
                value={metricChoice}
                onChange={(e) => setMetricChoice(e.target.value)}
                className="form-select"
                style={{ width: '220px', fontSize: '0.82rem', padding: '6px 10px', backgroundColor: 'var(--bg-dark)' }}
              >
                <option value="spend_conversions">Investimento vs Conversões</option>
                <option value="clicks_impressions">Cliques vs Impressões</option>
                <option value="value_roas">Receita Gerada vs Investimento</option>
              </select>
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
        </div>

        {/* Chart Render */}
        <div style={{ width: '100%', height: '340px' }}>
          <ResponsiveContainer width="100%" height="100%">
            {chartType === 'area' ? (
              <AreaChart data={dailyData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorPrimary" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={currentMetric.primaryColor} stopOpacity={0.4}/>
                    <stop offset="95%" stopColor={currentMetric.primaryColor} stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorSecondary" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={currentMetric.secondaryColor} stopOpacity={0.4}/>
                    <stop offset="95%" stopColor={currentMetric.secondaryColor} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="left" stroke={currentMetric.primaryColor} tick={{ fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" stroke={currentMetric.secondaryColor} tick={{ fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Area 
                  yAxisId="left"
                  type="monotone" 
                  dataKey={currentMetric.primaryKey} 
                  name={currentMetric.primaryLabel} 
                  stroke={currentMetric.primaryColor} 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#colorPrimary)" 
                />
                <Area 
                  yAxisId="right"
                  type="monotone" 
                  dataKey={currentMetric.secondaryKey} 
                  name={currentMetric.secondaryLabel} 
                  stroke={currentMetric.secondaryColor} 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#colorSecondary)" 
                />
              </AreaChart>
            ) : (
              <LineChart data={dailyData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="left" stroke={currentMetric.primaryColor} tick={{ fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" stroke={currentMetric.secondaryColor} tick={{ fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Line 
                  yAxisId="left"
                  type="monotone" 
                  dataKey={currentMetric.primaryKey} 
                  name={currentMetric.primaryLabel} 
                  stroke={currentMetric.primaryColor} 
                  strokeWidth={3} 
                  dot={{ r: 3 }}
                />
                <Line 
                  yAxisId="right"
                  type="monotone" 
                  dataKey={currentMetric.secondaryKey} 
                  name={currentMetric.secondaryLabel} 
                  stroke={currentMetric.secondaryColor} 
                  strokeWidth={3} 
                  dot={{ r: 3 }}
                />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>

      {/* 2. Secondary Row: Platform Share Donut & Daily Conversions Bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
        
        {/* Platform Share Donut */}
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
