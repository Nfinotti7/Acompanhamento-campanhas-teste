import React, { useState, useEffect, useRef } from 'react';
import { Send, DollarSign, CalendarPlus, ArrowLeft, CheckCircle2, X, Pencil, Trash2, Check } from 'lucide-react';
import { Avatar, MessageMedia, ImageLightbox, isPlaceholderBody } from './whatsappMedia';

const STAGES = [
  { key: 'novo_lead', label: 'Novo Lead' },
  { key: 'em_atendimento', label: 'Em Atendimento' },
  { key: 'agendado', label: 'Agendado' },
  { key: 'nao_compareceu', label: 'Não Compareceu' },
  { key: 'compareceu', label: 'Compareceu' },
  { key: 'remarketing', label: 'Remarketing' }
];

const fieldStyle = {
  width: '100%',
  padding: '12px',
  borderRadius: '8px',
  border: '1px solid rgba(255,255,255,0.1)',
  backgroundColor: '#131b2e',
  color: '#fff',
  marginBottom: '10px',
  fontSize: '0.95rem'
};

const primaryBtn = {
  padding: '12px',
  borderRadius: '8px',
  border: 'none',
  color: '#fff',
  fontWeight: 700,
  cursor: 'pointer',
  width: '100%'
};

function formatEventDate(iso) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function ContactDetailPanel({ apiClient, clientId, contact, onClose, onUpdated, onDeleted, liveUpdateSignal }) {
  const [section, setSection] = useState('conversa');
  const [lightboxSrc, setLightboxSrc] = useState(null);
  const messagesEndRef = useRef(null);
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);

  const [timeline, setTimeline] = useState([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  const [notes, setNotes] = useState(contact.notes || '');
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);

  const [currentStage, setCurrentStage] = useState(contact.stage || '');
  const [savingStage, setSavingStage] = useState(false);

  const [actionMode, setActionMode] = useState(null); // null | 'sale' | 'appointment' | 'success'
  const [customerName, setCustomerName] = useState(contact.profile_name || '');
  const [phone, setPhone] = useState(contact.wa_id || '');
  const [amountSpent, setAmountSpent] = useState('');
  const [appointmentDate, setAppointmentDate] = useState('');
  const [appointmentTime, setAppointmentTime] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [editingSaleId, setEditingSaleId] = useState(null);
  const [editAmountValue, setEditAmountValue] = useState('');
  const [savingSaleEdit, setSavingSaleEdit] = useState(false);
  const [deletingContact, setDeletingContact] = useState(false);

  useEffect(() => {
    setSection('conversa');
    setActionMode(null);
    setCurrentStage(contact.stage || '');
    setCustomerName(contact.profile_name || '');
    setPhone(contact.wa_id || '');
    setNotes(contact.notes || '');
    setNotesSaved(false);
    fetchMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  useEffect(() => {
    if (liveUpdateSignal == null) return;
    fetchMessages();
    if (section === 'historico') fetchTimeline();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveUpdateSignal]);

  useEffect(() => {
    if (section === 'historico') fetchTimeline();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, contact.id]);

  const fetchMessages = async () => {
    setLoadingMessages(true);
    try {
      const res = await apiClient.get(`/api/whatsapp/conversations/${contact.id}/messages`, { params: clientId ? { clientId } : {} });
      setMessages(res.data.messages || []);
    } catch (err) {
      console.error('Error fetching messages:', err);
    } finally {
      setLoadingMessages(false);
    }
  };

  const fetchTimeline = async () => {
    setLoadingTimeline(true);
    try {
      const res = await apiClient.get(`/api/whatsapp/contacts/${contact.id}/timeline`, { params: clientId ? { clientId } : {} });
      setTimeline(res.data.events || []);
    } catch (err) {
      console.error('Error fetching timeline:', err);
    } finally {
      setLoadingTimeline(false);
    }
  };

  const handleSendReply = async (e) => {
    e.preventDefault();
    if (!replyText.trim()) return;
    setSending(true);
    try {
      await apiClient.post(`/api/whatsapp/conversations/${contact.id}/reply`, { body: replyText, clientId });
      setReplyText('');
      fetchMessages();
      if (onUpdated) onUpdated();
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao enviar mensagem.');
    } finally {
      setSending(false);
    }
  };

  const handleStageChange = async (e) => {
    const newStage = e.target.value;
    setSavingStage(true);
    try {
      await apiClient.patch(`/api/whatsapp/contacts/${contact.id}/stage`, { stage: newStage || null, clientId });
      setCurrentStage(newStage);
      if (onUpdated) onUpdated();
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao mover etapa.');
    } finally {
      setSavingStage(false);
    }
  };

  const handleSaveNotes = async () => {
    setNotesSaving(true);
    setNotesSaved(false);
    try {
      await apiClient.patch(`/api/whatsapp/contacts/${contact.id}/notes`, { notes, clientId });
      setNotesSaved(true);
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao salvar anotação.');
    } finally {
      setNotesSaving(false);
    }
  };

  const handleConfirmSale = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await apiClient.post('/api/whatsapp/conversions', {
        contactId: contact.id,
        customerName,
        phone,
        amountSpent: Number(amountSpent),
        matchedBy: 'phone',
        clientId
      });
      setActionMode('success');
      if (onUpdated) onUpdated();
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao lançar conversão.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmAppointment = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const appointmentAt = new Date(`${appointmentDate}T${appointmentTime}`).toISOString();
      await apiClient.post(`/api/whatsapp/contacts/${contact.id}/appointment`, { appointmentAt, clientId });
      setActionMode('success');
      if (onUpdated) onUpdated();
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao marcar agendamento.');
    } finally {
      setSubmitting(false);
    }
  };

  const startEditSale = (sale) => {
    setEditingSaleId(sale.id);
    setEditAmountValue(String(sale.amountSpent));
  };

  const cancelEditSale = () => {
    setEditingSaleId(null);
    setEditAmountValue('');
  };

  const saveEditSale = async (saleId) => {
    setSavingSaleEdit(true);
    try {
      await apiClient.patch(`/api/whatsapp/conversions/${saleId}`, { amountSpent: Number(editAmountValue), clientId });
      setEditingSaleId(null);
      setEditAmountValue('');
      fetchTimeline();
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao atualizar o valor da venda.');
    } finally {
      setSavingSaleEdit(false);
    }
  };

  const deleteSale = async (saleId) => {
    if (!window.confirm('Remover essa venda? Essa ação não pode ser desfeita.')) return;
    try {
      await apiClient.delete(`/api/whatsapp/conversions/${saleId}`, { params: clientId ? { clientId } : {} });
      fetchTimeline();
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao remover venda.');
    }
  };

  const handleDeleteContact = async () => {
    const confirmed = window.confirm(
      `Apagar o contato "${contact.profile_name || contact.wa_id}"? Isso remove a conversa, o histórico e as vendas desse lead. Essa ação não pode ser desfeita.`
    );
    if (!confirmed) return;

    setDeletingContact(true);
    try {
      await apiClient.delete(`/api/whatsapp/contacts/${contact.id}`, { params: clientId ? { clientId } : {} });
      if (onDeleted) onDeleted();
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao apagar contato.');
      setDeletingContact(false);
    }
  };

  const backFromAction = () => {
    setActionMode(null);
    setAmountSpent('');
    setAppointmentDate('');
    setAppointmentTime('');
    setError('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
        <Avatar apiClient={apiClient} clientId={clientId} mediaId={contact.profile_pic_media_id} name={contact.profile_name || contact.wa_id} size={44} />
        <div>
          <div style={{ fontWeight: 700, color: '#fff', fontSize: '1rem' }}>{contact.profile_name || contact.wa_id}</div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '8px' }}>{contact.wa_id}</div>
          <select
            value={currentStage || ''}
            onChange={handleStageChange}
            disabled={savingStage}
            style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', backgroundColor: '#131b2e', color: '#fff', fontSize: '0.75rem' }}
          >
            <option value="">Automático (calculado)</option>
            {STAGES.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </div>
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
          <button type="button" onClick={() => setActionMode('sale')} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '8px 10px', borderRadius: '8px', border: 'none', background: '#10b981', color: '#fff', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
            <DollarSign size={14} /> Venda
          </button>
          <button type="button" onClick={() => setActionMode('appointment')} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '8px 10px', borderRadius: '8px', border: 'none', background: '#6366f1', color: '#fff', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
            <CalendarPlus size={14} /> Agendar
          </button>
          <button
            type="button"
            onClick={handleDeleteContact}
            disabled={deletingContact}
            title="Apagar contato"
            style={{ padding: '8px', borderRadius: '8px', border: 'none', background: 'rgba(248,113,113,0.12)', color: '#f87171', cursor: 'pointer' }}
          >
            <Trash2 size={14} />
          </button>
          {onClose && (
            <button type="button" onClick={onClose} style={{ padding: '8px', borderRadius: '8px', border: 'none', background: 'rgba(255,255,255,0.08)', color: '#fff', cursor: 'pointer' }}>
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {actionMode === 'success' ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '14px' }}>
          <CheckCircle2 size={48} color="#10b981" />
          <p style={{ fontWeight: 700, fontSize: '1.1rem' }}>Feito!</p>
          <button onClick={backFromAction} style={{ ...primaryBtn, maxWidth: '200px', background: '#6366f1' }}>Voltar</button>
        </div>
      ) : actionMode === 'sale' ? (
        <form onSubmit={handleConfirmSale} style={{ maxWidth: '360px' }}>
          <button type="button" onClick={backFromAction} style={{ background: 'none', border: 'none', color: '#94a3b8', marginBottom: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <ArrowLeft size={16} /> Voltar
          </button>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: '14px' }}>Lançar venda</h3>
          <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Nome do cliente" required style={fieldStyle} />
          <input type="number" step="0.01" value={amountSpent} onChange={(e) => setAmountSpent(e.target.value)} placeholder="Valor gasto (R$)" required autoFocus style={fieldStyle} />
          {error && <p style={{ color: '#f87171', marginBottom: '10px', fontSize: '0.85rem' }}>{error}</p>}
          <button type="submit" disabled={submitting} style={{ ...primaryBtn, background: 'linear-gradient(135deg, #10b981, #059669)' }}>
            {submitting ? 'Salvando...' : 'Lançar venda'}
          </button>
        </form>
      ) : actionMode === 'appointment' ? (
        <form onSubmit={handleConfirmAppointment} style={{ maxWidth: '360px' }}>
          <button type="button" onClick={backFromAction} style={{ background: 'none', border: 'none', color: '#94a3b8', marginBottom: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <ArrowLeft size={16} /> Voltar
          </button>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: '6px' }}>Marcar agendamento</h3>
          <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '14px' }}>{customerName}</p>
          <input type="date" value={appointmentDate} onChange={(e) => setAppointmentDate(e.target.value)} required autoFocus style={fieldStyle} />
          <input type="time" value={appointmentTime} onChange={(e) => setAppointmentTime(e.target.value)} required style={fieldStyle} />
          {error && <p style={{ color: '#f87171', marginBottom: '10px', fontSize: '0.85rem' }}>{error}</p>}
          <button type="submit" disabled={submitting} style={{ ...primaryBtn, background: 'linear-gradient(135deg, #6366f1, #4f46e5)' }}>
            {submitting ? 'Salvando...' : 'Confirmar agendamento'}
          </button>
        </form>
      ) : (
        <>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
            {[['conversa', 'Conversa'], ['historico', 'Histórico'], ['anotacoes', 'Anotações']].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setSection(key)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  backgroundColor: section === key ? '#6366f1' : 'rgba(255,255,255,0.05)',
                  color: section === key ? '#fff' : '#94a3b8'
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {section === 'conversa' && (
            <>
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px' }}>
                {loadingMessages ? (
                  <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Carregando...</p>
                ) : messages.length === 0 ? (
                  <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Nenhuma mensagem ainda.</p>
                ) : (
                  messages.map((m) => (
                    <div
                      key={m.id}
                      style={{
                        alignSelf: m.direction === 'outbound' ? 'flex-end' : 'flex-start',
                        backgroundColor: m.direction === 'outbound' ? '#6366f1' : '#1e293b',
                        color: '#fff',
                        padding: m.media_id ? '6px' : '8px 12px',
                        borderRadius: '10px',
                        maxWidth: '75%',
                        fontSize: '0.85rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px'
                      }}
                    >
                      <MessageMedia message={m} apiClient={apiClient} clientId={clientId} onOpenImage={setLightboxSrc} />
                      {!(m.media_id && isPlaceholderBody(m.body)) && (
                        <span style={{ padding: m.media_id ? '0 6px 2px' : 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.body}</span>
                      )}
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>
              <form onSubmit={handleSendReply} style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Digite uma resposta..."
                  style={{ ...fieldStyle, marginBottom: 0, flex: 1 }}
                />
                <button type="submit" disabled={sending} style={{ padding: '0 16px', borderRadius: '8px', border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer' }}>
                  <Send size={16} />
                </button>
              </form>
            </>
          )}

          {section === 'historico' && (
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {loadingTimeline ? (
                <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Carregando...</p>
              ) : timeline.length === 0 ? (
                <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Nada registrado ainda.</p>
              ) : (
                timeline.map((ev, idx) => (
                  <div key={idx} style={{ padding: '10px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.03)', fontSize: '0.82rem' }}>
                    <div style={{ color: '#94a3b8', fontSize: '0.72rem', marginBottom: '4px' }}>{formatEventDate(ev.occurredAt)}</div>
                    {ev.type === 'message' && (
                      <div style={{ color: '#fff' }}>{ev.direction === 'outbound' ? 'Você: ' : ''}{ev.body}</div>
                    )}
                    {ev.type === 'sale' && (
                      editingSaleId === ev.id ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ color: '#34d399' }}>Venda: R$</span>
                          <input
                            type="number"
                            step="0.01"
                            autoFocus
                            value={editAmountValue}
                            onChange={(e) => setEditAmountValue(e.target.value)}
                            style={{ width: '90px', padding: '4px 6px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', backgroundColor: '#131b2e', color: '#fff', fontSize: '0.8rem' }}
                          />
                          <button type="button" onClick={() => saveEditSale(ev.id)} disabled={savingSaleEdit} style={{ padding: '4px', borderRadius: '6px', border: 'none', background: '#10b981', color: '#fff', cursor: 'pointer' }}>
                            <Check size={13} />
                          </button>
                          <button type="button" onClick={cancelEditSale} style={{ padding: '4px', borderRadius: '6px', border: 'none', background: 'rgba(255,255,255,0.08)', color: '#fff', cursor: 'pointer' }}>
                            <X size={13} />
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                          <span style={{ color: '#34d399' }}>Venda: R$ {Number(ev.amountSpent).toFixed(2)}</span>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button type="button" onClick={() => startEditSale(ev)} title="Editar valor" style={{ padding: '4px', borderRadius: '6px', border: 'none', background: 'rgba(255,255,255,0.06)', color: '#94a3b8', cursor: 'pointer' }}>
                              <Pencil size={12} />
                            </button>
                            <button type="button" onClick={() => deleteSale(ev.id)} title="Apagar venda" style={{ padding: '4px', borderRadius: '6px', border: 'none', background: 'rgba(248,113,113,0.1)', color: '#f87171', cursor: 'pointer' }}>
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      )
                    )}
                    {ev.type === 'appointment' && (
                      <div style={{ color: '#a855f7' }}>Agendamento marcado</div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {section === 'anotacoes' && (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
              <textarea
                value={notes}
                onChange={(e) => { setNotes(e.target.value); setNotesSaved(false); }}
                placeholder="Observações sobre esse contato (preferências, combinados)..."
                style={{ ...fieldStyle, flex: 1, resize: 'none', minHeight: '200px' }}
              />
              <button
                type="button"
                onClick={handleSaveNotes}
                disabled={notesSaving}
                style={{ ...primaryBtn, maxWidth: '160px', background: '#6366f1' }}
              >
                {notesSaving ? 'Salvando...' : notesSaved ? 'Salvo ✓' : 'Salvar anotação'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
