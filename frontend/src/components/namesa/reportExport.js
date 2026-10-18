// Formatação e exportação do relatório do dia do Na Mesa (planilha e impressão).
export const STATUS_LABEL = {
  seated: 'Sentou',
  no_show: 'Não veio',
  left: 'Saiu da fila',
  removed: 'Removido',
  not_answered: 'Não respondeu',
  waiting: 'Na fila',
  called: 'Chamado',
  awaiting_size: 'Não respondeu'
};

const TZ = 'America/Sao_Paulo';

export function formatTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
}

export function formatDay(day, opts = { weekday: 'long', day: '2-digit', month: '2-digit' }) {
  // Meio-dia UTC: o dia não muda em nenhum fuso do Brasil.
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('pt-BR', { timeZone: TZ, ...opts });
}

export function formatPhone(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  const m = d.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : d;
}

const HEADERS = ['Chegada', 'Nome', 'WhatsApp', 'Pessoas', 'Origem', 'Situação', 'Chamado às', 'Saída', 'Espera (min)'];

export function reportRows(entries) {
  return entries.map((e) => [
    formatTime(e.joined_at),
    e.name || 'Sem nome',
    formatPhone(e.phone),
    e.party_size ?? '',
    e.source === 'whatsapp' ? 'WhatsApp' : 'Manual',
    STATUS_LABEL[e.status] || e.status,
    formatTime(e.called_at),
    formatTime(e.finished_at),
    e.wait_minutes ?? ''
  ]);
}

// Separador ";" e BOM: é o que o Excel em português abre direto, com acentos.
export function toCsv(entries) {
  const cell = (v) => {
    const s = String(v ?? '');
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [HEADERS, ...reportRows(entries)].map((r) => r.map(cell).join(';')).join('\r\n');
}

const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function summaryItems(s) {
  return [
    ['Grupos na fila', s.groups],
    ['Pessoas na fila', s.people],
    ['Grupos que sentaram', s.seatedGroups],
    ['Pessoas que sentaram', s.seatedPeople],
    ['Não vieram', s.noShow],
    ['Saíram da fila', s.left],
    ['Espera média', s.avgWaitMinutes === null ? '-' : `${s.avgWaitMinutes} min`],
    ['Maior espera', s.maxWaitMinutes === null ? '-' : `${s.maxWaitMinutes} min`]
  ];
}

// Página de impressão: papel, sempre claro, independente do tema da tela.
export function printHtml({ restaurant, report }) {
  const title = `Relatório da fila · ${formatDay(report.day)}`;
  const stats = summaryItems(report.summary)
    .map(([label, value]) => `<div class="stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');
  const rows = reportRows(report.entries)
    .map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
body{font-family:system-ui,sans-serif;color:#000D30;background:#fff;padding:24px;margin:0}
h1{font-size:22px;margin:0 0 4px}p{margin:0 0 16px;color:#3A4A6B}
.stats{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}
.stat{border:1px solid #C9D2E3;border-radius:8px;padding:8px 12px;min-width:120px}
.stat span{display:block;font-size:12px;color:#3A4A6B}.stat strong{font-size:18px}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{border-bottom:1px solid #C9D2E3;padding:6px 8px;text-align:left}th{background:#EEF2F8}
</style></head><body>
<h1>${escapeHtml(restaurant || 'Na Mesa')}</h1><p>${escapeHtml(title)}</p>
<div class="stats">${stats}</div>
<table><thead><tr>${HEADERS.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
<tbody>${rows || `<tr><td colspan="${HEADERS.length}">Ninguém passou pela fila neste dia.</td></tr>`}</tbody></table>
<script>window.onload=()=>window.print()</script></body></html>`;
}
