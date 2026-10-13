import React from 'react';

export default function Modal({ onClose, children, maxWidth = '720px' }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: '20px'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: '#0b0f19', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)',
          padding: '20px', width: '100%', maxWidth, maxHeight: '85vh', overflowY: 'auto'
        }}
      >
        {children}
      </div>
    </div>
  );
}
