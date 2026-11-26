import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyEventText, classifyEventAd, mergeEventType, markEventLead, summarizeEventLeads,
  eventFilterSql, parseEventUpdate, loadEventSummary, backfillEventLeads
} from './eventLeads.js';

test('texto: pedido de empresa', () => {
  for (const text of [
    'Quero orçamento para evento da empresa',
    'Olá! Preenchi o formulário e quero um orçamento para o evento da minha empresa no Giulí.',
    'vocês fazem confraternização de fim de ano?',
    'queria marcar a confra da firma',
    'é um jantar corporativo para 30 pessoas',
    'Reunião da equipe, cabe 20?',
    'evento empresarial'
  ]) assert.equal(classifyEventText(text), 'empresa', text);
});

test('texto: aniversário ou comemoração', () => {
  for (const text of [
    'Aniversário ou comemoração',
    'quero comemorar meu aniversario aí sábado',
    'é o níver da minha mãe',
    'uma comemoração em família'
  ]) assert.equal(classifyEventText(text), 'aniversario', text);
});

test('texto: evento sem dizer o tipo fica a definir', () => {
  for (const text of [
    'Quero fazer um evento aí',
    'gostaria de um orçamento para um evento',
    'dá pra fechar o salão?'
  ]) assert.equal(classifyEventText(text), 'a_definir', text);
});

test('texto: conversa comum não é evento', () => {
  for (const text of [
    'Boa noite, tem mesa para 2 hoje?',
    'qual o valor do executivo?',
    'somos uma empresa de bebidas e queremos apresentar o catálogo',
    'vi o story do evento de ontem, que lindo',
    '', null
  ]) assert.equal(classifyEventText(text), null, String(text));
});

test('anúncio: o nome da campanha diz se é de evento', () => {
  assert.equal(classifyEventAd({ campaignName: 'GIULI - [ENG] Eventos WhatsApp 4052 - NOV26' }), 'a_definir');
  assert.equal(classifyEventAd({ campaignName: '[Engajamento] - Eventos — teste' }), 'a_definir');
  assert.equal(classifyEventAd({ campaignName: 'GIULI - [ENG] Aniversário' }), 'aniversario');
  assert.equal(classifyEventAd({ campaignName: '[EVT] Confraternização' }), 'empresa');
  assert.equal(classifyEventAd({ campaignName: 'Engajamento', adName: 'AD - Evento' }), 'a_definir');
  assert.equal(classifyEventAd({ campaignName: 'GIULI - [ENG] Pizzettas', adName: 'AN03' }), null);
  assert.equal(classifyEventAd({}), null);
});

test('empresa vale mais que aniversário, que vale mais que a definir', () => {
  assert.equal(mergeEventType(null, 'a_definir'), 'a_definir');
  assert.equal(mergeEventType('a_definir', 'aniversario'), 'aniversario');
  assert.equal(mergeEventType('aniversario', 'empresa'), 'empresa');
  assert.equal(mergeEventType('empresa', 'aniversario'), 'empresa');
  assert.equal(mergeEventType('aniversario', 'a_definir'), 'aniversario');
  assert.equal(mergeEventType('empresa', null), 'empresa');
});

function fakeDb({ enabled = true, contact = {} } = {}) {
  const updates = [];
  return {
    updates,
    async query(sql, params) {
      if (/FROM clients/.test(sql)) return { rows: [{ events_tracking: enabled }] };
      if (/^\s*SELECT/i.test(sql)) {
        return { rows: [{ event_type: null, event_locked: false, campaign_name: null, ad_name: null, ...contact }] };
      }
      updates.push({ sql, params });
      return { rows: [] };
    }
  };
}
const at = '2026-11-26T15:00:00.000Z';

test('marca o contato pelo texto, com a data da mensagem', async () => {
  const db = fakeDb();
  const type = await markEventLead(db, { clientId: 8, contactId: 1, body: 'orçamento para evento da empresa', at });
  assert.equal(type, 'empresa');
  assert.deepEqual(db.updates[0].params, ['empresa', at, 1]);
});

test('marca pelo anúncio de evento mesmo com mensagem genérica', async () => {
  const db = fakeDb({ contact: { campaign_name: 'GIULI - [ENG] Eventos WhatsApp 4052 - NOV26' } });
  assert.equal(await markEventLead(db, { clientId: 8, contactId: 1, body: 'Olá', at }), 'a_definir');
});

test('o que a equipe escolheu nunca é trocado', async () => {
  const db = fakeDb({ contact: { event_type: null, event_locked: true } });
  assert.equal(await markEventLead(db, { clientId: 8, contactId: 1, body: 'evento da empresa', at }), null);
  assert.equal(db.updates.length, 0);
});

test('cliente com a chave desligada não marca ninguém', async () => {
  const db = fakeDb({ enabled: false });
  await markEventLead(db, { clientId: 9, contactId: 1, body: 'evento da empresa', at });
  assert.equal(db.updates.length, 0);
});

