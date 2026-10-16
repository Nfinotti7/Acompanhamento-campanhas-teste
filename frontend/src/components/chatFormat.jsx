import React from 'react';
import { Check, CheckCheck, Clock, AlertCircle } from 'lucide-react';

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysAgo(iso) {
  return Math.round((startOfDay(new Date()) - startOfDay(iso)) / 86400000);
}

export function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// Igual à lista de conversas do WhatsApp: hoje mostra a hora, ontem "Ontem", antes a data.
export function formatListTime(iso) {
  if (!iso) return '';
  const diff = daysAgo(iso);
  if (diff === 0) return formatTime(iso);
  if (diff === 1) return 'Ontem';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export function dayLabel(iso) {
  const diff = daysAgo(iso);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Ontem';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function isSameDay(a, b) {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

const STATUS_TITLES = {
  pending: 'Enviando',
  sent: 'Enviada',
  delivered: 'Entregue',
  read: 'Lida',
  failed: 'Falhou ao enviar'
};

// Tiques do WhatsApp: relógio (enviando), ✓ (enviada), ✓✓ (entregue), ✓✓ azul (lida).
export function StatusTicks({ status, size = 14, color = 'currentColor', readColor = 'var(--accent-link)' }) {
  if (!status) return null;
  const title = STATUS_TITLES[status];
  const style = { flexShrink: 0, verticalAlign: 'middle' };
  if (status === 'pending') return <Clock size={size - 2} color={color} style={style} aria-label={title}><title>{title}</title></Clock>;
  if (status === 'sent') return <Check size={size} color={color} style={style} aria-label={title}><title>{title}</title></Check>;
  if (status === 'delivered') return <CheckCheck size={size} color={color} style={style} aria-label={title}><title>{title}</title></CheckCheck>;
  if (status === 'read') return <CheckCheck size={size} color={readColor} style={style} aria-label={title}><title>{title}</title></CheckCheck>;
  if (status === 'failed') return <AlertCircle size={size - 1} color="var(--accent-danger)" style={style} aria-label={title}><title>{title}</title></AlertCircle>;
  return null;
}
