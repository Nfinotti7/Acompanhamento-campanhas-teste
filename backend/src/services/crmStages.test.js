import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTO_EVENTS, DEFAULT_STAGES, isValidAutoEvent, effectiveStageId, cardValue,
  legacyStageKey, ensureStages, moveToAutoStage
} from './crmStages.js';

const stages = [{ id: 10 }, { id: 11 }, { id: 12 }];

test('effectiveStageId mantem a etapa do contato quando ela existe', () => {
  assert.equal(effectiveStageId(11, stages), 11);
});

test('effectiveStageId cai na primeira etapa quando o contato nao tem etapa ou ela foi apagada', () => {
  assert.equal(effectiveStageId(null, stages), 10);
  assert.equal(effectiveStageId(99, stages), 10);
});

test('effectiveStageId sem etapas devolve null', () => {
  assert.equal(effectiveStageId(5, []), null);
});

test('cardValue usa o total de vendas quando ha venda, senao o valor estimado', () => {
  assert.equal(cardValue({ dealValue: '300.00', salesTotal: '0' }), 300);
  assert.equal(cardValue({ dealValue: '300.00', salesTotal: '187.50' }), 187.5);
  assert.equal(cardValue({ dealValue: null, salesTotal: null }), 0);
});

test('isValidAutoEvent aceita os 3 eventos ou vazio', () => {
  for (const e of AUTO_EVENTS) assert.ok(isValidAutoEvent(e));
  assert.ok(isValidAutoEvent(null));
  assert.ok(!isValidAutoEvent('remarketing'));
});

test('etapas padrao ligam exatamente um estagio a cada evento automatico', () => {
  for (const e of AUTO_EVENTS) {
    assert.equal(DEFAULT_STAGES.filter((s) => s.autoEvent === e).length, 1);
  }
});

test('legacyStageKey respeita etapa manual antiga e cai no calculo automatico', () => {
  const now = new Date('2026-10-13T12:00:00Z');
  assert.equal(legacyStageKey({ manual_stage: 'remarketing' }, { now }), 'remarketing');
  assert.equal(legacyStageKey({ has_conversion: true }, { now }), 'compareceu');
  assert.equal(legacyStageKey({ last_message_at: '2026-10-13T10:00:00Z', has_outbound: true }, { now }), 'em_atendimento');
});

function fakeDb(handlers) {
  const calls = [];
  return {
    calls,
    query: async (sql, params = []) => {
      calls.push({ sql, params });
      for (const [pattern, result] of handlers) {
        if (pattern.test(sql)) return typeof result === 'function' ? result(params) : result;
      }
      return { rows: [] };
    }
  };
}

test('ensureStages nao faz nada se o cliente ja foi configurado', async () => {
  const db = fakeDb([[/UPDATE clients SET crm_seeded_at/, { rows: [] }]]);
  assert.equal(await ensureStages(db, 5), false);
  assert.ok(!db.calls.some((c) => /INSERT INTO crm_stages/.test(c.sql)));
});

test('ensureStages cria as 6 etapas e posiciona os contatos existentes pela etapa antiga', async () => {
  let nextId = 100;
  const db = fakeDb([
    [/UPDATE clients SET crm_seeded_at/, { rows: [{ id: 5 }] }],
    [/INSERT INTO crm_stages/, () => ({ rows: [{ id: nextId++ }] })],
    [/SELECT remarketing_days/, { rows: [{ remarketing_days: 3 }] }],
    [/FROM whatsapp_contacts wc/, { rows: [
      { id: 1, has_conversion: true },
      { id: 2, appointment_at: '2999-01-01T00:00:00Z' }
    ] }]
  ]);

  assert.equal(await ensureStages(db, 5), true);

  const inserts = db.calls.filter((c) => /INSERT INTO crm_stages/.test(c.sql));
  assert.equal(inserts.length, 6);
  assert.deepEqual(inserts.map((c) => c.params[3]), [0, 1, 2, 3, 4, 5]); // posições

  const moves = db.calls.filter((c) => /UPDATE whatsapp_contacts SET stage_id/.test(c.sql));
  assert.deepEqual(moves.map((c) => c.params), [[104, 1], [102, 2]]); // compareceu, agendado
});

test('moveToAutoStage novo_lead so posiciona contato sem etapa', async () => {
  const db = fakeDb([]);
  await moveToAutoStage(db, { clientId: 5, contactId: 1, event: 'novo_lead' });
  assert.match(db.calls[0].sql, /stage_id IS NULL/);
});

test('moveToAutoStage venda move pra etapa ligada ao evento', async () => {
  const db = fakeDb([]);
  await moveToAutoStage(db, { clientId: 5, contactId: 1, event: 'venda' });
  assert.match(db.calls[0].sql, /auto_event = \?/);
  assert.deepEqual(db.calls[0].params, [5, 'venda', 1]);
});
