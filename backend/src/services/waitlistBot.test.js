import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleInboundForWaitlist } from './waitlistBot.js';

const NOW = new Date('2026-10-15T23:00:00Z');

// Banco em memória mínimo: só o que o robô e a fila consultam.
function memoryDb() {
  const entries = [];
  let nextId = 1;
  const query = async (sql, params = []) => {
    if (/INSERT INTO waitlist_entries/.test(sql)) {
      const [client_id, contact_id, name, phone] = params;
      const e = { id: nextId++, client_id, contact_id, name, phone, status: 'awaiting_size', size_attempts: 0, notified_near: false, joined_at: NOW.toISOString() };
      entries.push(e);
      return { rows: [{ id: e.id }] };
    }
    if (/SELECT \* FROM waitlist_entries\s+WHERE client_id = \? AND status IN/.test(sql)) {
      const [, , contactId, waId] = params;
      const found = entries.filter((e) => ['awaiting_size', 'waiting', 'called'].includes(e.status) && (e.contact_id === contactId || e.phone === waId));
      return { rows: found.slice(-1) };
    }
    if (/SELECT \* FROM waitlist_entries/.test(sql)) return { rows: entries };
    if (/SET size_attempts = size_attempts \+ 1/.test(sql)) {
      entries.find((e) => e.id === params[0]).size_attempts++;
      return { rows: [] };
    }
    if (/SET contact_id = \?/.test(sql)) {
      entries.find((e) => e.id === params[1]).contact_id = params[0];
      return { rows: [] };
    }
    if (/SET status = 'waiting'/.test(sql)) {
      const [party_size, needs_check, id] = params;
      const e = entries.find((x) => x.id === id && x.status === 'awaiting_size');
      if (!e) return { rows: [] };
      Object.assign(e, { status: 'waiting', party_size, needs_check });
      return { rows: [e] };
    }
    if (/SET notified_near = true/.test(sql)) {
      const e = entries.find((x) => x.id === params[0] && !x.notified_near);
      if (!e) return { rows: [] };
      e.notified_near = true;
      return { rows: [{ id: e.id }] };
    }
    if (/UPDATE waitlist_entries SET status = \?/.test(sql)) {
      const [to, id, , ...from] = params;
      const e = entries.find((x) => x.id === id && from.includes(x.status));
      if (!e) return { rows: [] };
      e.status = to;
      return { rows: [e] };
    }
    return { rows: [] };
  };
  return { entries, query };
}

function setup() {
  const db = memoryDb();
  const sent = [];
  const deps = {
    db,
    send: async (m) => { sent.push(m.body); return 'wamid'; },
    broadcast: () => {},
    now: () => NOW
  };
  const say = (body, contactId = 3) =>
    handleInboundForWaitlist({ clientId: 1, contactId, waId: `55119999900${contactId}`, profileName: 'Maria Souza', body }, deps);
  return { db, sent, say };
}

test('quem não está na fila e não mandou FILA é ignorado', async () => {
  const { sent, say } = setup();
  assert.equal(await say('tem fila hoje?'), 'ignored');
  assert.equal(sent.length, 0);
});

test('fluxo completo: FILA, tamanho inválido, tamanho válido, consulta e SAIR', async () => {
  const { sent, say, db } = setup();
  assert.equal(await say('Quero entrar na fila (cód. FILA)'), 'asked_size');
  assert.equal(sent.at(-1), 'Oi, Maria! Pra quantas pessoas?');

  assert.equal(await say('oi?'), 'asked_size_again');
  assert.match(sent.at(-1), /Não entendi/);

  assert.equal(await say('somos 4'), 'joined');
  assert.match(sent.at(-1), /Posição: 1/);
  assert.equal(db.entries[0].party_size, 4);

  assert.equal(await say('e aí?'), 'status');
  assert.match(sent.at(-1), /sua posição na fila é 1/);

  assert.equal(await say('FILA'), 'status'); // não cria segunda entrada
  assert.equal(db.entries.length, 1);

  assert.equal(await say('sair'), 'left');
  assert.match(sent.at(-1), /você saiu da fila/);
  assert.equal(db.entries[0].status, 'left');
});

test('depois de 2 respostas sem número, entra com 2 pessoas e marca pra conferir', async () => {
  const { say, db } = setup();
  await say('FILA');
  await say('hã');
  await say('não sei');
  assert.equal(await say('???'), 'joined_unchecked');
  assert.equal(db.entries[0].party_size, 2);
  assert.equal(db.entries[0].needs_check, true);
});

test('quem já foi chamado recebe a lembrança da mesa pronta', async () => {
  const { say, db, sent } = setup();
  await say('FILA');
  await say('2');
  db.entries[0].status = 'called';
  assert.equal(await say('cheguei?'), 'called_reminder');
  assert.match(sent.at(-1), /mesa já está pronta/);
});

test('entrada manual com telefone é ligada ao contato quando a pessoa escreve', async () => {
  const { say, db } = setup();
  db.entries.push({ id: 50, client_id: 1, contact_id: null, phone: '551199999003', name: 'Zé', status: 'waiting', notified_near: true, joined_at: NOW.toISOString() });
  assert.equal(await say('qual minha posição?'), 'status');
  assert.equal(db.entries[0].contact_id, 3);
});

test('WhatsApp fora do ar: o robô grava a entrada e avisa a tela mesmo sem conseguir responder', async () => {
  const db = memoryDb();
  const events = [];
  const deps = {
    db,
    send: async () => { throw new Error('Baileys caiu'); },
    broadcast: (clientId, name, data) => events.push({ name, data }),
    now: () => NOW
  };
  const result = await handleInboundForWaitlist({ clientId: 1, contactId: 3, waId: '551199999003', profileName: 'Maria', body: 'FILA' }, deps);
  assert.equal(result, 'asked_size');
  assert.equal(db.entries.length, 1);
  assert.equal(events.at(-1)?.name, 'waitlist');
});
