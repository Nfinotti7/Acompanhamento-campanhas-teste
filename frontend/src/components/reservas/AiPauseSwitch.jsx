import React, { useState, useEffect, useCallback } from 'react';
import { Bot, Pause, Play } from 'lucide-react';

// Pausa geral da atendente com IA, no topo da lista do Balcão. Só aparece quando a IA está
// ligada no Configurar (ai.enabled). Pausar não apaga a configuração: grava ai.paused, e a IA
// volta com um clique. Enquanto está pausada, o robô de reserva de antes responde.
export default function AiPauseSwitch({ api, onChange }) {
  const [ai, setAi] = useState(null); // null = não mostra
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get('/api/reservations/settings')
      .then((res) => {
        const a = res.data?.settings?.ai;
        setAi(res.data?.enabled && a?.enabled
          ? { name: a.name || 'Atendente', paused: Boolean(a.paused), test: (a.test_phones || []).length > 0 }
          : null);
      })
      .catch(() => setAi(null));
  }, [api]);

  useEffect(() => { load(); }, [load]);

  if (!ai) return null;

  const toggle = async () => {
    const next = !ai.paused;
    if (next && !window.confirm(`Pausar ${ai.name} em todas as conversas? Enquanto estiver pausada, quem escrever é atendido pelos robôs de antes (ou pela equipe). Você retoma quando quiser.`)) return;
    setBusy(true);
    try {
      await api.put('/api/reservations/settings', { ai: { paused: next } });
      setAi({ ...ai, paused: next });
      if (onChange) onChange();
    } catch {
      alert('Não foi possível mudar a IA agora.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', padding: '6px 8px',
      borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--surface-subtle)'
    }}>
      <Bot size={15} style={{ color: ai.paused ? 'var(--text-muted)' : 'var(--accent-link)', flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0, fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
        {ai.paused ? `${ai.name} (IA) pausada` : `${ai.name} (IA) atendendo`}{ai.test && !ai.paused ? ' · teste' : ''}
      </span>
      <button type="button" className="nm-btn nm-btn-muted" style={{ minHeight: '30px', padding: '4px 8px', fontSize: '0.75rem' }} disabled={busy} onClick={toggle}>
        {ai.paused ? <><Play size={12} /> Retomar</> : <><Pause size={12} /> Pausar tudo</>}
      </button>
    </div>
  );
}
