import React, { useState, useEffect, useRef } from 'react';
import { Send, DollarSign, CalendarPlus, ArrowLeft, CheckCircle2, X, Pencil, Trash2, Check, Paperclip, FileText } from 'lucide-react';
import { Avatar, MessageMedia, ImageLightbox, isPlaceholderBody } from './whatsappMedia';
import AttributionView from './AttributionView';
import { formatTime, dayLabel, isSameDay, StatusTicks } from './chatFormat';
import DealBar from './crm/DealBar';
import BotStatusBar, { useContactBot } from './reservas/BotStatusBar';
import ReservationForm from './reservas/ReservationForm';
import QuickFilesMenu from './QuickFilesMenu';


const fieldStyle = {
  width: '100%',
  padding: '12px',
  borderRadius: '8px',
  border: '1px solid var(--border-color)',
  backgroundColor: 'var(--bg-card)',
  color: 'var(--text-primary)',
  marginBottom: '10px',
  fontSize: '0.95rem'
};

const primaryBtn = {
  padding: '12px',
  borderRadius: '8px',
  border: 'none',
  color: 'var(--on-accent)',
  fontWeight: 700,
  cursor: 'pointer',
  width: '100%'
};

// Mesmo limite do backend (MAX_ATTACHMENT_BYTES em whatsappSender.js).
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

