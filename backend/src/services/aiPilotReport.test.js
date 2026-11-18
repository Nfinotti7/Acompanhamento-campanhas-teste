import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizePilot, formatPilotReport } from './aiPilotReport.js';

const row = (o) => ({
  contact_id: 1, tokens_in: 100, tokens_out: 10, latency_ms: 1000, tools: [], handoff_reason: null,
  status: 'answered', created_at: '2026-11-18T15:00:00Z', ...o
});

test('summarizePilot: lista vazia devolve tudo zero, sem NaN', () => {
  const s = summarizePilot([]);
  assert.equal(s.conversations, 0);
  assert.equal(s.replies, 0);
  assert.equal(s.avgLatencyMs, 0);
  assert.equal(s.tokensIn, 0);
  assert.deepEqual(s.handoffReasons, []);
  assert.deepEqual(s.period, { from: null, to: null });
});

test('summarizePilot: conversas, respostas, repasses, falhas, limite e pausas', () => {
  const s = summarizePilot([
    row({ contact_id: 1 }),
    row({ contact_id: 1, status: 'handoff', handoff_reason: 'grupo grande' }),
    row({ contact_id: 2 }),
    row({ contact_id: 3, status: 'failed' }),
    row({ contact_id: 4, status: 'throttled' }),
    row({ contact_id: 5, status: 'paused' })
  ]);
  assert.equal(s.conversations, 2); // só quem recebeu resposta (answered/handoff)
  assert.equal(s.replies, 3);
  assert.equal(s.handoffs, 1);
  assert.equal(s.failed, 1);
  assert.equal(s.throttled, 1);
  assert.equal(s.paused, 1);
});

test('summarizePilot: reservas criadas, alteradas e canceladas; ferramenta com erro não conta', () => {
  const s = summarizePilot([
    row({ tools: ['check_availability', 'create_reservation'] }),
    row({ tools: ['create_reservation!tool_error'] }),
    row({ tools: ['update_reservation'] }),
    row({ tools: ['list_my_reservations', 'cancel_reservation'] }),
    row({ tools: null })
  ]);
  assert.equal(s.reservationsCreated, 1);
  assert.equal(s.reservationsAltered, 1);
  assert.equal(s.reservationsCancelled, 1);
});

test('summarizePilot: tokens, latência média e período', () => {
  const s = summarizePilot([
    row({ tokens_in: 100, tokens_out: 10, latency_ms: 1000, created_at: '2026-11-18T10:00:00Z' }),
    row({ tokens_in: 300, tokens_out: 30, latency_ms: 3000, created_at: '2026-11-20T10:00:00Z' })
  ]);
  assert.equal(s.tokensIn, 400);
  assert.equal(s.tokensOut, 40);
  assert.equal(s.avgLatencyMs, 2000);
  assert.deepEqual(s.period, { from: '2026-11-18T10:00:00.000Z', to: '2026-11-20T10:00:00.000Z' });
});

test('summarizePilot: motivos de repasse agrupados e ordenados por contagem', () => {
  const s = summarizePilot([
    row({ status: 'handoff', handoff_reason: 'bolo' }),
    row({ status: 'handoff', handoff_reason: 'grupo grande' }),
    row({ status: 'handoff', handoff_reason: 'grupo grande' })
  ]);
  assert.deepEqual(s.handoffReasons, [{ reason: 'grupo grande', count: 2 }, { reason: 'bolo', count: 1 }]);
});

test('formatPilotReport: texto em português com os números', () => {
  const text = formatPilotReport(summarizePilot([row({ tools: ['create_reservation'] })]));
  assert.match(text, /Reservas criadas pela IA: 1/);
  assert.match(text, /Conversas atendidas: 1/);
  assert.match(text, /Tokens/);
});

test('formatPilotReport: sem dados diz que não houve atendimento', () => {
  assert.match(formatPilotReport(summarizePilot([])), /Nenhum atendimento/);
});
