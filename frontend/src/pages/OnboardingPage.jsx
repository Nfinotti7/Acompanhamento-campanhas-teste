import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { ListChecks, CheckCircle2, Circle } from 'lucide-react';

// Checklist de implantação de um cliente: o que já está pronto e onde fazer o que falta.
export default function OnboardingPage({ selectedClient, onNavigate }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!selectedClient) return;
    setError('');
    setData(null);
    axios.get('/api/owner/onboarding', { params: { clientId: selectedClient } })
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.error || 'Erro ao carregar a implantação.'));
  }, [selectedClient]);

  const header = (
    <div style={{ marginBottom: 20 }}>
      <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <ListChecks size={28} color="var(--accent-primary)" /> Implantação
      </h1>
      <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Passo a passo para deixar um cliente novo rodando por completo.</p>
    </div>
  );

  if (!selectedClient) return <div className="animate-fade-in">{header}<p style={{ color: 'var(--text-muted)' }}>Selecione um cliente no topo da página.</p></div>;
  if (error) return <div className="animate-fade-in">{header}<p style={{ color: 'var(--accent-danger)' }}>{error}</p></div>;
  if (!data) return <div className="animate-fade-in">{header}<p style={{ color: 'var(--text-muted)' }}>Carregando...</p></div>;

  const progress = data.requiredTotal ? data.requiredDone / data.requiredTotal : 0;

  return (
    <div className="animate-fade-in">
      {header}
      <div className="glass-card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-primary)', marginBottom: 6 }}>
          <span>Essenciais: {data.requiredDone} de {data.requiredTotal}</span>
          <span style={{ color: 'var(--text-muted)' }}>Total: {data.done} de {data.total}</span>
        </div>
        <div style={{ height: 10, background: 'var(--border-color)', borderRadius: 6 }}>
          <div style={{ width: `${Math.round(progress * 100)}%`, height: '100%', background: 'var(--accent-success)', borderRadius: 6 }} />
        </div>
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        {data.steps.map((step) => (
          <div key={step.key} className="glass-card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, opacity: step.done ? 0.75 : 1 }}>
            {step.done ? <CheckCircle2 size={22} color="var(--accent-success)" /> : <Circle size={22} color="var(--text-muted)" />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.92rem' }}>
                {step.title}{step.optional && <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.75rem' }}> · opcional</span>}
              </div>
              {!step.done && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{step.hint}</div>}
            </div>
            {!step.done && step.tab && onNavigate && (
              <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '6px 12px' }} onClick={() => onNavigate(step.tab)}>Abrir</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
