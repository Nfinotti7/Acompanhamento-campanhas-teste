// Importa o relatório de campanhas do Google Ads (CSV baixado da interface) quando a
// sincronização pela API não está disponível. Gera linhas no mesmo formato que
// fetchGoogleAdsData, então vão pro banco pelo mesmo caminho do sync.

const MONTHS = {
  jan: 1, fev: 2, feb: 2, mar: 3, abr: 4, apr: 4, mai: 5, may: 5, jun: 6, jul: 7,
  ago: 8, aug: 8, set: 9, sep: 9, out: 10, oct: 10, nov: 11, dez: 12, dec: 12
};

const HEADERS = {
  campaignName: ['campanha', 'campaign', 'nome da campanha', 'campaign name'],
  date: ['dia', 'day', 'data', 'date'],
  spend: ['custo', 'cost', 'valor gasto'],
  clicks: ['cliques', 'clicks'],
  impressions: ['impr', 'impressoes', 'impressions'],
  conversions: ['conversoes', 'conversions'],
  conversionValue: ['valor conv', 'valor de conv', 'valor da conv', 'valor de conversao', 'valor da conversao', 'conv value', 'conversion value'],
  status: ['status da campanha', 'campaign status', 'status'],
  budget: ['orcamento', 'budget']
};

function normalizeHeader(text) {
  return String(text)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function splitLine(line, delimiter) {
  const cells = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) { cells.push(cur); cur = ''; }
    else cur += ch;
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

function detectDelimiter(line) {
  const counts = ['\t', ';', ','].map((d) => [d, line.split(d).length - 1]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ',';
}

function findColumns(cells) {
  const normalized = cells.map(normalizeHeader);
  const cols = {};
  for (const [key, names] of Object.entries(HEADERS)) {
    const idx = normalized.findIndex((h) => names.includes(h));
    if (idx >= 0) cols[key] = idx;
  }
  return cols;
}

export function parseNumber(raw, { integer = false } = {}) {
  if (raw === undefined || raw === null) return 0;
  let s = String(raw).replace(/[^\d.,-]/g, '');
  if (!s || s === '-' || s === '--') return 0;
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    const decimalSep = s.lastIndexOf(',') > s.lastIndexOf('.') ? ',' : '.';
    const thousandSep = decimalSep === ',' ? '.' : ',';
    s = s.split(thousandSep).join('').replace(decimalSep, '.');
  } else if (hasComma) {
    if (integer && /^-?\d{1,3}(,\d{3})+$/.test(s)) s = s.replace(/,/g, '');
    else s = s.replace(',', '.');
  } else if (hasDot) {
    if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

export function parseDate(raw) {
  const s = String(raw || '').trim().toLowerCase();
  const pad = (n) => String(n).padStart(2, '0');
  const valid = (y, m, d) => {
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
      ? `${y}-${pad(m)}-${pad(d)}` : null;
  };
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return valid(+m[3], +m[2], +m[1]);
  m = s.match(/^(\d{1,2})\s+(?:de\s+)?([a-zç]{3})[a-zç]*\.?\s+(?:de\s+)?(\d{4})$/);
  if (m && MONTHS[m[2]]) return valid(+m[3], MONTHS[m[2]], +m[1]);
  m = s.match(/^([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m && MONTHS[m[1]]) return valid(+m[3], MONTHS[m[1]], +m[2]);
  return null;
}

function mapStatus(raw) {
  const s = normalizeHeader(raw || '');
  if (/paus|paused/.test(s)) return 'PAUSED';
  if (/remov/.test(s)) return 'REMOVED';
  return 'ENABLED';
}

export function campaignKey(name) {
  return `csv:${normalizeHeader(name)}`;
}

// Devolve { rows, skipped } ou lança Error com mensagem pro usuário.
// Linhas sem data válida (título do relatório, "Total: ...") são ignoradas.
export function parseGoogleAdsCsv(text) {
  const lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/);

  let cols = null;
  let delimiter = ',';
  let headerIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    if (!lines[i].trim()) continue;
    const d = detectDelimiter(lines[i]);
    const found = findColumns(splitLine(lines[i], d));
    if (found.campaignName !== undefined && found.date !== undefined) {
      cols = found; delimiter = d; headerIdx = i;
      break;
    }
  }
  if (!cols) {
    throw new Error('Não achei as colunas "Campanha" e "Dia". No Google Ads, segmente o relatório por Tempo → Dia antes de baixar.');
  }
  if (cols.spend === undefined) {
    throw new Error('Não achei a coluna "Custo" no arquivo.');
  }

  const byKey = new Map();
  let skipped = 0;
  for (const line of lines.slice(headerIdx + 1)) {
    if (!line.trim()) continue;
    const cells = splitLine(line, delimiter);
    const date = parseDate(cells[cols.date]);
    const name = (cells[cols.campaignName] || '').trim();
    if (!date || !name || /^total/i.test(name)) { skipped++; continue; }

    const key = `${campaignKey(name)}|${date}`;
    const prev = byKey.get(key);
    const row = prev || {
      campaignId: campaignKey(name),
      campaignName: name,
      status: cols.status !== undefined ? mapStatus(cells[cols.status]) : 'ENABLED',
      budget: cols.budget !== undefined ? parseNumber(cells[cols.budget]) : 0,
      date, spend: 0, clicks: 0, impressions: 0, conversions: 0, conversionValue: 0
    };
    // Mais de uma linha pro mesmo dia (relatório com outro segmento junto): soma.
    row.spend += parseNumber(cells[cols.spend]);
    if (cols.clicks !== undefined) row.clicks += Math.round(parseNumber(cells[cols.clicks], { integer: true }));
    if (cols.impressions !== undefined) row.impressions += Math.round(parseNumber(cells[cols.impressions], { integer: true }));
    if (cols.conversions !== undefined) row.conversions += parseNumber(cells[cols.conversions]);
    if (cols.conversionValue !== undefined) row.conversionValue += parseNumber(cells[cols.conversionValue]);
    byKey.set(key, row);
  }

  const rows = [...byKey.values()].map((r) => ({ ...r, conversions: Math.round(r.conversions) }));
  if (rows.length === 0) {
    throw new Error('Nenhuma linha com campanha e data válidas no arquivo.');
  }
  return { rows, skipped };
}

export function summarizeRows(rows) {
  const dates = rows.map((r) => r.date).sort();
  return {
    campaigns: new Set(rows.map((r) => r.campaignId)).size,
    rows: rows.length,
    firstDate: dates[0],
    lastDate: dates[dates.length - 1],
    spend: Math.round(rows.reduce((s, r) => s + r.spend, 0) * 100) / 100,
    clicks: rows.reduce((s, r) => s + r.clicks, 0),
    impressions: rows.reduce((s, r) => s + r.impressions, 0),
    conversions: rows.reduce((s, r) => s + r.conversions, 0)
  };
}
