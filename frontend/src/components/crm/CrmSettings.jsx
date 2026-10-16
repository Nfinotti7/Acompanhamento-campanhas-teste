import React, { useState } from 'react';
import { ArrowUp, ArrowDown, Trash2, Plus } from 'lucide-react';

// Configuração do funil de um cliente: etapas (nome, cor, ordem, evento automático),
// tags e equipe. Cada mudança é salva na hora e recarrega a configuração (onChanged).

const AUTO_EVENT_LABELS = {
  novo_lead: 'Lead novo entra aqui',
  agendado: 'Agendamento move pra cá',
  venda: 'Venda lançada move pra cá'
};

// Purchase não aparece: é enviada a cada venda lançada, com o valor dela.
const META_EVENTS = ['Lead', 'Contact', 'Schedule', 'CompleteRegistration', 'SubmitApplication'];

const inputStyle = {
  padding: '7px 9px', borderRadius: '6px', border: '1px solid var(--border-color)',
  backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '0.82rem'
};
const iconBtn = {
  padding: '6px', borderRadius: '6px', border: 'none', background: 'var(--border-color)',
  color: 'var(--text-primary)', cursor: 'pointer', display: 'inline-flex'
};
const sectionTitle = { fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)', margin: '18px 0 10px' };

function NameInput({ value, onSave, style }) {
  const [draft, setDraft] = useState(value);
  React.useEffect(() => setDraft(value), [value]);
  const commit = () => {
    const name = draft.trim();
    if (name && name !== value) onSave(name);
    else setDraft(value);
  };
  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      maxLength={60}
      style={{ ...inputStyle, ...style }}
    />
  );
}

function AddRow({ placeholder, onAdd, withColor }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#0097B2'); // cor-fixa-ok: vai pro banco, o backend exige hex
  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    await onAdd(withColor ? { name: name.trim(), color } : { name: name.trim() });
    setName('');
  };
  return (
    <form onSubmit={submit} style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
      {withColor && <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: 34, height: 32, border: 'none', background: 'none', padding: 0 }} />}
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder={placeholder} maxLength={60} style={{ ...inputStyle, flex: 1 }} />
      <button type="submit" style={{ ...iconBtn, background: 'var(--accent-primary)', color: 'var(--on-accent)', padding: '6px 10px', gap: '4px', alignItems: 'center', fontSize: '0.78rem', fontWeight: 700 }}>
        <Plus size={14} /> Adicionar
      </button>
    </form>
  );
}

