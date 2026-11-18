// Relatório do piloto da atendente com IA: resume as linhas de ai_replies (auditoria) num
// período. Funções puras; quem lê o banco é scripts/ai-pilot-report.mjs.
const ANSWERED = new Set(['answered', 'handoff']);

// Na auditoria a ferramenta que deu erro aparece como "nome!codigo" e não conta como feita.
const done = (tools, name) => (tools || []).filter((t) => t === name).length;

export function summarizePilot(rows) {
  const contacts = new Set();
  const reasons = new Map();
  const s = {
    period: { from: null, to: null },
    conversations: 0, replies: 0, handoffs: 0, failed: 0, throttled: 0, paused: 0,
    reservationsCreated: 0, reservationsAltered: 0, reservationsCancelled: 0,
    tokensIn: 0, tokensOut: 0, avgLatencyMs: 0, handoffReasons: []
  };
  let latencySum = 0;
  const times = [];
  for (const r of rows) {
    times.push(new Date(r.created_at).getTime());
    s.tokensIn += r.tokens_in || 0;
    s.tokensOut += r.tokens_out || 0;
    latencySum += r.latency_ms || 0;
    s.reservationsCreated += done(r.tools, 'create_reservation');
    s.reservationsAltered += done(r.tools, 'update_reservation');
    s.reservationsCancelled += done(r.tools, 'cancel_reservation');
    if (ANSWERED.has(r.status)) { s.replies += 1; contacts.add(r.contact_id); }
    if (r.status === 'handoff') {
      s.handoffs += 1;
      const reason = r.handoff_reason || 'sem motivo';
      reasons.set(reason, (reasons.get(reason) || 0) + 1);
    }
    if (r.status === 'failed') s.failed += 1;
    if (r.status === 'throttled') s.throttled += 1;
    if (r.status === 'paused') s.paused += 1;
  }
  s.conversations = contacts.size;
  if (rows.length) {
    s.avgLatencyMs = Math.round(latencySum / rows.length);
    s.period = { from: new Date(Math.min(...times)).toISOString(), to: new Date(Math.max(...times)).toISOString() };
  }
  s.handoffReasons = [...reasons].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
  return s;
}

const day = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '-');

export function formatPilotReport(s) {
  if (s.period.from === null) return 'Relatório do piloto da atendente com IA\nNenhum atendimento no período.';
  const lines = [
    'Relatório do piloto da atendente com IA',
    `Período: ${day(s.period.from)} a ${day(s.period.to)}`,
    '',
    `Conversas atendidas: ${s.conversations}`,
    `Respostas enviadas: ${s.replies}`,
    `Reservas criadas pela IA: ${s.reservationsCreated}`,
    `Reservas alteradas: ${s.reservationsAltered}`,
    `Reservas canceladas: ${s.reservationsCancelled}`,
    `Repasses para a equipe: ${s.handoffs}`,
    ...s.handoffReasons.map((h) => `  - ${h.reason} (${h.count})`),
    `Falhas do Gemini (os robôs de hoje assumiram): ${s.failed}`,
    `Limite de respostas por hora atingido: ${s.throttled}`,
    `Equipe já tinha assumido: ${s.paused}`,
    '',
    `Tokens: ${s.tokensIn} de entrada e ${s.tokensOut} de saída`,
    `Tempo médio de cada resposta: ${(s.avgLatencyMs / 1000).toFixed(1)} s`
  ];
  return lines.join('\n');
}
