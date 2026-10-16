import React from 'react';
import axios from 'axios';
import { Columns3 } from 'lucide-react';
import CrmBoard from '../components/crm/CrmBoard';

export default function WhatsAppKanbanPage({ selectedClient }) {
  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)' }}>
      <div style={{ marginBottom: '16px', flexShrink: 0 }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Columns3 size={28} color="var(--accent-primary)" />
          Funil WhatsApp
        </h1>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          Arraste os cards entre as etapas. Lead novo, agendamento e venda movem o card sozinhos.
        </p>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <CrmBoard key={selectedClient} apiClient={axios} clientId={selectedClient} />
      </div>
    </div>
  );
}