export default function CrmSettings({ apiClient, clientId, config, onChanged }) {
  const [error, setError] = useState('');
  const params = clientId ? { clientId } : {};
  const body = (data) => (clientId ? { ...data, clientId } : data);

  const run = async (fn) => {
    setError('');
    try {
      await fn();
      await onChanged();
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao salvar.');
    }
  };

  const stages = config.stages;
  const moveStage = (index, delta) => run(async () => {
    const ids = stages.map((s) => s.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + delta, 0, moved);
    await apiClient.put('/api/crm/stages/order', body({ ids }));
  });
  const deleteStage = (stage) => {
    if (!window.confirm(`Apagar a etapa "${stage.name}"? Os cards dela vão pra primeira etapa.`)) return;
    run(() => apiClient.delete(`/api/crm/stages/${stage.id}`, { params }));
  };

  return (
    <div>
      <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>Configurar funil</h2>
      {error && <p style={{ color: 'var(--accent-danger)', fontSize: '0.82rem', marginTop: '8px' }}>{error}</p>}

      <h3 style={sectionTitle}>Etapas</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {stages.map((stage, index) => (
          <div key={stage.id} style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="color"
              value={stage.color}
              onChange={(e) => run(() => apiClient.patch(`/api/crm/stages/${stage.id}`, body({ color: e.target.value })))}
              style={{ width: 34, height: 32, border: 'none', background: 'none', padding: 0 }}
            />
            <NameInput value={stage.name} onSave={(name) => run(() => apiClient.patch(`/api/crm/stages/${stage.id}`, body({ name })))} style={{ flex: 1, minWidth: 140 }} />
            <select
              value={stage.auto_event || ''}
              onChange={(e) => run(() => apiClient.patch(`/api/crm/stages/${stage.id}`, body({ autoEvent: e.target.value || null })))}
              title="Evento que move o card pra esta etapa sozinho"
              style={{ ...inputStyle, maxWidth: 200 }}
            >
              <option value="">Só manual</option>
              {Object.entries(AUTO_EVENT_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
            <select
              value={stage.meta_event || ''}
              onChange={(e) => run(() => apiClient.patch(`/api/crm/stages/${stage.id}`, body({ metaEvent: e.target.value || null })))}
              title="Evento enviado pra Meta (Conversions API) quando o card entra nesta etapa"
              style={{ ...inputStyle, maxWidth: 150 }}
            >
              <option value="">Sem evento Meta</option>
              {META_EVENTS.map((ev) => <option key={ev} value={ev}>Meta: {ev}</option>)}
            </select>
            <button type="button" disabled={index === 0} onClick={() => moveStage(index, -1)} style={{ ...iconBtn, opacity: index === 0 ? 0.3 : 1 }} title="Mover pra antes no funil"><ArrowUp size={14} /></button>
            <button type="button" disabled={index === stages.length - 1} onClick={() => moveStage(index, 1)} style={{ ...iconBtn, opacity: index === stages.length - 1 ? 0.3 : 1 }} title="Mover pra depois no funil"><ArrowDown size={14} /></button>
            <button type="button" onClick={() => deleteStage(stage)} style={{ ...iconBtn, color: 'var(--accent-danger)', background: 'color-mix(in srgb, var(--accent-danger) 10%, transparent)' }} title="Apagar etapa"><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
      <AddRow placeholder="Nova etapa" withColor onAdd={(data) => run(() => apiClient.post('/api/crm/stages', body(data)))} />
      <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '6px' }}>
        Mensagem comum não move card. Só lead novo, agendamento e venda movem sozinhos, pra etapa ligada a cada um.
        O evento Meta é enviado uma vez por contato quando o card entra na etapa (se a Conversions API estiver ativa
        em "Links e Conversões"). Purchase vai sozinha a cada venda lançada.
      </p>

      <h3 style={sectionTitle}>Tags</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {config.tags.length === 0 && <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Nenhuma tag ainda.</p>}
        {config.tags.map((tag) => (
          <div key={tag.id} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <input type="color" value={tag.color} onChange={(e) => run(() => apiClient.patch(`/api/crm/tags/${tag.id}`, body({ color: e.target.value })))} style={{ width: 34, height: 32, border: 'none', background: 'none', padding: 0 }} />
            <NameInput value={tag.name} onSave={(name) => run(() => apiClient.patch(`/api/crm/tags/${tag.id}`, body({ name })))} style={{ flex: 1 }} />
            <button type="button" onClick={() => window.confirm(`Apagar a tag "${tag.name}"?`) && run(() => apiClient.delete(`/api/crm/tags/${tag.id}`, { params }))} style={{ ...iconBtn, color: 'var(--accent-danger)', background: 'color-mix(in srgb, var(--accent-danger) 10%, transparent)' }}><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
      <AddRow placeholder="Nova tag (ex: VIP, Aniversário)" withColor onAdd={(data) => run(() => apiClient.post('/api/crm/tags', body(data)))} />

      <h3 style={sectionTitle}>Equipe (responsáveis)</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {config.team.length === 0 && <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Ninguém cadastrado ainda.</p>}
        {config.team.map((member) => (
          <div key={member.id} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <NameInput value={member.name} onSave={(name) => run(() => apiClient.patch(`/api/crm/team/${member.id}`, body({ name })))} style={{ flex: 1 }} />
            <button type="button" onClick={() => window.confirm(`Remover "${member.name}" da equipe? Os leads dele ficam sem responsável.`) && run(() => apiClient.delete(`/api/crm/team/${member.id}`, { params }))} style={{ ...iconBtn, color: 'var(--accent-danger)', background: 'color-mix(in srgb, var(--accent-danger) 10%, transparent)' }}><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
      <AddRow placeholder="Nome de quem atende" onAdd={(data) => run(() => apiClient.post('/api/crm/team', body(data)))} />
    </div>
  );
}
