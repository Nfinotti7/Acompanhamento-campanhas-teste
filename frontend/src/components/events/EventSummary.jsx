import React, { useEffect, useState } from 'react';
import { summaryRows } from './eventFormat';

const cell = { padding: '3px 4px', textAlign: 'right' };

// Quadro dos últimos 30 dias, mostrado no Balcão com o filtro de eventos ligado.
export default function EventSummary({ api, version }) {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api.get('/api/whatsapp/event-leads/summary')
      .then((res) => { setData(res.data); setFailed(false); })
      .catch(() => setFailed(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  if (failed) return <p style={{ marginTop: 8, fontSize: '0.72rem', color: 'var(--accent-danger)' }}>Não deu pra carregar os números de eventos.</p>;
  if (!data) return null;

  return (
    <div style={{ marginTop: 8, padding: 8, borderRadius: 8, border: '1px solid var(--border-color)', backgroundColor: 'var(--surface-subtle)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem', color: 'var(--text-primary)' }}>
        <thead>
          <tr style={{ color: 'var(--text-muted)' }}>
            <th style={{ ...cell, textAlign: 'left' }}>30 dias</th>
            <th style={cell} title="Contatos de evento novos no período">Chegaram</th>
            <th style={cell} title="Escreveram de novo depois de uma resposta da casa">Seguiram</th>
            <th style={cell} title="Marcados como orçamento enviado (inclui os fechados)">Orçam.</th>
            <th style={cell}>Fecharam</th>
          </tr>
        </thead>
        <tbody>
          {summaryRows(data).map((row) => (
            <tr key={row.key} style={{ fontWeight: row.key === 'total' ? 800 : 400 }} title={`30 dias anteriores: ${row.before} chegaram`}>
              <td style={{ ...cell, textAlign: 'left' }}>{row.label}</td>
              <td style={cell}>{row.arrived}</td>
              <td style={cell}>{row.answered}</td>
              <td style={cell}>{row.quoted}</td>
              <td style={cell}>{row.closed}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ marginTop: 4, fontSize: '0.68rem', color: 'var(--text-muted)' }}>
        30 dias anteriores: {data.previous.total.arrived} chegaram.
      </p>
    </div>
  );
}
