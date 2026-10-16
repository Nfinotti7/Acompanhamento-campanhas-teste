import React from 'react';
import { createPortal } from 'react-dom';

// Renderizado direto no <body> (portal): dentro da área principal ele herdava o contexto
// de camadas dela, e a barra lateral ficava por cima do modal.
// No celular ocupa a tela inteira (classe .modal-panel no index.css).
export default function Modal({ onClose, children, maxWidth = '720px' }) {
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth }}>
        {children}
      </div>
    </div>,
    document.body
  );
}