// Anexo esperando o envio: miniatura pra imagem, nome pro resto, X pra tirar.
function AttachmentChip({ file, disabled, onRemove }) {
  const isImage = (file.type || '').startsWith('image/');
  const [previewUrl, setPreviewUrl] = useState(null);
  useEffect(() => {
    if (!isImage) return undefined;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file, isImage]);

  return (
    <div style={{ position: 'relative', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '6px', padding: isImage ? '3px' : '6px 28px 6px 8px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', maxWidth: '200px' }}>
      {isImage && previewUrl ? (
        <img src={previewUrl} alt={file.name} style={{ display: 'block', width: 56, height: 56, objectFit: 'cover', borderRadius: '6px' }} />
      ) : (
        <>
          <FileText size={16} style={{ flexShrink: 0, color: 'var(--text-secondary)' }} />
          <span style={{ fontSize: '0.75rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
        </>
      )}
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        aria-label={`Tirar ${file.name}`}
        style={{ position: 'absolute', top: 2, right: 2, width: 20, height: 20, borderRadius: '50%', border: 'none', background: 'var(--overlay)', color: 'var(--on-accent)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
      >
        <X size={12} />
      </button>
    </div>
  );
}

function formatEventDate(iso) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function ContactDetailPanel({ apiClient, clientId, contact, onClose, onUpdated, onDeleted, onRead, liveUpdateSignal, onBack }) {
  const [section, setSection] = useState('conversa');
  const [lightboxSrc, setLightboxSrc] = useState(null);
  const [attribution, setAttribution] = useState(null);
  // Com reservas ligadas, "Agendar" vira "Nova reserva": o agendamento sempre desconta
  // uma mesa (não existe agendamento por fora do controle de mesas).
  const bot = useContactBot(apiClient, clientId, contact.id, liveUpdateSignal);
  const [reservationOpen, setReservationOpen] = useState(false);
  const messagesContainerRef = useRef(null);
  // Fica "grudado" no fim enquanto a pessoa está vendo as últimas mensagens; se ela
  // subiu pra ler o histórico, mensagem nova (ou atualização de tique) não a puxa pra baixo.
  const stickToBottomRef = useRef(true);
  const scrollToBottom = () => {
    const el = messagesContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };
  const handleMessagesScroll = () => {
    const el = messagesContainerRef.current;
    if (el) stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };
  const handleMediaLoad = () => {
    if (stickToBottomRef.current) scrollToBottom();
  };
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const fileInputRef = useRef(null);

  const [timeline, setTimeline] = useState([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  const [notes, setNotes] = useState(contact.notes || '');
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);

  // Bump pra DealBar recarregar etapa/valor depois de lançar venda ou agendar (os dois
  // podem mover o card de etapa no servidor).
  const [dealVersion, setDealVersion] = useState(0);

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
    setCustomerName(contact.profile_name || '');
    setPhone(contact.wa_id || '');
    setNotes(contact.notes || '');
    setNotesSaved(false);
    setMessages([]);
    stickToBottomRef.current = true;
    fetchMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact.id]);

  // section: voltar pra aba Conversa remonta a lista, que nasce rolada no topo.
  useEffect(() => {
    if (section === 'conversa' && stickToBottomRef.current) scrollToBottom();
  }, [messages, section]);

  useEffect(() => {
    if (liveUpdateSignal == null) return;
    fetchMessages();
    if (section === 'historico') fetchTimeline();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveUpdateSignal]);

  useEffect(() => {
    if (section === 'historico') fetchTimeline();
    if (section === 'origem') fetchAttribution();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, contact.id]);

  const fetchAttribution = async () => {
    setAttribution(null);
    try {
      const res = await apiClient.get(`/api/whatsapp/contacts/${contact.id}/attribution`, { params: clientId ? { clientId } : {} });
      setAttribution(res.data);
    } catch (err) {
      console.error('Error fetching attribution:', err);
      setAttribution({ error: true });
    }
  };

  const fetchMessages = async () => {
    setLoadingMessages(true);
    try {
      const res = await apiClient.get(`/api/whatsapp/conversations/${contact.id}/messages`, { params: clientId ? { clientId } : {} });
      setMessages(res.data.messages || []);
      // Abriu (ou chegou mensagem com a conversa aberta) = lida pela equipe.
      apiClient.post(`/api/whatsapp/conversations/${contact.id}/read`, { clientId })
        .then(() => onRead && onRead(contact.id))
        .catch((err) => console.error('Error marking conversation read:', err));
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

  const addAttachments = (fileList) => {
    const files = Array.from(fileList || []);
    const tooBig = files.filter((f) => f.size > MAX_ATTACHMENT_BYTES);
    if (tooBig.length) alert(`Arquivo grande demais (máximo 15 MB): ${tooBig.map((f) => f.name).join(', ')}`);
    const ok = files.filter((f) => f.size > 0 && f.size <= MAX_ATTACHMENT_BYTES);
    if (ok.length) setAttachments((prev) => [...prev, ...ok]);
  };

  // Imagem copiada (print, foto do cardápio) e colada com Ctrl+V no campo vira anexo.
  const handlePaste = (e) => {
    if (e.clipboardData?.files?.length) {
      e.preventDefault();
      addAttachments(e.clipboardData.files);
    }
  };

  // O corpo é o próprio arquivo; nome, tipo e legenda vão nos cabeçalhos (ver
  // sendAttachment no backend). A legenda vai só no primeiro arquivo. Se um falhar, os
  // que faltam continuam na prévia pra tentar de novo.
  const sendAttachments = async () => {
    const queue = [...attachments];
    let caption = replyText.trim();
    while (queue.length) {
      const file = queue[0];
      await apiClient.post(`/api/whatsapp/conversations/${contact.id}/attachment`, file, {
        params: clientId ? { clientId } : undefined,
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-File-Name': encodeURIComponent(file.name || 'arquivo'),
          'X-File-Type': encodeURIComponent(file.type || 'application/octet-stream'),
          'X-Caption': encodeURIComponent(caption)
        }
      });
      caption = '';
      queue.shift();
      setAttachments([...queue]);
      setReplyText('');
    }
  };

  const handleSendReply = async (e) => {
    e.preventDefault();
    if (!replyText.trim() && attachments.length === 0) return;
    setSending(true);
    try {
      if (attachments.length) {
        await sendAttachments();
      } else {
        await apiClient.post(`/api/whatsapp/conversations/${contact.id}/reply`, { body: replyText, clientId });
      }
      setReplyText('');
      stickToBottomRef.current = true; // quem acabou de responder quer ver a própria mensagem
      fetchMessages();
      if (onUpdated) onUpdated();
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao enviar mensagem.');
    } finally {
      setSending(false);
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
      setDealVersion((v) => v + 1);
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
      setDealVersion((v) => v + 1);
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px', marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', minWidth: 0 }}>
        {onBack && (
          <button type="button" className="icon-button" onClick={onBack} aria-label="Voltar pra lista"><ArrowLeft size={18} /></button>
        )}
        <Avatar apiClient={apiClient} clientId={clientId} mediaId={contact.profile_pic_media_id} name={contact.profile_name || contact.wa_id} size={44} />
        <div>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '1rem' }}>{contact.profile_name || contact.wa_id}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{contact.wa_id}</div>
        </div>
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
          <button type="button" onClick={() => setActionMode('sale')} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '8px 10px', borderRadius: '8px', border: 'none', background: 'var(--accent-success)', color: 'var(--on-accent)', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
            <DollarSign size={14} /> Venda
          </button>
          <button type="button" onClick={() => (bot.enabled ? setReservationOpen(true) : setActionMode('appointment'))} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '8px 10px', borderRadius: '8px', border: 'none', background: 'var(--accent-primary)', color: 'var(--on-accent)', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
            <CalendarPlus size={14} /> {bot.enabled ? 'Nova reserva' : 'Agendar'}
          </button>
          <button
            type="button"
            onClick={handleDeleteContact}
            disabled={deletingContact}
            title="Apagar contato"
            style={{ padding: '8px', borderRadius: '8px', border: 'none', background: 'color-mix(in srgb, var(--accent-danger) 12%, transparent)', color: 'var(--accent-danger)', cursor: 'pointer' }}
          >
            <Trash2 size={14} />
          </button>
          {onClose && (
            <button type="button" onClick={onClose} style={{ padding: '8px', borderRadius: '8px', border: 'none', background: 'var(--border-color)', color: 'var(--text-primary)', cursor: 'pointer' }}>
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <DealBar apiClient={apiClient} clientId={clientId} contactId={contact.id} version={dealVersion} onChanged={onUpdated} />
      <BotStatusBar bot={bot} />
      {bot.enabled && (
        <ReservationForm
          api={apiClient}
          clientId={clientId}
          open={reservationOpen}
          onClose={() => setReservationOpen(false)}
          onSaved={() => { setDealVersion((v) => v + 1); onUpdated?.(); }}
          initial={{ name: contact.profile_name || '', phone: contact.wa_id || '' }}
        />
      )}

      {actionMode === 'success' ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '14px' }}>
          <CheckCircle2 size={48} color="var(--accent-success)" />
          <p style={{ fontWeight: 700, fontSize: '1.1rem' }}>Feito!</p>
          <button onClick={backFromAction} style={{ ...primaryBtn, maxWidth: '200px', background: 'var(--accent-primary)' }}>Voltar</button>
        </div>
      ) : actionMode === 'sale' ? (
        <form onSubmit={handleConfirmSale} style={{ maxWidth: '360px' }}>
          <button type="button" onClick={backFromAction} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', marginBottom: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <ArrowLeft size={16} /> Voltar
          </button>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: '14px' }}>Lançar venda</h3>
          <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Nome do cliente" required style={fieldStyle} />
          <input type="number" step="0.01" value={amountSpent} onChange={(e) => setAmountSpent(e.target.value)} placeholder="Valor gasto (R$)" required autoFocus style={fieldStyle} />
          {error && <p style={{ color: 'var(--accent-danger)', marginBottom: '10px', fontSize: '0.85rem' }}>{error}</p>}
          <button type="submit" disabled={submitting} style={{ ...primaryBtn, background: 'linear-gradient(135deg, var(--accent-success), var(--accent-success))' }}>
            {submitting ? 'Salvando...' : 'Lançar venda'}
          </button>
        </form>
      ) : actionMode === 'appointment' ? (
        <form onSubmit={handleConfirmAppointment} style={{ maxWidth: '360px' }}>
          <button type="button" onClick={backFromAction} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', marginBottom: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <ArrowLeft size={16} /> Voltar
          </button>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: '6px' }}>Marcar agendamento</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>{customerName}</p>
          <input type="date" value={appointmentDate} onChange={(e) => setAppointmentDate(e.target.value)} required autoFocus style={fieldStyle} />
          <input type="time" value={appointmentTime} onChange={(e) => setAppointmentTime(e.target.value)} required style={fieldStyle} />
          {error && <p style={{ color: 'var(--accent-danger)', marginBottom: '10px', fontSize: '0.85rem' }}>{error}</p>}
          <button type="submit" disabled={submitting} style={{ ...primaryBtn, background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-primary-hover))' }}>
            {submitting ? 'Salvando...' : 'Confirmar agendamento'}
          </button>
        </form>
      ) : (
        <>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', overflowX: 'auto', flexShrink: 0, paddingBottom: '2px' }}>
            {[['conversa', 'Conversa'], ['historico', 'Histórico'], ['anotacoes', 'Anotações'], ['origem', 'Origem']].map(([key, label]) => (
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
                  backgroundColor: section === key ? 'var(--accent-primary)' : 'var(--surface-subtle)',
                  color: section === key ? 'var(--on-accent)' : 'var(--text-secondary)'
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {section === 'conversa' && (
            <>
              <div ref={messagesContainerRef} onScroll={handleMessagesScroll} style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px', paddingRight: '4px' }}>
                {loadingMessages && messages.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Carregando...</p>
                ) : messages.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Nenhuma mensagem ainda.</p>
                ) : (
                  messages.map((m, index) => {
                    const outbound = m.direction === 'outbound';
                    const showDay = index === 0 || !isSameDay(messages[index - 1].sent_at, m.sent_at);
                    return (
                      <React.Fragment key={m.id}>
                        {showDay && (
                          <div style={{ alignSelf: 'center', fontSize: '0.7rem', color: 'var(--text-secondary)', backgroundColor: 'var(--border-color)', padding: '3px 10px', borderRadius: '8px', margin: '6px 0' }}>
                            {dayLabel(m.sent_at)}
                          </div>
                        )}
                        <div
                          style={{
                            alignSelf: outbound ? 'flex-end' : 'flex-start',
                            backgroundColor: outbound ? 'var(--accent-primary)' : 'var(--bg-card)',
                            border: outbound ? 'none' : '1px solid var(--border-color)',
                            color: outbound ? 'var(--on-accent)' : 'var(--text-primary)',
                            padding: m.media_id ? '6px' : '7px 10px 5px',
                            borderRadius: '10px',
                            maxWidth: '75%',
                            fontSize: '0.85rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px'
                          }}
                        >
                          <MessageMedia message={m} apiClient={apiClient} clientId={clientId} onOpenImage={setLightboxSrc} onLoad={handleMediaLoad} />
                          {!(m.media_id && isPlaceholderBody(m.body)) && (
                            <span style={{ padding: m.media_id ? '0 6px' : 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.body}</span>
                          )}
                          <span style={{ alignSelf: 'flex-end', display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.66rem', color: outbound ? 'color-mix(in srgb, var(--on-accent) 75%, transparent)' : 'var(--text-muted)', padding: m.media_id ? '0 4px' : 0 }}>
                            {formatTime(m.sent_at)}
                            {outbound && <StatusTicks status={m.status} color="color-mix(in srgb, var(--on-accent) 60%, transparent)" readColor="var(--on-accent)" />}
                          </span>
                        </div>
                      </React.Fragment>
                    );
                  })
                )}
              </div>
              <form onSubmit={handleSendReply} style={{ display: 'flex', flexDirection: 'column', gap: '6px', position: 'sticky', bottom: 0, paddingTop: '8px', paddingBottom: 'env(safe-area-inset-bottom)', background: 'var(--bg-dark)' }}>
                {attachments.length > 0 && (
                  <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '2px' }}>
                    {attachments.map((file, i) => (
                      <AttachmentChip
                        key={`${file.name}-${file.size}-${i}`}
                        file={file}
                        disabled={sending}
                        onRemove={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                      />
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
                    onChange={(e) => { addAttachments(e.target.files); e.target.value = ''; }}
                    style={{ display: 'none' }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={sending}
                    title="Anexar arquivo (cardápio, foto, PDF...)"
                    aria-label="Anexar arquivo"
                    style={{ padding: '0 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-secondary)', cursor: 'pointer' }}
                  >
                    <Paperclip size={16} />
                  </button>
                  <QuickFilesMenu
                    apiClient={apiClient}
                    clientId={clientId}
                    contactId={contact.id}
                    disabled={sending}
                    onSent={() => { stickToBottomRef.current = true; fetchMessages(); if (onUpdated) onUpdated(); }}
                  />
                  <input
                    type="text"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onPaste={handlePaste}
                    placeholder={attachments.length ? 'Legenda (opcional)...' : 'Digite uma resposta...'}
                    style={{ ...fieldStyle, marginBottom: 0, flex: 1, minWidth: 0 }}
                  />
                  <button type="submit" disabled={sending} aria-label="Enviar" style={{ padding: '0 16px', borderRadius: '8px', border: 'none', background: 'var(--accent-primary)', color: 'var(--on-accent)', cursor: 'pointer', opacity: sending ? 0.6 : 1 }}>
                    <Send size={16} />
                  </button>
                </div>
                {sending && attachments.length > 0 && (
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Enviando arquivo...</span>
                )}
              </form>
            </>
          )}

          {section === 'historico' && (
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {loadingTimeline ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Carregando...</p>
              ) : timeline.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Nada registrado ainda.</p>
              ) : (
                timeline.map((ev, idx) => (
                  <div key={idx} style={{ padding: '10px', borderRadius: '8px', backgroundColor: 'var(--border-color)', fontSize: '0.82rem' }}>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', marginBottom: '4px' }}>{formatEventDate(ev.occurredAt)}</div>
                    {ev.type === 'message' && (
                      <div style={{ color: 'var(--text-primary)' }}>{ev.direction === 'outbound' ? 'Você: ' : ''}{ev.body}</div>
                    )}
                    {ev.type === 'sale' && (
                      editingSaleId === ev.id ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ color: 'var(--accent-success)' }}>Venda: R$</span>
                          <input
                            type="number"
                            step="0.01"
                            autoFocus
                            value={editAmountValue}
                            onChange={(e) => setEditAmountValue(e.target.value)}
                            style={{ width: '90px', padding: '4px 6px', borderRadius: '6px', border: '1px solid var(--border-strong)', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '0.8rem' }}
                          />
                          <button type="button" onClick={() => saveEditSale(ev.id)} disabled={savingSaleEdit} style={{ padding: '4px', borderRadius: '6px', border: 'none', background: 'var(--accent-success)', color: 'var(--on-accent)', cursor: 'pointer' }}>
                            <Check size={13} />
                          </button>
                          <button type="button" onClick={cancelEditSale} style={{ padding: '4px', borderRadius: '6px', border: 'none', background: 'var(--border-color)', color: 'var(--text-primary)', cursor: 'pointer' }}>
                            <X size={13} />
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                          <span style={{ color: 'var(--accent-success)' }}>Venda: R$ {Number(ev.amountSpent).toFixed(2)}</span>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button type="button" onClick={() => startEditSale(ev)} title="Editar valor" style={{ padding: '4px', borderRadius: '6px', border: 'none', background: 'var(--border-color)', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                              <Pencil size={12} />
                            </button>
                            <button type="button" onClick={() => deleteSale(ev.id)} title="Apagar venda" style={{ padding: '4px', borderRadius: '6px', border: 'none', background: 'color-mix(in srgb, var(--accent-danger) 10%, transparent)', color: 'var(--accent-danger)', cursor: 'pointer' }}>
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      )
                    )}
                    {ev.type === 'appointment' && (
                      <div style={{ color: 'var(--chart-6)' }}>Agendamento marcado</div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {section === 'origem' && (
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              <AttributionView data={attribution} />
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
                style={{ ...primaryBtn, maxWidth: '160px', background: 'var(--accent-primary)' }}
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
