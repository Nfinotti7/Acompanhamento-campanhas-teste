import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { brl, TagChip } from './crmUi';

// Dados de negócio do contato no topo do painel: etapa, valor, responsável e tags.
// Cada mudança salva na hora.

const selectStyle = {
  padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)',
  backgroundColor: '#131b2e', color: '#fff', fontSize: '0.76rem'
};
const labelStyle = { fontSize: '0.66rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700, marginBottom: '3px' };

export default function DealBar({ apiClient, clientId, contactId, version, onChanged }) {
  const [crm, setCrm] = useState(null);
  const [valueDraft, setValueDraft] = useState('');
  const params = clientId ? { clientId } : {};

  const fetchCrm = async () => {
    try {
      const res = await apiClient.get(`/api/whatsapp/contacts/${contactId}/crm`, { params });
      setCrm(res.data);
      setValueDraft(res.data.dealValue == null ? '' : String(res.data.dealValue));
    } catch (err) {
      console.error('Error fetching deal:', err);
    }
  };

  useEffect(() => {
    setCrm(null);
    fetchCrm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId, version]);

  const save = async (patch) => {
    const previous = crm;
    setCrm((c) => ({ ...c, ...patch }));
    try {
      await apiClient.patch(`/api/whatsapp/contacts/${contactId}/crm`, clientId ? { ...patch, clientId } : patch);
      if (onChanged) onChanged();
    } catch (err) {
      setCrm(previous);
      alert(err.response?.data?.error || 'Erro ao salvar.');
    }
  };

  if (!crm) return <div style={{ height: 52, marginBottom: '12px' }} />;

  const saveValue = () => {
    const parsed = valueDraft.trim() === '' ? null : Number(valueDraft.replace(',', '.'));
    if (parsed !== null && (Number.isNaN(parsed) || parsed < 0)) {
      setValueDraft(crm.dealValue == null ? '' : String(crm.dealValue));
      return;
    }
    if (parsed !== crm.dealValue) save({ dealValue: parsed });
  };

  const stage = crm.stages.find((s) => s.id === crm.stageId);
  const tagsById = Object.fromEntries(crm.tags.map((t) => [t.id, t]));
  const availableTags = crm.tags.filter((t) => !crm.tagIds.includes(t.id));

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end', marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
      <div>
        <div style={labelStyle}>Etapa</div>
        <select
          value={crm.stageId ?? ''}
          onChange={(e) => save({ stageId: Number(e.target.value) })}
          style={{ ...selectStyle, borderLeft: `4px solid ${stage?.color || '#6366f1'}` }}
        >
          {crm.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      <div>
        <div style={labelStyle}>{crm.salesTotal > 0 ? `Vendas: ${brl(crm.salesTotal)}` : 'Valor estimado'}</div>
        <input
          value={valueDraft}
          onChange={(e) => setValueDraft(e.target.value)}
          onBlur={saveValue}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          placeholder="R$ 0,00"
          inputMode="decimal"
          title={crm.salesTotal > 0 ? 'Com venda lançada, o card mostra o total das vendas' : 'Valor esperado do negócio'}
          style={{ ...selectStyle, width: 100 }}
        />
      </div>

      <div>
        <div style={labelStyle}>Responsável</div>
        <select
          value={crm.responsibleId ?? ''}
          onChange={(e) => save({ responsibleId: e.target.value ? Number(e.target.value) : null })}
          style={selectStyle}
        >
          <option value="">Ninguém</option>
          {crm.team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>

      <div style={{ flex: '1 1 160px' }}>
        <div style={labelStyle}>Tags</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
          {crm.tagIds.map((id) => tagsById[id] && (
            <button
              key={id}
              type="button"
              onClick={() => save({ tagIds: crm.tagIds.filter((t) => t !== id) })}
              title="Remover tag"
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
            >
              <TagChip tag={tagsById[id]} />
              <X size={11} color="#94a3b8" />
            </button>
          ))}
          {availableTags.length > 0 && (
            <select
              value=""
              onChange={(e) => e.target.value && save({ tagIds: [...crm.tagIds, Number(e.target.value)] })}
              style={{ ...selectStyle, padding: '3px 6px' }}
            >
              <option value="">+ tag</option>
              {availableTags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
          {crm.tags.length === 0 && <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Crie tags em "Configurar funil"</span>}
        </div>
      </div>
    </div>
  );
}
