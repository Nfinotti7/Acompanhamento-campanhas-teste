import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Radar, Copy, Check, Trash2, Send } from 'lucide-react';
import ResponsiveTable from '../components/ui/ResponsiveTable';
import { useBreakpoint } from '../responsive/useBreakpoint';
const EVENT_COLUMNS = [
  { key: 'event_name', label: 'Evento', render: (ev) => <>{ev.event_name}{ev.test_mode && <span style={{ marginLeft: 6, fontSize: '0.7rem', color: 'var(--accent-warning)' }}>teste</span>}</> },
  { key: 'contact', label: 'Contato', render: (ev) => ev.profile_name || ev.wa_id || '—' },
  { key: 'when', label: 'Quando', render: (ev) => new Date(ev.created_at).toLocaleString('pt-BR') },
  { key: 'value', label: 'Valor', render: (ev) => (ev.value != null ? brl(ev.value) : '—') },
  { key: 'status', label: 'Status', render: (ev) => {
    const status = STATUS_LABELS[ev.status] || STATUS_LABELS.pending;
    return <span style={{ color: status.color }}>{status.label}{ev.error && <div style={{ fontSize: '0.72rem', color: 'var(--accent-danger)' }}>{ev.error}</div>}</span>;
  } }
];

// Celular: links e disparos viram cartões (colunas dependem de ações do componente).
const linkColumns = ({ copyLink, deleteLink, copiedId, btn, linkUrl }) => [
  { key: 'name', label: 'Link', render: (link) => (
    <div>
      <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{link.name}</div>
      <div style={{ color: 'var(--accent-link)', fontSize: '0.78rem', fontWeight: 400, overflowWrap: 'anywhere' }}>{linkUrl(link)}</div>
    </div>
  ) },
  { key: 'origin', label: 'Origem padrão', render: (link) => [link.utm_source, link.utm_medium].filter(Boolean).join(' / ') || '—' },
  { key: 'clicks', label: 'Cliques', render: (link) => link.clicks },
  { key: 'conversations', label: 'Conversas', render: (link) => link.conversations },
  { key: 'actions', label: 'Ações', render: (link) => (
    <span style={{ display: 'inline-flex', gap: 6 }}>
      <button type="button" onClick={() => copyLink(link)} style={{ ...btn, padding: '6px 10px', background: 'var(--border-color)' }}>
        {copiedId === link.id ? 'Copiado' : 'Copiar'}
      </button>
      <button type="button" onClick={() => deleteLink(link)} aria-label="Apagar link" style={{ ...btn, padding: '6px 10px', background: 'color-mix(in srgb, var(--accent-danger) 12%, transparent)', color: 'var(--accent-danger)' }}>
        Apagar
      </button>
    </span>
  ) }
];

// Links Rastreáveis + Meta Conversions API + registro de disparos, por cliente.

const brl = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-color)',
  backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '0.88rem'
};
const labelStyle = { display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 };
const btn = {
  padding: '10px 16px', borderRadius: '8px', border: 'none', background: 'var(--accent-primary)', color: 'var(--on-accent)',
  fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: 6
};

function Card({ title, subtitle, children }) {
  return (
    <div className="glass-card" style={{ padding: '20px', marginBottom: '20px' }}>
      <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)' }}>{title}</h3>
      {subtitle && <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '4px 0 16px', lineHeight: 1.5 }}>{subtitle}</p>}
      {children}
    </div>
  );
}

function Field({ label, children, style }) {
  return (
    <label style={{ display: 'block', ...style }}>
      <span style={labelStyle}>{label}</span>
      {children}
    </label>
  );
}

const STATUS_LABELS = {
  sent: { label: 'Enviado', color: 'var(--accent-success)' },
  failed: { label: 'Falhou', color: 'var(--accent-danger)' },
  pending: { label: 'Enviando', color: 'var(--accent-warning)' }
};

const emptyLink = { name: '', phone: '', message: 'Olá! Gostaria de mais informações.', utm_source: '', utm_medium: '', utm_campaign: '' };

