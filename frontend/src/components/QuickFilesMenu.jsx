import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FolderOpen, Plus, Trash2, FileText, Image as ImageIcon, X } from 'lucide-react';

const MAX_BYTES = 15 * 1024 * 1024;

function sizeLabel(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// Arquivos fixos do restaurante (cardápio, mapa, tabela de preços): ficam guardados no
// servidor e vão pra conversa com um clique, sem procurar no computador toda vez.
export default function QuickFilesMenu({ apiClient, clientId, contactId, disabled, onSent }) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState(null);
  const [busy, setBusy] = useState(null); // id enviando, ou 'upload'
  const [error, setError] = useState('');
  const pickerRef = useRef(null);
  const boxRef = useRef(null);
  const params = clientId ? { clientId } : undefined;

  const load = useCallback(() => {
    apiClient.get('/api/quick-files', { params })
      .then((res) => setFiles(res.data.files))
      .catch((err) => setError(err.response?.data?.error || 'Não foi possível carregar os arquivos.'));
  }, [apiClient, clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (open) { setError(''); load(); } }, [open, load]);

  // Fecha clicando fora.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const send = async (file) => {
    setBusy(file.id);
    setError('');
    try {
      await apiClient.post(`/api/whatsapp/conversations/${contactId}/quick-file/${file.id}`, {}, { params });
      setOpen(false);
      onSent?.();
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível enviar o arquivo.');
    } finally {
      setBusy(null);
    }
  };

  const upload = async (fileList) => {
    const file = fileList?.[0];
    if (!file) return;
    if (file.size > MAX_BYTES) { setError('Arquivo grande demais (máximo 15 MB).'); return; }
    const label = window.prompt('Nome pra aparecer na lista (ex: Cardápio do rodízio):', file.name.replace(/\.[^.]+$/, ''));
    if (label === null) return;
    setBusy('upload');
    setError('');
    try {
      await apiClient.post('/api/quick-files', file, {
        params,
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-File-Name': encodeURIComponent(file.name || 'arquivo'),
          'X-File-Type': encodeURIComponent(file.type || 'application/octet-stream'),
          'X-Label': encodeURIComponent(label.trim() || file.name)
        }
      });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível salvar o arquivo.');
    } finally {
      setBusy(null);
    }
  };

  const remove = async (file) => {
    if (!window.confirm(`Apagar "${file.label}" dos arquivos salvos?`)) return;
    try {
      await apiClient.delete(`/api/quick-files/${file.id}`, { params });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível apagar.');
    }
  };

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        title="Arquivos salvos (cardápio, mapa...)"
        aria-label="Arquivos salvos"
        style={{ height: '100%', padding: '0 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-secondary)', cursor: 'pointer' }}
      >
        <FolderOpen size={16} />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Arquivos salvos"
          style={{ position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, width: 'min(320px, 86vw)', maxHeight: '320px', overflowY: 'auto', zIndex: 30, padding: '10px', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', boxShadow: 'var(--shadow-card)', display: 'grid', gap: '6px' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>Arquivos salvos</strong>
            <button type="button" onClick={() => setOpen(false)} aria-label="Fechar" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={14} /></button>
          </div>
          {files === null && !error && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Carregando...</span>}
          {files?.length === 0 && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Nenhum arquivo salvo. Adicione o cardápio e o mapa pra mandar com um clique.</span>}
          {files?.map((f) => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => send(f)}
                title="Enviar pra esta conversa"
                style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '8px', textAlign: 'left', padding: '8px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-dark)', color: 'var(--text-primary)', cursor: 'pointer', opacity: busy === f.id ? 0.6 : 1 }}
              >
                {f.mime_type.startsWith('image/') ? <ImageIcon size={16} /> : <FileText size={16} />}
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.82rem' }}>{f.label}</span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{busy === f.id ? 'Enviando...' : sizeLabel(f.size_bytes)}</span>
              </button>
              <button type="button" onClick={() => remove(f)} aria-label={`Apagar ${f.label}`} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><Trash2 size={14} /></button>
            </div>
          ))}
          <input ref={pickerRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => pickerRef.current?.click()}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '8px', borderRadius: '8px', border: '1px dashed var(--border-strong)', background: 'none', color: 'var(--accent-link, var(--accent-primary))', cursor: 'pointer', fontSize: '0.8rem' }}
          >
            <Plus size={14} /> {busy === 'upload' ? 'Salvando...' : 'Salvar um arquivo novo'}
          </button>
          {error && <span style={{ fontSize: '0.78rem', color: 'var(--accent-danger)' }}>{error}</span>}
        </div>
      )}
    </div>
  );
}
