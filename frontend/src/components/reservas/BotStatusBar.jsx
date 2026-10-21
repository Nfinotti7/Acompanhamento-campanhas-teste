import React, { useState, useEffect, useCallback } from 'react';
import { Bot, Pause, Play } from 'lucide-react';

// Estado do robô de reserva num contato. Recarrega quando chega mensagem dessa conversa
// (signal) e a cada 20s, porque a pausa também muda por resposta dada pelo celular.
export function useContactBot(apiClient, clientId, contactId, signal) {
  const [bot, setBot] = useState({ enabled: false });
  const params = clientId ? { clientId } : undefined;

  const refresh = useCallback(() => {
    if (!contactId) return;
    apiClient.get(`/api/whatsapp/contacts/${contactId}/bot`, { params })
      .then((res) => setBot(res.data))
      .catch(() => setBot({ enabled: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiClient, clientId, contactId]);

  useEffect(() => { refresh(); }, [refresh, signal]);
  useEffect(() => {
    if (!bot.enabled) return undefined;
    const t = setInterval(refresh, 20000);
    return () => clearInterval(t);
  }, [bot.enabled, refresh]);

  const act = async (action) => {
    await apiClient.post(`/api/whatsapp/contacts/${contactId}/bot/${action}`, clientId ? { clientId } : {});
    refresh();
  };

  return { ...bot, refresh, pause: () => act('pause'), resume: () => act('resume') };
}

function untilLabel(iso) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export default function BotStatusBar({ bot }) {
  const [busy, setBusy] = useState(false);
  if (!bot.enabled || (!bot.active && !bot.paused)) return null;

  const run = async (fn) => {
    setBusy(true);
    try { await fn(); } catch { alert('Não foi possível mudar o robô agora.'); } finally { setBusy(false); }
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '10px',
      padding: '8px 10px', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--surface-subtle)'
    }}>
      <Bot size={16} style={{ color: bot.paused ? 'var(--text-muted)' : 'var(--accent-link)', flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: '0.85rem', fontWeight: 600 }}>
        {bot.paused ? `Robô pausado até ${untilLabel(bot.pausedUntil)}` : 'Robô atendendo esta reserva'}
      </span>
      {bot.paused ? (
        <button type="button" className="nm-btn nm-btn-muted" style={{ minHeight: '36px', padding: '6px 10px' }} disabled={busy} onClick={() => run(bot.resume)}>
          <Play size={14} /> Retomar robô
        </button>
      ) : (
        <button type="button" className="nm-btn nm-btn-muted" style={{ minHeight: '36px', padding: '6px 10px' }} disabled={busy} onClick={() => run(bot.pause)}>
          <Pause size={14} /> Pausar robô
        </button>
      )}
    </div>
  );
}
