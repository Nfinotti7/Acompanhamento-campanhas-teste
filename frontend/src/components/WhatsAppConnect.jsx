import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, Smartphone, AlertTriangle, RefreshCw, LogOut } from 'lucide-react';

const POLL_MS = 4000;
// Tempo em "conectando" sem virar QR nem conectado: aí oferece gerar um QR novo.
const STUCK_MS = 45000;

// Conexão do WhatsApp (Baileys) feita pelo próprio restaurante, logado pelo PIN:
// mostra o status, o QR quando precisa, e deixa desconectar / trocar de número.
export default function WhatsAppConnect({ api }) {
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [stuck, setStuck] = useState(false);
  const waitingSince = useRef(null);

  const apply = (data) => {
    setState(data);
    setError('');
    const waiting = !['connected', 'qr'].includes(data.status) || (data.status === 'qr' && !data.qrDataUrl);
    if (!waiting) { waitingSince.current = null; setStuck(false); return; }
    if (!waitingSince.current) waitingSince.current = Date.now();
    setStuck(Date.now() - waitingSince.current > STUCK_MS);
  };

  useEffect(() => {
    let alive = true;
    const load = () => api.get('/api/whatsapp/baileys/status')
      .then((res) => { if (alive) apply(res.data); })
      .catch((err) => { if (alive) setError(err.response?.data?.error || 'Não foi possível consultar o WhatsApp.'); });
    load();
    const t = setInterval(load, POLL_MS);
    return () => { alive = false; clearInterval(t); };
  }, [api]);

  const reset = async (confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    waitingSince.current = null;
    setStuck(false);
    try {
      const res = await api.post('/api/whatsapp/baileys/reset');
      apply(res.data);
    } catch (err) {
      alert(err.response?.data?.error || 'Não foi possível reiniciar a conexão.');
    } finally {
      setBusy(false);
    }
  };

  const box = { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px', color: 'var(--text-primary)' };
  const btn = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px', minHeight: '44px',
    padding: '10px 14px', borderRadius: '10px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit'
  };

  if (error) {
    return (
      <section style={box}>
        <h3 style={{ marginTop: 0 }}>Conexão do WhatsApp</h3>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
          {/oficial|Baileys/i.test(error)
            ? 'Este restaurante usa a API oficial do WhatsApp: não precisa de QR code.'
            : error}
        </p>
      </section>
    );
  }

  if (!state) {
    return <section style={box}><p style={{ color: 'var(--text-muted)', margin: 0 }}>Consultando o WhatsApp...</p></section>;
  }

  const status = state.status;
  const waiting = !['connected', 'qr'].includes(status) || (status === 'qr' && !state.qrDataUrl);

  return (
    <section style={box}>
      <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '8px' }}><Smartphone size={18} /> Conexão do WhatsApp</h3>

      {status === 'connected' && (
        <p style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0, fontWeight: 700, color: 'var(--accent-success)' }}>
          <CheckCircle2 size={20} /> WhatsApp conectado
        </p>
      )}

      {status === 'qr' && state.qrDataUrl && (
        <div style={{ display: 'grid', gap: '14px', justifyItems: 'center', textAlign: 'center' }}>
          <p style={{ margin: 0, fontWeight: 700, color: 'var(--accent-warning)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <AlertTriangle size={18} /> Precisa conectar: escaneie o QR
          </p>
          {/* fundo branco fixo: o QR precisa de contraste pra câmera ler, em qualquer tema */}
          <img src={state.qrDataUrl} alt="QR code do WhatsApp" style={{ width: 'min(280px, 80vw)', background: 'white', padding: '10px', borderRadius: '12px' }} />
          <ol style={{ textAlign: 'left', margin: 0, paddingLeft: '20px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            <li>Abra o WhatsApp no <b>celular do restaurante</b>.</li>
            <li>Toque em <b>⋮</b> (ou Configurações) → <b>Aparelhos conectados</b>.</li>
            <li>Toque em <b>Conectar um aparelho</b> e aponte a câmera pra este QR.</li>
          </ol>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Esta tela atualiza sozinha quando conectar.</p>
        </div>
      )}

      {waiting && !stuck && (
        <p style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0, color: 'var(--text-secondary)' }}>
          <Loader2 size={18} className="spin" /> Conectando ao WhatsApp...
        </p>
      )}

      {waiting && stuck && (
        <div style={{ display: 'grid', gap: '10px' }}>
          <p style={{ margin: 0, fontWeight: 700, color: 'var(--accent-warning)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <AlertTriangle size={18} /> Não conectou.
          </p>
          <button type="button" disabled={busy} onClick={() => reset()} style={{ ...btn, border: 'none', background: 'var(--accent-primary)', color: 'var(--on-accent)' }}>
            <RefreshCw size={16} /> {busy ? 'Gerando...' : 'Gerar novo QR'}
          </button>
        </div>
      )}

      {!waiting && (
        <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--border-color)' }}>
          <button
            type="button"
            disabled={busy}
            onClick={() => reset('Desconectar este WhatsApp? O atendimento pelo sistema para até escanearem o QR de novo (com este ou com outro número).')}
            style={{ ...btn, background: 'transparent', color: 'var(--accent-danger)', border: '1px solid var(--accent-danger)' }}
          >
            <LogOut size={16} /> {busy ? 'Desconectando...' : 'Desconectar / trocar número'}
          </button>
        </div>
      )}
    </section>
  );
}
