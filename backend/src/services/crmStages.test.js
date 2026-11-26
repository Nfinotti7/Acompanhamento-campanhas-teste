import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTO_EVENTS, DEFAULT_STAGES, isValidAutoEvent, effectiveStageId, cardValue,
  legacyStageKey, ensureStages, moveToAutoStage,
  countHouseReplies, advanceOnHouseReply, reviveFromRemarketing, moveIdleToRemarketing, setupFunnelAutomation
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

test('isValidAutoEvent aceita os eventos conhecidos ou vazio', () => {
  for (const e of AUTO_EVENTS) assert.ok(isValidAutoEvent(e));
  assert.ok(isValidAutoEvent(null));
  assert.ok(isValidAutoEvent('atendimento'));
  assert.ok(isValidAutoEvent('remarketing'));
  assert.ok(!isValidAutoEvent('outro'));
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

// ---- 26/11: atendimento na segunda resposta e remarketing por tempo parado ----

const msgs = (letters) => [...letters].map((l) => ({ direction: l === 'c' ? 'inbound' : 'outbound' }));

test('countHouseReplies: mensagens seguidas da casa valem uma resposta só', () => {
  assert.equal(countHouseReplies(msgs('c')), 0);
  assert.equal(countHouseReplies(msgs('chhh')), 1);
  // Cliente manda várias antes da primeira resposta: continua sendo a primeira.
  assert.equal(countHouseReplies(msgs('cccch')), 1);
  assert.equal(countHouseReplies(msgs('chhch')), 2);
  // Conversa que a casa começou: o que sai antes de o cliente escrever não é resposta.
  assert.equal(countHouseReplies(msgs('hhch')), 1);
});

test('advanceOnHouseReply não move quem recebeu só a primeira resposta', async () => {
  const db = fakeDb([[/FROM whatsapp_messages/, { rows: msgs('chhh') }]]);
  assert.equal(await advanceOnHouseReply(db, { clientId: 5, contactId: 1 }), false);
  assert.ok(!db.calls.some((c) => /UPDATE whatsapp_contacts/.test(c.sql)));
});

test('advanceOnHouseReply na segunda resposta move de Novo lead pra Em atendimento e dispara o evento', async () => {
  const fired = [];
  const db = fakeDb([
    [/FROM whatsapp_messages/, { rows: msgs('chch') }],
    [/UPDATE whatsapp_contacts/, { rows: [{ id: 1 }] }]
  ]);
  const moved = await advanceOnHouseReply(db, { clientId: 5, contactId: 1 }, { fire: async (a) => fired.push(a) });
  await new Promise((r) => setImmediate(r));
  assert.equal(moved, true);
  assert.deepEqual(fired, [{ clientId: 5, contactId: 1 }]);
  const update = db.calls.find((c) => /UPDATE whatsapp_contacts/.test(c.sql));
  // Só sai de Novo lead: card em Agendado ou Compareceu nunca volta.
  assert.match(update.sql, /cur\.auto_event = 'novo_lead'/);
  assert.match(update.sql, /nxt\.auto_event = 'atendimento'/);
  assert.match(update.sql, /stage_changed_at = CURRENT_TIMESTAMP/);
});

test('reviveFromRemarketing só tira do Remarketing, de volta pra Novo lead', async () => {
  const db = fakeDb([]);
  assert.equal(await reviveFromRemarketing(db, { clientId: 5, contactId: 1 }), false);
  assert.match(db.calls[0].sql, /cur\.auto_event = 'remarketing'/);
  assert.match(db.calls[0].sql, /nxt\.auto_event = 'novo_lead'/);
});

test('moveIdleToRemarketing move os parados e só dispara evento se a etapa tiver um', async () => {
  const fired = [];
  const db = fakeDb([[/UPDATE whatsapp_contacts/, { rows: [
    { id: 1, client_id: 5, meta_event: null },
    { id: 2, client_id: 9, meta_event: 'Lead' }
  ] }]]);
  assert.equal(await moveIdleToRemarketing(db, { fire: async (a) => fired.push(a) }), 2);
  assert.deepEqual(fired, [{ clientId: 9, contactId: 2 }]);
  const { sql } = db.calls[0];
  assert.match(sql, /cur\.auto_event IN \('novo_lead', 'atendimento'\)/);
  assert.match(sql, /crm_remarketing_days/);
  assert.match(sql, /stage_changed_at/);
});

test('moveIdleToRemarketing: erro num evento não interrompe os outros', async () => {
  const fired = [];
  const db = fakeDb([[/UPDATE whatsapp_contacts/, { rows: [
    { id: 1, client_id: 5, meta_event: 'Lead' }, { id: 2, client_id: 5, meta_event: 'Lead' }
  ] }]]);
  await moveIdleToRemarketing(db, { fire: async (a) => { if (a.contactId === 1) throw new Error('x'); fired.push(a.contactId); } });
  assert.deepEqual(fired, [2]);
});

test('setupFunnelAutomation não faz nada quando nenhum cliente está pendente', async () => {
  const db = fakeDb([]);
  assert.equal(await setupFunnelAutomation(db), 0);
  assert.equal(db.calls.length, 1);
});

test('setupFunnelAutomation liga as etapas pelo nome e sobe quem já teve a segunda resposta', async () => {
  const db = fakeDb([
    [/UPDATE clients SET crm_automation_at/, { rows: [{ id: 5 }] }],
    [/SELECT wc\.id\s+FROM whatsapp_contacts wc/, { rows: [{ id: 1 }, { id: 2 }] }],
    [/FROM whatsapp_messages/, (params) => ({ rows: msgs(params[0] === 1 ? 'chch' : 'ch') })],
    [/UPDATE whatsapp_contacts/, { rows: [{ id: 1 }] }]
  ]);
  assert.equal(await setupFunnelAutomation(db, { fire: async () => {} }), 1);
  const links = db.calls.filter((c) => /UPDATE crm_stages SET auto_event/.test(c.sql));
  assert.deepEqual(links.map((c) => c.params), [
    ['atendimento', 5, 'em atendimento', 5, 'atendimento'],
    ['remarketing', 5, 'remarketing', 5, 'remarketing']
  ]);
  assert.equal(db.calls.filter((c) => /UPDATE whatsapp_contacts/.test(c.sql)).length, 1);
});

test('parseRemarketingDays aceita de 1 a 90 dias inteiros', async () => {
  const { parseRemarketingDays } = await import('./crmStages.js');
  assert.equal(parseRemarketingDays('5'), 5);
  assert.equal(parseRemarketingDays(90), 90);
  for (const bad of ['0', '91', '2.5', 'cinco', '', null, undefined]) assert.equal(parseRemarketingDays(bad), null, String(bad));
});

test('positionUnstagedContacts dá a etapa Novo lead a quem a tela já mostra nela, sem evento', async () => {
  const { positionUnstagedContacts } = await import('./crmStages.js');
  const db = fakeDb([[/UPDATE whatsapp_contacts/, { rows: [{ id: 1 }, { id: 2 }] }]]);
  assert.equal(await positionUnstagedContacts(db), 2);
  const { sql } = db.calls[0];
  assert.match(sql, /whatsapp_contacts\.stage_id IS NULL/);
  assert.match(sql, /auto_event = 'novo_lead'/);
  assert.match(sql, /dashboard_enabled IS NOT FALSE/);
  // Não conta como mudança de etapa: quem está parado há meses continua parado há meses.
  assert.doesNotMatch(sql, /stage_changed_at/);
  assert.equal(db.calls.length, 1);
});

// Visto no banco real: contato importado do histórico tem first_seen_at da importação, e
// com ele na conta ninguém ia pro Remarketing.
test('dias parados contam da última mensagem; a data de criação só vale sem mensagem', async () => {
  const db = fakeDb([]);
  await moveIdleToRemarketing(db);
  const sql = db.calls[0].sql.replace(/\s+/g, ' ');
  assert.match(sql, /GREATEST\( COALESCE\(whatsapp_contacts\.last_message_at, whatsapp_contacts\.first_seen_at\), whatsapp_contacts\.stage_changed_at \)/);
});
