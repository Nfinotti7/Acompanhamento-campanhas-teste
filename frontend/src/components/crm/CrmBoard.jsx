import React, { useState, useEffect } from 'react';
import { Settings2, User } from 'lucide-react';
import Modal from '../Modal';
import ContactDetailPanel from '../ContactDetailPanel';
import { Avatar } from '../whatsappMedia';
import CrmSettings from './CrmSettings';
import { brl, TagChip } from './crmUi';

// Funil estilo Kommo, usado no painel admin (axios + clientId) e no /caixa (caixaApi,
// cliente fixo no token). Arrastar um card muda a etapa na hora.


function formatAppointment(iso) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const filterStyle = {
  padding: '8px 10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)',
  backgroundColor: '#131b2e', color: '#fff', fontSize: '0.82rem'
};


export default function CrmBoard({ apiClient, clientId, lastEvent }) {
  const [stages, setStages] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [config, setConfig] = useState({ stages: [], tags: [], team: [] });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [responsibleFilter, setResponsibleFilter] = useState('');
  const [openContact, setOpenContact] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [dragOverStage, setDragOverStage] = useState(null);

  const params = clientId ? { clientId } : {};

  const fetchAll = async ({ quiet } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const [kanbanRes, configRes] = await Promise.all([
        apiClient.get('/api/whatsapp/kanban', { params }),
        apiClient.get('/api/crm/config', { params })
      ]);
      setStages(kanbanRes.data.stages || []);
      setContacts(kanbanRes.data.contacts || []);
      setConfig(configRes.data);
    } catch (err) {
      console.error('Error fetching CRM board:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  useEffect(() => {
    if (lastEvent) fetchAll({ quiet: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEvent]);

  const tagsById = Object.fromEntries(config.tags.map((t) => [t.id, t]));

  const visible = contacts.filter((c) => {
    if (search) {
      const q = search.toLowerCase();
      if (!(c.profile_name || '').toLowerCase().includes(q) && !(c.wa_id || '').includes(q)) return false;
    }
    if (tagFilter && !c.tag_ids.includes(Number(tagFilter))) return false;
    if (responsibleFilter === 'none' && c.responsible_id) return false;
    if (responsibleFilter && responsibleFilter !== 'none' && c.responsible_id !== Number(responsibleFilter)) return false;
    return true;
  });

  const moveCard = async (contactId, stageId) => {
    const previous = contacts;
    const card = contacts.find((c) => c.id === contactId);
    if (!card || card.stage_id === stageId) return;
    setContacts((prev) => prev.map((c) => (c.id === contactId ? { ...c, stage_id: stageId } : c)));
    try {
      await apiClient.patch(`/api/whatsapp/contacts/${contactId}/crm`, clientId ? { stageId, clientId } : { stageId });
    } catch (err) {
      setContacts(previous);
      alert(err.response?.data?.error || 'Erro ao mover o card.');
    }
  };

  if (loading) return <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Carregando...</p>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px', flexShrink: 0 }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar nome ou telefone" style={{ ...filterStyle, flex: '1 1 200px', maxWidth: 280 }} />
        <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} style={filterStyle}>
          <option value="">Todas as tags</option>
          {config.tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select value={responsibleFilter} onChange={(e) => setResponsibleFilter(e.target.value)} style={filterStyle}>
          <option value="">Todos os responsáveis</option>
          <option value="none">Sem responsável</option>
          {config.team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <button type="button" onClick={() => setShowSettings(true)} style={{ ...filterStyle, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
          <Settings2 size={15} /> Configurar funil
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '6px' }}>
        {stages.map((stage) => {
          const stageCards = visible.filter((c) => c.stage_id === stage.id);
          const total = stageCards.reduce((sum, c) => sum + Number(c.value || 0), 0);
          const isOver = dragOverStage === stage.id;
          return (
            <div
              key={stage.id}
              onDragOver={(e) => { e.preventDefault(); setDragOverStage(stage.id); }}
              onDragLeave={() => setDragOverStage((s) => (s === stage.id ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverStage(null);
                moveCard(Number(e.dataTransfer.getData('text/plain')), stage.id);
              }}
              style={{
                flex: '0 0 260px', display: 'flex', flexDirection: 'column', minHeight: 0,
                backgroundColor: isOver ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.02)',
                // Bordas em propriedades separadas: misturar border e borderTop faz o React
                // perder a cor do topo ao re-renderizar (realce do arrastar).
                borderStyle: 'solid', borderWidth: '3px 1px 1px 1px',
                borderColor: `${stage.color} ${isOver ? '#6366f1' : 'rgba(255,255,255,0.06)'} ${isOver ? '#6366f1' : 'rgba(255,255,255,0.06)'} ${isOver ? '#6366f1' : 'rgba(255,255,255,0.06)'}`,
                borderRadius: '10px', padding: '10px'
              }}
            >
              <div style={{ marginBottom: '10px', flexShrink: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, color: '#fff', fontSize: '0.84rem', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stage.name}</span>
                  <span style={{ color: '#64748b' }}>{stageCards.length}</span>
                </div>
                <div style={{ fontSize: '0.76rem', color: total > 0 ? '#34d399' : '#64748b', marginTop: '2px' }}>{brl(total)}</div>
              </div>
              <div style={{ flex: 1, minHeight: 60, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {stageCards.map((c) => (
                  <div
                    key={c.id}
                    draggable
                    onDragStart={(e) => { e.dataTransfer.setData('text/plain', String(c.id)); e.dataTransfer.effectAllowed = 'move'; }}
                    onClick={() => setOpenContact(c)}
                    style={{ backgroundColor: '#131b2e', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '10px', fontSize: '0.8rem', cursor: 'grab' }}
                  >
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <Avatar apiClient={apiClient} clientId={clientId} mediaId={c.profile_pic_media_id} name={c.profile_name || c.wa_id} size={28} />
                      <div style={{ flex: 1, minWidth: 0, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.profile_name || c.wa_id}
                      </div>
                      {c.value > 0 && <span style={{ color: '#34d399', fontWeight: 700, fontSize: '0.76rem', flexShrink: 0 }}>{brl(c.value)}</span>}
                    </div>
                    {c.tag_ids.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
                        {c.tag_ids.map((id) => tagsById[id] && <TagChip key={id} tag={tagsById[id]} small />)}
                      </div>
                    )}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px', fontSize: '0.72rem', color: '#94a3b8' }}>
                      {c.source === 'ad' && <span>📢 Anúncio</span>}
                      {c.appointment_at && <span style={{ color: '#c084fc' }}>📅 {formatAppointment(c.appointment_at)}</span>}
                      {c.responsible_name && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}><User size={11} /> {c.responsible_name}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {openContact && (
        <Modal onClose={() => setOpenContact(null)} maxWidth="640px">
          <div style={{ height: '72vh' }}>
            <ContactDetailPanel
              apiClient={apiClient}
              clientId={clientId}
              contact={openContact}
              onClose={() => setOpenContact(null)}
              onUpdated={() => fetchAll({ quiet: true })}
              onDeleted={() => { setOpenContact(null); fetchAll({ quiet: true }); }}
            />
          </div>
        </Modal>
      )}

      {showSettings && (
        <Modal onClose={() => setShowSettings(false)} maxWidth="640px">
          <CrmSettings apiClient={apiClient} clientId={clientId} config={config} onChanged={() => fetchAll({ quiet: true })} />
        </Modal>
      )}
    </div>
  );
}
