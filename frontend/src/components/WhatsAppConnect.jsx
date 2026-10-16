import React, { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Smartphone, AlertTriangle } from 'lucide-react';

const POLL_MS = 4000;

// Conexão do WhatsApp (Baileys) feita pelo próprio restaurante, logado pelo PIN:
// mostra o status e, quando precisa, o QR pra escanear. Não desconecta nem troca número
// (isso continua com a agência, em Chaves e APIs).
export default function WhatsAppConnect({ api }) {
  const [state, setState] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    const load = () => api.get('/api/whatsapp/baileys/status')
      .then((res) => { if (alive) { setState(res.data); setError(''); } })
      .catch((err) => { if (alive) setError(err.response?.data?.error || 'Não foi possível consultar o WhatsApp.'); });
    load();
    const t = setInterval(load, POLL_MS);
    return () => { alive = false; clearInterval(t); };
  }, [api]);

  const box = { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px', color: 'var(--text-primary)' };

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

      {(status === 'connecting' || status === 'standby' || status === 'disconnected' || (status === 'qr' && !state.qrDataUrl)) && (
        <p style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0, color: 'var(--text-secondary)' }}>
          <Loader2 size={18} className="spin" /> Conectando ao WhatsApp...
        </p>
      )}
    </section>
  );
}
