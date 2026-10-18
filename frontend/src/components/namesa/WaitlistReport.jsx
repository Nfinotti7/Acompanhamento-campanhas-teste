import React, { useState, useEffect, useCallback } from 'react';
import { Download, Printer } from 'lucide-react';
import { useBreakpoint } from '../../responsive/useBreakpoint';
import ResponsiveTable from '../ui/ResponsiveTable';
import { STATUS_LABEL, formatTime, formatDay, formatPhone, toCsv, printHtml, summaryItems } from './reportExport';

export default function WaitlistReport({ api, restaurant }) {
  const phone = useBreakpoint() === 'phone';
  const [day, setDay] = useState(null);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.get('/api/waitlist/report', { params: day ? { day } : {} })
      .then((res) => { setReport(res.data); setError(''); })
      .catch(() => setError('Não foi possível carregar o relatório.'));
  }, [api, day]);

  useEffect(() => { load(); }, [load]);

  if (!report) return <p style={{ color: 'var(--text-muted)' }}>{error || 'Carregando...'}</p>;

  const fullOnPhone = { width: phone ? '100%' : undefined };

  const download = () => {
    const blob = new Blob([toCsv(report.entries)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fila-${report.day}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const print = () => {
    const w = window.open('', '_blank');
    if (!w) {
      alert('O navegador bloqueou a janela de impressão. Permita pop-ups pra este site e tente de novo.');
      return;
    }
    w.document.write(printHtml({ restaurant: restaurant?.name, report }));
    w.document.close();
  };

  const columns = [
    { key: 'name', label: 'Nome', render: (e) => <strong>{e.name || 'Sem nome'}</strong> },
    { key: 'joined_at', label: 'Chegada', render: (e) => formatTime(e.joined_at) },
    { key: 'phone', label: 'WhatsApp', render: (e) => formatPhone(e.phone) || '-' },
    { key: 'party_size', label: 'Pessoas', align: 'right', render: (e) => e.party_size ?? '-' },
    { key: 'status', label: 'Situação', render: (e) => STATUS_LABEL[e.status] || e.status },
    { key: 'source', label: 'Origem', render: (e) => (e.source === 'whatsapp' ? 'WhatsApp' : 'Manual') },
    { key: 'finished_at', label: 'Saída', render: (e) => formatTime(e.finished_at) || '-' },
    { key: 'wait_minutes', label: 'Espera', align: 'right', render: (e) => (e.wait_minutes === null ? '-' : `${e.wait_minutes} min`) }
  ];

  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
        {report.days.map((d) => (
          <button key={d.day} className="nm-btn" onClick={() => setDay(d.day)} style={{
            flex: '0 0 auto', flexDirection: 'column', gap: '2px', minHeight: '54px',
            background: d.day === report.day ? 'var(--accent-primary)' : 'var(--bg-card)',
            color: d.day === report.day ? 'var(--on-accent)' : 'var(--text-primary)',
            border: '1px solid var(--border-color)'
          }}>
            <span style={{ fontWeight: 700, textTransform: 'capitalize' }}>{formatDay(d.day, { weekday: 'short', day: '2-digit', month: '2-digit' })}</span>
            <span style={{ fontSize: '0.8rem', opacity: 0.85 }}>{d.groups} {d.groups === 1 ? 'grupo' : 'grupos'}</span>
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', flexDirection: phone ? 'column' : 'row' }}>
        <h3 style={{ margin: 0, marginRight: 'auto', textTransform: 'capitalize' }}>{formatDay(report.day)}</h3>
        <button className="nm-btn nm-btn-primary" onClick={download} style={fullOnPhone}><Download size={16} /> Baixar planilha</button>
        <button className="nm-btn nm-btn-muted" onClick={print} style={fullOnPhone}><Printer size={16} /> Imprimir / PDF</button>
      </div>

      <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: `repeat(auto-fill, minmax(${phone ? '140px' : '150px'}, 1fr))` }}>
        {summaryItems(report.summary).map(([label, value]) => (
          <div key={label} className="nm-card" style={{ padding: '12px 16px' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{label}</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{value}</div>
          </div>
        ))}
      </div>

      <div className="nm-card" style={{ padding: phone ? 0 : '8px' }}>
        <ResponsiveTable columns={columns} rows={report.entries} rowKey={(e) => e.id} emptyText="Ninguém passou pela fila neste dia." />
      </div>

      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
        O dia vai das 5h às 5h do dia seguinte. O Na Mesa guarda os últimos {report.retentionDays} dias; o que for mais antigo é apagado sozinho. Baixe a planilha se precisar guardar.
      </p>
    </div>
  );
}
