import React, { useState } from 'react';
import { Bell, X } from 'lucide-react';
import { enablePush, permissionState } from './push';

// Faixa "Ativar notificações": só aparece onde dá pra ativar e a pessoa ainda não
// respondeu. A permissão precisa ser pedida dentro de um clique (exigência do iPhone).
export default function PushPrompt({ api, app, phone = false, text }) {
  const dismissKey = `push_prompt_dismissed_${app}`;
  const [state, setState] = useState(() => permissionState());
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(dismissKey) === '1'; } catch { return false; }
  });
  const [busy, setBusy] = useState(false);

  if (state !== 'default' || dismissed) return null;

  const activate = async () => {
    setBusy(true);
    try {
      setState(await enablePush(api, app));
    } catch (error) {
      console.error('Notificações:', error);
      alert('Não foi possível ativar as notificações neste aparelho.');
    } finally {
      setBusy(false);
    }
  };

  const dismiss = () => {
    try { localStorage.setItem(dismissKey, '1'); } catch { /* sem armazenamento: só esconde agora */ }
    setDismissed(true);
  };

  return (
    <div role="status" style={{
      display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0,
      margin: phone ? 0 : '0 0 12px', padding: '10px 14px', borderRadius: phone ? 0 : '10px',
      background: 'color-mix(in srgb, var(--accent-primary) 12%, var(--bg-card))', color: 'var(--text-primary)',
      border: '1px solid var(--accent-primary)', fontSize: '0.9rem'
    }}>
      <Bell size={18} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
      <span style={{ flex: 1 }}>{text}</span>
      <button type="button" onClick={activate} disabled={busy} style={{
        padding: '8px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 700,
        background: 'var(--accent-primary)', color: 'var(--on-accent)', flexShrink: 0
      }}>
        {busy ? 'Ativando...' : 'Ativar'}
      </button>
      <button type="button" onClick={dismiss} aria-label="Agora não" title="Agora não" style={{
        background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px', flexShrink: 0
      }}>
        <X size={18} />
      </button>
    </div>
  );
}