export default function TrackingLinksPage({ selectedClient }) {
  const [links, setLinks] = useState([]);
  const phone = useBreakpoint() === 'phone';
  const [form, setForm] = useState(emptyLink);
  const [linkError, setLinkError] = useState('');
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  const [capi, setCapi] = useState({ pixelId: '', testEventCode: '', enabled: false, hasMetaToken: true });
  const [capiMessage, setCapiMessage] = useState(null);
  const [savingCapi, setSavingCapi] = useState(false);

  const [events, setEvents] = useState([]);

  const params = { clientId: selectedClient };

  const fetchAll = async () => {
    try {
      const [linksRes, capiRes, eventsRes] = await Promise.all([
        axios.get('/api/tracking/links', { params }),
        axios.get('/api/tracking/capi', { params }),
        axios.get('/api/tracking/events', { params })
      ]);
      setLinks(linksRes.data.links);
      setForm((f) => ({ ...f, phone: f.phone || linksRes.data.defaultPhone || '' }));
      setCapi(capiRes.data);
      setEvents(eventsRes.data.events);
    } catch (err) {
      console.error('Error loading tracking page:', err);
    }
  };

  useEffect(() => {
    if (!selectedClient) return;
    setForm(emptyLink);
    setCapiMessage(null);
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClient]);

  const linkUrl = (link) => `${window.location.origin}/r/${link.slug}`;

  const copyLink = async (link) => {
    try {
      await navigator.clipboard.writeText(linkUrl(link));
      setCopiedId(link.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      window.prompt('Copie o link:', linkUrl(link));
    }
  };

  const createLink = async (e) => {
    e.preventDefault();
    setCreating(true);
    setLinkError('');
    try {
      await axios.post('/api/tracking/links', { ...form, clientId: selectedClient });
      setForm({ ...emptyLink, phone: form.phone });
      fetchAll();
    } catch (err) {
      setLinkError(err.response?.data?.error || 'Erro ao criar link.');
    } finally {
      setCreating(false);
    }
  };

  const deleteLink = async (link) => {
    if (!window.confirm(`Apagar o link "${link.name}"? Quem clicar nele depois vai ver "link não encontrado". As conversas que já vieram por ele continuam com a origem.`)) return;
    await axios.delete(`/api/tracking/links/${link.id}`, { params });
    fetchAll();
  };

  const saveCapi = async (e) => {
    e?.preventDefault();
    setSavingCapi(true);
    setCapiMessage(null);
    try {
      await axios.put('/api/tracking/capi', { ...capi, clientId: selectedClient });
      setCapiMessage({ ok: true, text: 'Configuração salva.' });
    } catch (err) {
      setCapiMessage({ ok: false, text: err.response?.data?.error || 'Erro ao salvar.' });
    } finally {
      setSavingCapi(false);
    }
  };

  const testCapi = async () => {
    setCapiMessage(null);
    try {
      await axios.put('/api/tracking/capi', { ...capi, clientId: selectedClient });
      const res = await axios.post('/api/tracking/capi/test', { clientId: selectedClient });
      setCapiMessage({ ok: true, text: res.data.message });
    } catch (err) {
      setCapiMessage({ ok: false, text: err.response?.data?.error || 'Erro ao enviar teste.' });
    }
  };

  if (!selectedClient) {
    return <p style={{ color: 'var(--text-muted)' }}>Selecione um cliente.</p>;
  }

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Radar size={28} color="var(--accent-primary)" />
          Links e Conversões
        </h1>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          Links rastreáveis pro WhatsApp e envio das conversões do funil pra Meta.
        </p>
      </div>

      <Card
        title="Links rastreáveis"
        subtitle="Use em anúncios do Google, bio do Instagram, site, QR code... O lead cai no WhatsApp com a mensagem pronta e um código curto no fim (ex: “cód. A7K2M”). Quando ele envia, a conversa fica ligada ao clique, com UTMs e origem."
      >
        <form onSubmit={createLink} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '16px' }}>
          <Field label="Nome do link *"><input style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Google - Rodízio" required /></Field>
          <Field label="WhatsApp de destino (DDI + DDD) *"><input style={inputStyle} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="5511999998888" required /></Field>
          <Field label="Mensagem pronta" style={{ gridColumn: '1 / -1' }}><input style={inputStyle} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></Field>
          <Field label="utm_source"><input style={inputStyle} value={form.utm_source} onChange={(e) => setForm({ ...form, utm_source: e.target.value })} placeholder="google, instagram, site..." /></Field>
          <Field label="utm_medium"><input style={inputStyle} value={form.utm_medium} onChange={(e) => setForm({ ...form, utm_medium: e.target.value })} placeholder="cpc, bio, qrcode..." /></Field>
          <Field label="utm_campaign"><input style={inputStyle} value={form.utm_campaign} onChange={(e) => setForm({ ...form, utm_campaign: e.target.value })} /></Field>
          <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 12 }}>
            <button type="submit" disabled={creating} style={btn}>{creating ? 'Criando...' : 'Criar link'}</button>
            {linkError && <span style={{ color: 'var(--accent-danger)', fontSize: '0.82rem' }}>{linkError}</span>}
          </div>
        </form>
        <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: 12 }}>
          UTMs, <code>gclid</code> e <code>fbclid</code> que vierem na URL do anúncio são gravados por cima dos padrões do link.
          No Google Ads, use o link como URL final (o gclid entra sozinho com a marcação automática).
        </p>

        {links.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Nenhum link ainda.</p>
        ) : (
<>{phone ? (
        <ResponsiveTable columns={linkColumns({ copyLink, deleteLink, copiedId, btn, linkUrl })} rows={links} rowKey={(link) => link.id} emptyText="Nenhum link ainda." />
      ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
              <thead>
                <tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}>
                  <th style={{ padding: '8px' }}>Link</th>
                  <th style={{ padding: '8px' }}>Origem padrão</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Cliques</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Conversas</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {links.map((link) => (
                  <tr key={link.id} style={{ borderTop: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '10px 8px' }}>
                      <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{link.name}</div>
                      <div style={{ color: 'var(--accent-link)', fontSize: '0.78rem' }}>{linkUrl(link)}</div>
                    </td>
                    <td style={{ padding: '10px 8px', color: 'var(--text-secondary)' }}>{[link.utm_source, link.utm_medium].filter(Boolean).join(' / ') || '—'}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'right', color: 'var(--text-primary)' }}>{link.clicks}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'right', color: 'var(--text-primary)' }}>{link.conversations}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button type="button" onClick={() => copyLink(link)} title="Copiar link" style={{ ...btn, padding: '6px 10px', background: 'var(--border-color)' }}>
                        {copiedId === link.id ? <Check size={14} /> : <Copy size={14} />} {copiedId === link.id ? 'Copiado' : 'Copiar'}
                      </button>
                      <button type="button" onClick={() => deleteLink(link)} title="Apagar link" style={{ ...btn, padding: '6px 8px', marginLeft: 6, background: 'color-mix(in srgb, var(--accent-danger) 12%, transparent)', color: 'var(--accent-danger)' }}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
      )}</>
        )}
      </Card>

      <Card
        title="Meta Conversions API"
        subtitle="Envia pra Meta as conversões das conversas de WhatsApp, pra otimizar as campanhas e medir resultado. Qual evento cada etapa envia se escolhe no Funil → Configurar funil. Purchase é enviada a cada venda lançada, com o valor."
      >
        {!capi.hasMetaToken && (
          <p style={{ color: 'var(--accent-warning)', fontSize: '0.82rem', marginBottom: 12 }}>
            Este cliente não tem token da Meta em "Chaves e APIs". Sem ele nenhum evento é enviado.
          </p>
        )}
        <form onSubmit={saveCapi} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', alignItems: 'end' }}>
          <Field label="ID do Pixel / conjunto de dados"><input style={inputStyle} value={capi.pixelId} onChange={(e) => setCapi({ ...capi, pixelId: e.target.value })} placeholder="Ex: 1234567890123456" /></Field>
          <Field label="Código de teste (opcional)"><input style={inputStyle} value={capi.testEventCode} onChange={(e) => setCapi({ ...capi, testEventCode: e.target.value })} placeholder="TEST12345" /></Field>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-primary)', fontSize: '0.88rem', paddingBottom: 10 }}>
            <input type="checkbox" checked={capi.enabled} onChange={(e) => setCapi({ ...capi, enabled: e.target.checked })} />
            Envio ativo
          </label>
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="submit" disabled={savingCapi} style={btn}>{savingCapi ? 'Salvando...' : 'Salvar'}</button>
            <button type="button" onClick={testCapi} style={{ ...btn, background: 'var(--border-color)' }}><Send size={14} /> Enviar evento de teste</button>
            {capiMessage && <span style={{ color: capiMessage.ok ? 'var(--accent-success)' : 'var(--accent-danger)', fontSize: '0.82rem' }}>{capiMessage.text}</span>}
          </div>
        </form>
        <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 12, lineHeight: 1.5 }}>
          Com o código de teste preenchido, todos os eventos vão pra aba "Eventos de teste" do Gerenciador de Eventos e não contam nas campanhas.
          Apague o código quando estiver tudo certo. Cada evento de etapa é enviado uma vez só por contato.
        </p>
      </Card>

      <Card title="Disparos" subtitle="Os últimos 100 eventos enviados pra Meta.">
        {events.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Nenhum evento enviado ainda.</p>
        ) : (
<>{phone ? (
        <ResponsiveTable columns={EVENT_COLUMNS} rows={events} rowKey={(ev) => ev.id} emptyText="Nenhum evento enviado ainda." />
      ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}>
                  <th style={{ padding: '8px' }}>Quando</th>
                  <th style={{ padding: '8px' }}>Contato</th>
                  <th style={{ padding: '8px' }}>Evento</th>
                  <th style={{ padding: '8px' }}>Valor</th>
                  <th style={{ padding: '8px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {events.map((ev) => {
                  const status = STATUS_LABELS[ev.status] || STATUS_LABELS.pending;
                  return (
                    <tr key={ev.id} style={{ borderTop: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '8px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{new Date(ev.created_at).toLocaleString('pt-BR')}</td>
                      <td style={{ padding: '8px', color: 'var(--text-primary)' }}>{ev.profile_name || ev.wa_id || '—'}</td>
                      <td style={{ padding: '8px', color: 'var(--text-primary)' }}>
                        {ev.event_name}
                        {ev.test_mode && <span style={{ marginLeft: 6, fontSize: '0.7rem', color: 'var(--accent-warning)' }}>teste</span>}
                      </td>
                      <td style={{ padding: '8px', color: 'var(--text-primary)' }}>{ev.value != null ? brl(ev.value) : '—'}</td>
                      <td style={{ padding: '8px', color: status.color }} title={ev.error || ''}>
                        {status.label}{ev.error && <div style={{ fontSize: '0.72rem', color: 'var(--accent-danger)' }}>{ev.error}</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
      )}</>
        )}
      </Card>
    </div>
  );
}
