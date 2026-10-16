import React, { useState, useEffect } from 'react';
import { Printer, Save } from 'lucide-react';

const C = { panel: '#131b2e', border: 'rgba(255,255,255,0.1)', muted: '#94a3b8', accent: '#f59e0b' };

const MESSAGE_LABELS = {
  askSize: 'Pergunta de quantas pessoas',
  askSizeAgain: 'Quando não entende o número',
  joined: 'Entrou na fila',
  status: 'Resposta de posição',
  near: 'Quase lá',
  called: 'Mesa pronta (botão Chamar)',
  calledReminder: 'Lembrança de mesa pronta',
  noShow: 'Não veio',
  left: 'Saiu da fila'
};

const field = { width: '100%', padding: '12px', borderRadius: '10px', border: `1px solid ${C.border}`, background: '#0b1120', color: '#fff', fontSize: '1rem' };

export default function WaitlistSettings({ api }) {
  const [settings, setSettings] = useState(null);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api.get('/api/waitlist/settings').then((res) => setSettings(res.data.settings));
  }, [api]);

  if (!settings) return <p style={{ color: C.muted }}>Carregando...</p>;

  const set = (key, value) => setSettings({ ...settings, [key]: value });

  const save = async () => {
    setMsg('');
    try {
      const res = await api.put('/api/waitlist/settings', settings);
      setSettings(res.data.settings);
      setMsg('Salvo!');
    } catch (err) {
      setMsg(err.response?.data?.error || 'Erro ao salvar.');
    }
  };

  const printQr = async () => {
    // Abre a janela ainda dentro do clique: tablet (Safari/Chrome) bloqueia pop-up
    // aberto depois de um await, fora do gesto do usuário.
    const w = window.open('', '_blank');
    if (!w) {
      alert('O navegador bloqueou a janela de impressão. Permita pop-ups pra este site e tente de novo.');
      return;
    }
    try {
      const { data } = await api.get('/api/waitlist/qr');
      w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>QR da fila</title>
        <style>body{font-family:system-ui,sans-serif;text-align:center;padding:40px}h1{font-size:42px;margin:0 0 8px}p{font-size:22px;color:#444}img{width:420px;max-width:90vw}</style>
        </head><body><h1>Entre na fila pelo WhatsApp</h1><p>Aponte a câmera do celular e mande a mensagem</p>
        <img src="${data.dataUrl}" alt="QR da fila"/><p>Você recebe sua posição e avisamos quando a mesa estiver pronta.</p>
        <script>window.onload=()=>window.print()</script></body></html>`);
      w.document.close();
    } catch (err) {
      w.close();
      alert(err.response?.data?.error || 'Erro ao gerar o QR.');
    }
  };

  const num = (key, label, min, max) => (
    <label style={{ display: 'block', marginBottom: '12px' }}>
      <span style={{ color: C.muted, fontSize: '0.9rem' }}>{label}</span>
      <input type="number" min={min} max={max} style={field} value={settings[key]} onChange={(e) => set(key, Number(e.target.value))} />
    </label>
  );

  return (
    <div style={{ display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
      <section style={{ background: C.panel, padding: '16px', borderRadius: '12px' }}>
        <h3 style={{ marginTop: 0 }}>Fila</h3>
        <label style={{ display: 'block', marginBottom: '12px' }}>
          <span style={{ color: C.muted, fontSize: '0.9rem' }}>WhatsApp do restaurante (com DDD)</span>
          <input style={field} value={settings.whatsapp_number || ''} placeholder="(11) 99999-8888" onChange={(e) => set('whatsapp_number', e.target.value)} />
        </label>
        {num('default_minutes_per_party', 'Minutos por grupo (até ter histórico da noite)', 1, 60)}
        {num('hold_minutes', 'Tolerância depois de chamar (min)', 1, 60)}
        {num('near_threshold', 'Avisar "quase lá" quando faltarem N grupos', 0, 10)}
        <label style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '16px' }}>
          <input type="checkbox" checked={settings.notify_no_show} onChange={(e) => set('notify_no_show', e.target.checked)} />
          Mandar mensagem quando marcar "Não veio"
        </label>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={save} style={{ padding: '12px 16px', borderRadius: '10px', border: 'none', background: C.accent, fontWeight: 700, cursor: 'pointer' }}><Save size={16} style={{ verticalAlign: 'middle' }} /> Salvar</button>
          <button onClick={printQr} style={{ padding: '12px 16px', borderRadius: '10px', border: `1px solid ${C.border}`, background: 'transparent', color: '#fff', fontWeight: 700, cursor: 'pointer' }}><Printer size={16} style={{ verticalAlign: 'middle' }} /> Imprimir QR da porta</button>
        </div>
        {msg && <p style={{ color: C.muted }}>{msg}</p>}
      </section>

      <section style={{ background: C.panel, padding: '16px', borderRadius: '12px' }}>
        <h3 style={{ marginTop: 0 }}>Mensagens do robô</h3>
        <p style={{ color: C.muted, fontSize: '0.85rem' }}>Variáveis: {'{nome} {posicao} {espera} {faltam} {tolerancia}'}. Apague o texto pra voltar ao padrão.</p>
        {Object.entries(MESSAGE_LABELS).map(([key, label]) => (
          <label key={key} style={{ display: 'block', marginBottom: '12px' }}>
            <span style={{ color: C.muted, fontSize: '0.9rem' }}>{label}</span>
            <textarea rows={3} style={{ ...field, resize: 'vertical' }} value={settings.messages[key] || ''}
              onChange={(e) => set('messages', { ...settings.messages, [key]: e.target.value })} />
          </label>
        ))}
        <button onClick={save} style={{ padding: '12px 16px', borderRadius: '10px', border: 'none', background: C.accent, fontWeight: 700, cursor: 'pointer' }}>Salvar mensagens</button>
      </section>
    </div>
  );
}
