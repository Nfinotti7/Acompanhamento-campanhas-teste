import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Store } from 'lucide-react';

const PERIODS = [['week', 'Última semana'], ['month', 'Este mês'], ['last_month', 'Mês passado']];
const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (v) => (v === null || v === undefined ? '—' : `${Math.round(v * 100)}%`);

const th = { padding: '8px 10px', fontWeight: 600, borderBottom: '1px solid var(--border-color)', textAlign: 'left', whiteSpace: 'nowrap' };
const td = { padding: '10px', borderBottom: '1px solid var(--border-color)' };

// Compara os restaurantes cadastrados, agrupados pelo "Grupo / rede" do cadastro do cliente.
export default function UnitsPage() {
  const [period, setPeriod] = useState('week');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    axios.get('/api/owner/units', { params: { period } })
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.error || 'Erro ao comparar as unidades.'));
  }, [period]);

  const groups = new Map();
  for (const u of data?.units || []) {
    const key = u.group || 'Sem grupo';
    groups.set(key, [...(groups.get(key) || []), u]);
  }

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Store size={28} color="var(--accent-primary)" /> Unidades
          </h1>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            Compare os restaurantes lado a lado. Para agrupar, preencha "Grupo / rede" no cadastro de cada cliente.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {PERIODS.map(([key, label]) => (
            <button key={key} type="button" onClick={() => setPeriod(key)} className={period === key ? 'btn btn-primary' : 'btn btn-secondary'} style={{ fontSize: '0.82rem', padding: '8px 14px' }}>{label}</button>
          ))}
        </div>
      </div>

      {error && <p style={{ color: 'var(--accent-danger)' }}>{error}</p>}
      {!data && !error && <p style={{ color: 'var(--text-muted)' }}>Carregando...</p>}

      {[...groups.entries()].map(([group, units]) => {
        const best = Math.max(...units.map((u) => u.conversations));
        return (
          <div key={group} className="glass-card" style={{ padding: '20px', marginBottom: 16 }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>{group}</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead><tr style={{ color: 'var(--text-muted)' }}>
                  {['Unidade', 'Conversas', 'Anúncios vistos', 'Cliques', 'Investimento', 'Custo/conversa', 'Reservas'].map((h) => <th key={h} style={th}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {units.map((u) => (
                    <tr key={u.clientId} style={{ color: 'var(--text-primary)' }}>
                      <td style={{ ...td, fontWeight: 700 }}>{u.name}{u.conversations > 0 && u.conversations === best && units.length > 1 ? ' 🏆' : ''}</td>
                      <td style={td}>{u.conversations}</td>
                      <td style={td}>{u.impressions > 0 ? u.impressions.toLocaleString('pt-BR') : '—'}</td>
                      <td style={td}>{u.clicks > 0 ? u.clicks.toLocaleString('pt-BR') : '—'}</td>
                      <td style={td}>{u.spend > 0 ? brl(u.spend) : '—'}</td>
                      <td style={td}>{u.costPerConversation === null ? '—' : brl(u.costPerConversation)}</td>
                      <td style={td}>{u.reservations > 0 ? u.reservations : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
