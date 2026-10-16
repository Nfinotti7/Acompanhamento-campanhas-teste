import React, { useState, useEffect } from 'react';
import { Printer, Save } from 'lucide-react';
import { useBreakpoint } from '../../responsive/useBreakpoint';
import WhatsAppConnect from '../WhatsAppConnect';

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

const labelText = { color: 'var(--text-secondary)', fontSize: '0.9rem', display: 'block', marginBottom: '4px' };

export default function WaitlistSettings({ api }) {
  const phone = useBreakpoint() === 'phone';
  const [settings, setSettings] = useState(null);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api.get('/api/waitlist/settings').then((res) => setSettings(res.data.settings));
  }, [api]);

  if (!settings) return <p style={{ color: 'var(--text-muted)' }}>Carregando...</p>;

  const set = (key, value) => setSettings({ ...settings, [key]: value });
  const fullOnPhone = { width: phone ? '100%' : undefined };

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
      // Papel: sempre claro, independente do tema da tela.
      w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>QR da fila</title>
        <style>body{font-family:system-ui,sans-serif;text-align:center;padding:40px;color:#000D30;background:#fff}h1{font-size:42px;margin:0 0 8px}p{font-size:22px;color:#3A4A6B}img{width:420px;max-width:90vw}</style><!-- cor-fixa-ok: papel, sempre claro -->
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
      <span style={labelText}>{label}</span>
      <input type="number" inputMode="numeric" min={min} max={max} className="nm-input" value={settings[key]} onChange={(e) => set(key, Number(e.target.value))} />
    </label>
  );

  return (
    <div style={{ display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))' }}>
      <div style={{ gridColumn: '1 / -1' }}><WhatsAppConnect api={api} defaultPhone={settings.whatsapp_number || ''} /></div>
      <section className="nm-card" style={{ padding: '16px' }}>
        <h3 style={{ marginTop: 0 }}>Fila</h3>
        <label style={{ display: 'block', marginBottom: '12px' }}>
          <span style={labelText}>WhatsApp do restaurante (com DDD)</span>
          <input className="nm-input" type="tel" value={settings.whatsapp_number || ''} placeholder="(11) 99999-8888" onChange={(e) => set('whatsapp_number', e.target.value)} />
        </label>
        {num('default_minutes_per_party', 'Minutos por grupo (até ter histórico da noite)', 1, 60)}
        {num('hold_minutes', 'Tolerância depois de chamar (min)', 1, 60)}
        {num('near_threshold', 'Avisar "quase lá" quando faltarem N grupos', 0, 10)}
        <label style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '16px', minHeight: '44px' }}>
          <input type="checkbox" style={{ width: '20px', height: '20px', accentColor: 'var(--accent-primary)' }} checked={settings.notify_no_show} onChange={(e) => set('notify_no_show', e.target.checked)} />
          Mandar mensagem quando marcar "Não veio"
        </label>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', flexDirection: phone ? 'column' : 'row' }}>
          <button onClick={save} className="nm-btn nm-btn-primary" style={fullOnPhone}><Save size={16} /> Salvar</button>
          <button onClick={printQr} className="nm-btn nm-btn-muted" style={fullOnPhone}><Printer size={16} /> Imprimir QR da porta</button>
        </div>
        {msg && <p style={{ color: 'var(--text-secondary)' }}>{msg}</p>}
      </section>

      <section className="nm-card" style={{ padding: '16px' }}>
        <h3 style={{ marginTop: 0 }}>Mensagens do robô</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Variáveis: {'{nome} {posicao} {espera} {faltam} {tolerancia}'}. Apague o texto pra voltar ao padrão.</p>
        {Object.entries(MESSAGE_LABELS).map(([key, label]) => (
          <label key={key} style={{ display: 'block', marginBottom: '12px' }}>
            <span style={labelText}>{label}</span>
            <textarea rows={3} className="nm-input" style={{ resize: 'vertical' }} value={settings.messages[key] || ''}
              onChange={(e) => set('messages', { ...settings.messages, [key]: e.target.value })} />
          </label>
        ))}
        <button onClick={save} className="nm-btn nm-btn-primary" style={fullOnPhone}>Salvar mensagens</button>
      </section>
    </div>
  );
}