test('sem mudança de tipo não grava de novo', async () => {
  const db = fakeDb({ contact: { event_type: 'empresa' } });
  await markEventLead(db, { clientId: 8, contactId: 1, body: 'Aniversário ou comemoração', at });
  assert.equal(db.updates.length, 0);
});

test('resumo separa empresa e aniversário; quem fechou conta como orçamento enviado', () => {
  const row = (event_type, answered, event_status) => ({ event_type, answered, event_status });
  const summary = summarizeEventLeads([
    row('empresa', true, 'fechado'),
    row('empresa', false, null),
    row('aniversario', true, 'orcamento'),
    row('a_definir', false, null)
  ]);
  assert.deepEqual(summary.empresa, { arrived: 2, answered: 1, quoted: 1, closed: 1 });
  assert.deepEqual(summary.aniversario, { arrived: 1, answered: 1, quoted: 1, closed: 0 });
  assert.deepEqual(summary.a_definir, { arrived: 1, answered: 0, quoted: 0, closed: 0 });
  assert.deepEqual(summary.total, { arrived: 4, answered: 2, quoted: 2, closed: 1 });
});

test('filtro da lista só aceita valores conhecidos', () => {
  assert.equal(eventFilterSql('all'), ' AND wc.event_type IS NOT NULL');
  assert.equal(eventFilterSql('empresa'), " AND wc.event_type = 'empresa'");
  assert.equal(eventFilterSql("x' OR 1=1 --"), '');
  assert.equal(eventFilterSql(undefined), '');
});

test('equipe troca o tipo: trava o automático; tirar a etiqueta limpa o andamento', () => {
  assert.deepEqual(parseEventUpdate({ eventType: 'empresa' }), {
    sets: ['event_type = ?', 'event_locked = true', 'event_at = COALESCE(event_at, CURRENT_TIMESTAMP)'],
    params: ['empresa']
  });
  assert.deepEqual(parseEventUpdate({ eventType: null }), {
    sets: ['event_type = ?', 'event_locked = true', 'event_status = NULL'],
    params: [null]
  });
});

test('mudar só o andamento não trava o tipo; valor desconhecido é recusado', () => {
  assert.deepEqual(parseEventUpdate({ eventStatus: 'orcamento' }), { sets: ['event_status = ?'], params: ['orcamento'] });
  assert.deepEqual(parseEventUpdate({ eventStatus: null }), { sets: ['event_status = ?'], params: [null] });
  assert.deepEqual(parseEventUpdate({}), { sets: [], params: [] });
  assert.ok(parseEventUpdate({ eventType: 'casamento' }).error);
  assert.ok(parseEventUpdate({ eventStatus: 'talvez' }).error);
});

test('quadro compara os últimos 30 dias com os 30 anteriores', async () => {
  const now = new Date('2026-11-26T12:00:00.000Z');
  const db = {
    async query() {
      return { rows: [
        { event_type: 'empresa', answered: true, event_status: null, event_at: new Date('2026-11-25T10:00:00Z') },
        { event_type: 'aniversario', answered: false, event_status: null, event_at: new Date('2026-10-10T10:00:00Z') }
      ] };
    }
  };
  const result = await loadEventSummary(db, 8, { days: 30, now });
  assert.equal(result.current.total.arrived, 1);
  assert.equal(result.current.empresa.arrived, 1);
  assert.equal(result.previous.aniversario.arrived, 1);
  assert.equal(result.previous.total.arrived, 1);
});

function backfillDb(messages) {
  const updates = [];
  return {
    updates,
    async query(sql, params) {
      if (/^\s*SELECT/i.test(sql)) return { rows: messages };
      updates.push(params);
      return { rows: [] };
    }
  };
}
const msg = (contact_id, body, day, extra = {}) =>
  ({ contact_id, body, at: `2026-11-${day}T12:00:00.000Z`, campaign_name: null, ad_name: null, ...extra });

test('histórico: um registro por contato, data do primeiro sinal e tipo mais específico', async () => {
  const db = backfillDb([
    msg(1, 'oi', '01'),
    msg(1, 'quero comemorar meu aniversário', '02'),
    msg(1, 'na verdade é confraternização', '05'),
    msg(2, 'Olá', '03', { campaign_name: 'GIULI - [ENG] Eventos' }),
    msg(3, 'tem mesa hoje?', '04')
  ]);
  const result = await backfillEventLeads(db, 8, { apply: true });
  assert.deepEqual(db.updates, [
    ['empresa', '2026-11-02T12:00:00.000Z', 1, 8],
    ['a_definir', '2026-11-03T12:00:00.000Z', 2, 8]
  ]);
  assert.deepEqual(result, { empresa: 1, aniversario: 0, a_definir: 1, total: 2 });
});

test('histórico sem apply só conta, não grava', async () => {
  const db = backfillDb([msg(1, 'evento da empresa', '02')]);
  const result = await backfillEventLeads(db, 8);
  assert.equal(result.total, 1);
  assert.equal(db.updates.length, 0);
});
