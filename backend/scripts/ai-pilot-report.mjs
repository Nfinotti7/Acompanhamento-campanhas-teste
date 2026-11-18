// Relatório do piloto da atendente com IA (só LEITURA: um SELECT em ai_replies, nada é gravado
// nem enviado). Não roda na suíte de testes.
//
// Uso (na pasta backend, com DATABASE_URL no .env):
//   node scripts/ai-pilot-report.mjs --client 9 --from 2026-11-18 [--to 2026-11-25]
// --to é o último dia incluído; sem ele vai até agora.
import 'dotenv/config';
import db from '../src/config/db.js';
import { summarizePilot, formatPilotReport } from '../src/services/aiPilotReport.js';

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : null;
}

const clientId = Number(arg('client'));
const from = arg('from');
const to = arg('to');
const dateOk = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '');
if (!clientId || !dateOk(from) || (to && !dateOk(to))) {
  console.error('Uso: node scripts/ai-pilot-report.mjs --client <id> --from AAAA-MM-DD [--to AAAA-MM-DD]');
  process.exit(1);
}

// Dias em horário de Brasília (UTC-3 fixo, igual ao resto do app).
const start = new Date(`${from}T00:00:00-03:00`);
const end = to ? new Date(new Date(`${to}T00:00:00-03:00`).getTime() + 24 * 3600e3) : new Date();

const { rows } = await db.query(
  `SELECT contact_id, tokens_in, tokens_out, latency_ms, tools, handoff_reason, status, created_at
   FROM ai_replies WHERE client_id = ? AND created_at >= ? AND created_at < ? ORDER BY created_at`,
  [clientId, start, end]
);
console.log(formatPilotReport(summarizePilot(rows)));
process.exit(0);
