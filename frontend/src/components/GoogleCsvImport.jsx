import React, { useRef, useState } from 'react';
import axios from 'axios';
import { Upload, CheckCircle2, AlertCircle } from 'lucide-react';

const brl = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dia = (iso) => iso.split('-').reverse().join('/');

// O Google Ads às vezes baixa o CSV em UTF-16; decodifica pelo marcador do início do arquivo.
async function readCsvText(file) {
  const buf = await file.arrayBuffer();
  const b = new Uint8Array(buf);
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(buf);
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(buf);
  return new TextDecoder('utf-8').decode(buf);
}

export default function GoogleCsvImport({ clientId }) {
  const inputRef = useRef(null);
  const [text, setText] = useState(null);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState(null);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  const send = (dryRun) => axios.post(
    `/api/campaigns/import-google?clientId=${clientId}${dryRun ? '&dryRun=1' : ''}`,
    text,
    { headers: { 'Content-Type': 'text/plain' } }
  );

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus(null); setPreview(null); setBusy(true);
    try {
      const content = await readCsvText(file);
      setText(content); setFileName(file.name);
      const { data } = await axios.post(
        `/api/campaigns/import-google?clientId=${clientId}&dryRun=1`,
        content,
        { headers: { 'Content-Type': 'text/plain' } }
      );
      setPreview(data.summary);
    } catch (err) {
      setText(null);
      setStatus({ type: 'error', text: err.response?.data?.error || 'Não consegui ler o arquivo.' });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const confirm = async () => {
    setBusy(true); setStatus(null);
    try {
      const { data } = await send(false);
      setStatus({ type: 'success', text: `Importado: ${data.summary.rows} dias de campanha para ${data.summary.client}. Já aparece na dashboard.` });
      setPreview(null); setText(null);
    } catch (err) {
      setStatus({ type: 'error', text: err.response?.data?.error || 'Erro ao importar.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="glass-card" style={{ padding: '24px', marginTop: '24px' }}>
      <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '6px', color: 'var(--text-primary)' }}>
        Importar CSV do Google Ads
      </h3>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
        Para cliente que ainda não está ligado à API do Google. No Google Ads, abra <strong>Campanhas</strong>, escolha o período,
        segmente por <strong>Tempo → Dia</strong> e baixe em CSV. Reimportar o mesmo período só atualiza os números.
        Quando a API for ligada, o sincronizador assume essas campanhas sem duplicar.
      </p>

      <input ref={inputRef} type="file" accept=".csv,.tsv,.txt" onChange={handleFile} style={{ display: 'none' }} />
      <button type="button" className="btn" disabled={busy || !clientId} onClick={() => inputRef.current?.click()}>
        <Upload size={16} />
        <span>{busy && !preview ? 'Lendo...' : 'Escolher arquivo CSV'}</span>
      </button>
      {!clientId && <span style={{ marginLeft: 12, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Escolha um cliente no topo da página.</span>}

      {preview && (
        <div style={{ marginTop: '16px', padding: '14px 16px', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--surface-subtle)', fontSize: '0.9rem', color: 'var(--text-primary)' }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>{fileName} → {preview.client}</div>
          <div>{preview.campaigns} campanha(s), {preview.rows} dias, de {dia(preview.firstDate)} a {dia(preview.lastDate)}</div>
          <div>Gasto {brl(preview.spend)} · {preview.clicks} cliques · {preview.impressions} impressões · {preview.conversions} conversões</div>
          {preview.droppedBeforeStart > 0 && (
            <div style={{ color: 'var(--text-secondary)', marginTop: 4 }}>
              {preview.droppedBeforeStart} dia(s) antes de {dia(preview.startDate)} (início dos dados do cliente) foram ignorados.
            </div>
          )}
          <div style={{ color: 'var(--text-secondary)', marginTop: 4 }}>Confira o gasto com o total do Google Ads antes de confirmar.</div>
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={confirm}>
              {busy ? 'Importando...' : 'Confirmar importação'}
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => { setPreview(null); setText(null); }}>Cancelar</button>
          </div>
        </div>
      )}

      {status && (
        <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem', fontWeight: 600,
          color: status.type === 'success' ? 'var(--accent-success)' : 'var(--accent-danger)' }}>
          {status.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span>{status.text}</span>
        </div>
      )}
    </div>
  );
}
