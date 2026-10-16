import React from 'react';
import { useBreakpoint } from '../../responsive/useBreakpoint.js';

// Tabela no tablet/PC (rolagem lateral + 1ª coluna fixa), cartões no celular.
export default function ResponsiveTable({ columns, rows, rowKey, cardTitle, emptyText = 'Nada por aqui ainda.' }) {
  const bp = useBreakpoint();
  if (!rows.length) return <p style={{ color: 'var(--text-muted)', padding: '16px' }}>{emptyText}</p>;
  const cell = (col, row) => (col.render ? col.render(row) : row[col.key]);

  if (bp === 'phone') {
    const titleCol = cardTitle || columns[0];
    return (
      <div className="rt-cards">
        {rows.map((row) => (
          <div className="rt-card" key={rowKey(row)}>
            <div className="rt-card-title">{cell(titleCol, row)}</div>
            <dl>
              {columns.filter((c) => c !== titleCol && !c.hideOnCard).map((c) => (
                <div key={c.key} className="rt-card-row"><dt>{c.label}</dt><dd>{cell(c, row)}</dd></div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="rt-scroll">
      <table className="rt-table">
        <thead><tr>{columns.map((c) => <th key={c.key} style={{ textAlign: c.align || 'left' }}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>{columns.map((c) => <td key={c.key} style={{ textAlign: c.align || 'left' }}>{cell(c, row)}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
