import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

// Folha que sobe de baixo no celular; modal centralizado no tablet/PC.
export default function Sheet({ open, onClose, title, children }) {
  if (!open) return null;
  return createPortal(
    <div className="modal-backdrop sheet-backdrop" onClick={onClose}>
      <div className="modal-panel sheet-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="sheet-header">
          <strong>{title}</strong>
          <button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}
