import React from 'react';

export const brl = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function TagChip({ tag, small }) {
  return (
    <span style={{
      display: 'inline-block', padding: small ? '1px 6px' : '2px 8px', borderRadius: '10px',
      fontSize: small ? '0.66rem' : '0.72rem', fontWeight: 700, color: '#fff',
      backgroundColor: `${tag.color}55`, border: `1px solid ${tag.color}`
    }}>
      {tag.name}
    </span>
  );
}
