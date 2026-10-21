import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleInboundForReservation, EXPIRE_MS } from './reservationBot.js';
import { DEFAULT_RESERVATION_SETTINGS, toInstant } from './reservationSlots.js';
import { SlotTakenError } from './reservationStore.js';

const WEEKDAY = [{ start: '17:00', lastBooking: '22:30' }];
const WEEKEND = [{ start: '12:00', lastBooking: '14:30' }, { start: '18:00', lastBooking: '22:30' }];
const MALIBU = {
  ...DEFAULT_RESERVATION_SETTINGS,
  tables: [{ seats: 2, count: 2 }, { seats: 4, count: 2 }, { seats: 6, count: 2 }],
  hours: { 0: WEEKEND, 1: WEEKDAY, 2: WEEKDAY, 3: WEEKDAY, 4: WEEKDAY, 5: WEEKEND, 6: WEEKEND }
};

// Quinta 22/10/2026, 15:00 em Brasília.
const THURSDAY_3PM = toInstant('2026-10-22', '15:00');

// Conversas em memória (a tabela reservation_conversations) + uma "loja" de reservas falsa.
function setup({ settings = MALIBU, now = THURSDAY_3PM, reservations = [], pausedUntil = null, takeSlotOnce = false } = {}) {
  const conversations = [];
  let nextConv = 1;
  const state = { now, pausedUntil, reservations: reservations.map((r, i) => ({ id: i + 1, status: 'confirmed', contact_id: 3, ...r })) };
  let failOnce = takeSlotOnce;
  const db = {
    query: async (sql, params = []) => {
      if (/SELECT \* FROM reservation_conversations/.test(sql)) {
        const [clientId, contactId] = params;
        // Cópias, como um banco de verdade: quem leu não vê a gravação de outro por referência.
        return { rows: conversations.filter((c) => c.client_id === clientId && c.contact_id === contactId && c.status === 'active').map((c) => ({ ...c, data: { ...c.data } })) };
      }
      if (/INSERT INTO reservation_conversations/.test(sql)) {
        const [client_id, contact_id, step, data] = params;
        if (conversations.some((c) => c.client_id === client_id && c.contact_id === contact_id && c.status === 'active')) {
          const err = new Error('duplicate'); err.code = '23505'; throw err;
        }
        const c = { id: nextConv++, client_id, contact_id, status: 'active', step, data: JSON.parse(data), attempts: 0, updated_at: state.now };
        conversations.push(c);
        return { rows: [c] };
      }
      if (/UPDATE reservation_conversations SET step/.test(sql)) {
        const [step, data, attempts, id] = params;
        Object.assign(conversations.find((c) => c.id === id), { step, data: JSON.parse(data), attempts, updated_at: state.now });
        return { rows: [] };
      }
      if (/UPDATE reservation_conversations SET status = \?/.test(sql)) {
        const [status, id] = params;
        conversations.find((c) => c.id === id).status = status;
        return { rows: [] };
      }
      return { rows: [] };
    }
  };
  const sent = [];
  const events = [];
  const paused = [];
  const deps = {
    db,
    now: () => state.now,
    typing: async () => {},
    send: async (m) => { sent.push(m); return 'w'; },
    broadcast: (clientId, name, data) => events.push({ name, data }),
    loadSettings: async () => settings,
    isBotPaused: async () => Boolean(state.pausedUntil) && state.pausedUntil > state.now,
    pauseBot: async (_db, args) => {
      paused.push(args);
      state.pausedUntil = new Date(state.now.getTime() + 12 * 3600e3);
      for (const c of conversations) if (c.status === 'active') c.status = 'handed_off';
    },
    listReservations: async () => state.reservations.filter((r) => ['confirmed', 'arrived'].includes(r.status)),
    upcomingReservations: async () => state.reservations.filter((r) => r.status === 'confirmed' && r.starts_at > state.now),
    createReservation: async (_db, args) => {
      if (failOnce) {
        failOnce = false;
        // Outra pessoa levou o horário: ocupa todas as mesas de 4 e 6 nele.
        for (const seats of [4, 4, 6, 6]) {
          state.reservations.push({ id: 100 + seats, table_seats: seats, starts_at: args.startsAt, ends_at: new Date(args.startsAt.getTime() + 7200e3), status: 'confirmed', contact_id: 99 });
        }
        throw new SlotTakenError();
      }
      const r = { id: state.reservations.length + 1, status: 'confirmed', ...args, contact_id: args.contactId, starts_at: args.startsAt };
      state.reservations.push(r);
      return r;
    },
    setReservationStatus: async (_db, { id, status }) => {
      const r = state.reservations.find((x) => x.id === id);
      r.status = status;
      return r;
    }
  };
  const say = (body, extra = {}) => handleInboundForReservation({
    clientId: 9, contactId: 3, waId: '5511999998888', profileName: 'Ana Souza', body,
    fromAd: false, isNewContact: false, restaurantName: 'Malibu', ...extra
  }, deps);
  const last = () => sent.at(-1)?.body;
  return { say, sent, last, state, conversations, events, paused, deps };
}

test('fluxo completo: RESERVA → 4 → sábado → 2 → sim → sim', async () => {
  const { say, sent, last, state } = setup();
  assert.equal(await say('Quero fazer uma reserva (cód. RESERVA)'), 'asked_size');
  assert.equal(last(), 'Olá, Ana! Quer fazer uma reserva no Malibu? Pra quantas pessoas?');
  assert.equal(await say('4'), 'asked_day');
  assert.equal(await say('sábado'), 'asked_time');
  assert.match(last(), /^Pra sábado 24\/10 tenho: 1\) 12h  2\) 12h30/);
  assert.equal(await say('2'), 'asked_name');
  assert.equal(last(), 'A reserva fica em nome de Ana? Responda SIM ou mande outro nome.');
  assert.equal(await say('sim'), 'asked_confirm');
  assert.equal(last(), 'Confirmando: sábado 24/10, 12h30, 4 pessoas, em nome de Ana Souza. Responda SIM pra confirmar.');
  assert.equal(await say('sim'), 'confirmed');
  assert.match(last(), /^✅ Reserva confirmada: sábado 24\/10, 12h30, 4 pessoas, em nome de Ana Souza\. A mesa fica guardada até 15 min/);
  const r = state.reservations.at(-1);
  assert.equal(r.partySize, 4);
  assert.equal(r.source, 'whatsapp');
  assert.equal(r.phone, '5511999998888');
  assert.equal(r.startsAt.toISOString(), toInstant('2026-10-24', '12:30').toISOString());
  assert.ok(sent.every((m) => m.sentBy === 'bot_reserva'));
});

test('outro nome na etapa do nome', async () => {
  const { say, last } = setup();
  await say('RESERVA'); await say('2'); await say('amanhã'); await say('1');
  assert.equal(await say('Carlos Lima'), 'asked_confirm');
  assert.match(last(), /em nome de Carlos Lima/);
});

test('sem nome de perfil, pergunta o nome', async () => {
  const { say, last } = setup();
  await say('RESERVA', { profileName: null });
  await say('2', { profileName: null }); await say('amanhã', { profileName: null });
  assert.equal(await say('1', { profileName: null }), 'asked_name');
  assert.equal(last(), 'Em nome de quem fica a reserva?');
});

test('mensagem comum sem conversa é ignorada', async () => {
  const { say, sent } = setup();
  assert.equal(await say('vocês aceitam reserva pra sábado?'), 'ignored');
  assert.equal(sent.length, 0);
});

test('duas mensagens RESERVA juntas → uma conversa e um askSize', async () => {
  const { say, sent, conversations } = setup();
  const results = await Promise.all([say('RESERVA'), say('RESERVA')]);
  assert.deepEqual(results.sort(), ['asked_size', 'ignored']);
  assert.equal(conversations.length, 1);
  assert.equal(sent.length, 1);
});

test('pausado não responde nada, nem CANCELAR', async () => {
  const { say, sent } = setup({
    pausedUntil: new Date(THURSDAY_3PM.getTime() + 3600e3),
    reservations: [{ table_seats: 4, starts_at: toInstant('2026-10-24', '20:00'), ends_at: toInstant('2026-10-24', '22:00') }]
  });
  assert.equal(await say('RESERVA'), 'paused');
  assert.equal(await say('cancelar'), 'paused');
  assert.equal(sent.length, 0);
});

test('robô desligado não responde', async () => {
  const { say, sent } = setup({ settings: { ...MALIBU, bot_enabled: false } });
  assert.equal(await say('RESERVA'), 'ignored');
  assert.equal(sent.length, 0);
});

test('atendente responde durante o "digitando" → não envia', async () => {
  const s = setup();
  s.deps.typing = async () => { s.state.pausedUntil = new Date(s.state.now.getTime() + 3600e3); };
  await s.say('RESERVA');
  assert.equal(s.sent.length, 0);
});

test('2 respostas não entendidas → handoff e pausa', async () => {
  const { say, last, paused, events, conversations } = setup();
  await say('RESERVA');
  assert.equal(await say('não sei ainda'), 'asked_size_again');
  assert.equal(last(), 'Me manda só o número de pessoas, por exemplo: 4');
  assert.equal(await say('hmm'), 'handoff');
  assert.equal(last(), 'Só um instante, já te respondo 🙂');
  assert.deepEqual(paused, [{ clientId: 9, contactId: 3, now: THURSDAY_3PM }]);
  assert.ok(events.some((e) => e.name === 'reservation' && e.data.needsAttention === true && e.data.contactId === 3));
  assert.equal(conversations[0].status, 'handed_off');
});

test('grupo de 8 → handoff', async () => {
  const { say, last } = setup();
  await say('RESERVA');
  assert.equal(await say('somos 8'), 'handoff');
  assert.equal(last(), 'Só um instante, já te respondo 🙂');
});

test('"hoje" às 22:00 sugere o próximo dia com vaga', async () => {
  const { say, last } = setup({ now: toInstant('2026-10-22', '22:00') });
  await say('RESERVA'); await say('2');
  assert.equal(await say('hoje'), 'asked_time');
  assert.match(last(), /^Pra hoje \(22\/10\) não tenho mais mesa pra 2 pessoas\. Tenho amanhã \(23\/10\): 1\) 12h/);
});

test('dia fechado pede outro dia', async () => {
  const { say, last } = setup({ settings: { ...MALIBU, exceptions: [{ date: '2026-10-24', closed: true }] } });
  await say('RESERVA'); await say('2');
  assert.equal(await say('sábado'), 'day_unavailable');
  assert.equal(last(), 'Pra sábado 24/10 não temos reserva. Pra qual outro dia?');
});

test('conversa parada há 61 min expira; RESERVA recomeça', async () => {
  const s = setup();
  await s.say('RESERVA'); await s.say('2');
  s.state.now = new Date(s.state.now.getTime() + EXPIRE_MS + 60e3);
  assert.equal(await s.say('amanhã'), 'ignored');
  assert.equal(s.conversations[0].status, 'expired');
  assert.equal(await s.say('RESERVA'), 'asked_size');
});

test('SlotTakenError na confirmação volta pro horário com lista nova', async () => {
  const { say, last } = setup({ takeSlotOnce: true });
  await say('RESERVA'); await say('4'); await say('sábado'); await say('2'); await say('sim');
  assert.equal(await say('sim'), 'slot_taken');
  // As mesas de 4 e 6 ficaram ocupadas das 12h30 às 14h30: sobra 14h30 em diante.
  assert.match(last(), /^Esse horário acabou de ser reservado\. Pra sábado 24\/10 ainda tenho: 1\) 14h30  2\) 18h/);
  assert.equal(await say('1'), 'asked_name');
});

test('CANCELAR durante a conversa encerra sem reservar', async () => {
  const { say, last, conversations } = setup();
  await say('RESERVA'); await say('2');
  assert.equal(await say('cancelar'), 'aborted');
  assert.equal(last(), 'Tudo bem, não fiz a reserva. Se quiser, é só mandar RESERVA.');
  assert.equal(conversations[0].status, 'done');
});

test('CANCELAR com 1 reserva futura pede SIM e cancela', async () => {
  const { say, last, state } = setup({ reservations: [{ table_seats: 4, starts_at: toInstant('2026-10-24', '20:00'), ends_at: toInstant('2026-10-24', '22:00') }] });
  assert.equal(await say('Cancelar'), 'cancel_asked');
  assert.equal(last(), 'Quer cancelar a reserva de sábado 24/10, 20h? Responda SIM.');
  assert.equal(await say('sim'), 'cancelled');
  assert.equal(state.reservations[0].status, 'cancelled');
  assert.equal(last(), 'Reserva cancelada. Se quiser marcar de novo, é só mandar RESERVA.');
});

test('CANCELAR com 2 reservas futuras pergunta qual', async () => {
  const { say, last, state } = setup({ reservations: [
    { table_seats: 4, starts_at: toInstant('2026-10-24', '20:00'), ends_at: toInstant('2026-10-24', '22:00') },
    { table_seats: 2, starts_at: toInstant('2026-10-25', '13:00'), ends_at: toInstant('2026-10-25', '15:00') }
  ] });
  assert.equal(await say('cancelar reserva'), 'cancel_asked');
  assert.equal(last(), 'Qual reserva você quer cancelar? 1) sábado 24/10, 20h  2) domingo 25/10, 13h');
  assert.equal(await say('2'), 'cancel_asked');
  assert.equal(await say('sim'), 'cancelled');
  assert.equal(state.reservations[1].status, 'cancelled');
  assert.equal(state.reservations[0].status, 'confirmed');
});

test('"posso cancelar o pedido?" com reserva futura é ignorado', async () => {
  const { say, sent } = setup({ reservations: [{ table_seats: 4, starts_at: toInstant('2026-10-24', '20:00'), ends_at: toInstant('2026-10-24', '22:00') }] });
  assert.equal(await say('posso cancelar o pedido?'), 'ignored');
  assert.equal(sent.length, 0);
});

test('ad_fallback ligado: contato novo de anúncio sem código recebe a pergunta 1/2', async () => {
  const { say, last } = setup({ settings: { ...MALIBU, ad_fallback: true } });
  assert.equal(await say('Oi, vi o anúncio', { fromAd: true, isNewContact: true }), 'asked_fallback');
  assert.equal(last(), 'Quer fazer uma reserva? Responda 1 pra reservar ou 2 pra falar com a gente.');
  assert.equal(await say('1'), 'asked_size');
});

test('ad_fallback: resposta 2 encerra sem mandar nada', async () => {
  const { say, sent } = setup({ settings: { ...MALIBU, ad_fallback: true } });
  await say('Oi', { fromAd: true, isNewContact: true });
  assert.equal(await say('2'), 'to_staff');
  assert.equal(sent.length, 1);
});

test('ad_fallback desligado ou contato antigo: não pergunta', async () => {
  assert.equal(await setup().say('Oi', { fromAd: true, isNewContact: true }), 'ignored');
  assert.equal(await setup({ settings: { ...MALIBU, ad_fallback: true } }).say('Oi', { fromAd: true, isNewContact: false }), 'ignored');
});

test('falha de envio não derruba o fluxo', async () => {
  const s = setup();
  s.deps.send = async () => { throw new Error('WhatsApp caiu'); };
  assert.equal(await s.say('RESERVA'), 'asked_size');
  assert.equal(s.conversations[0].step, 'size');
});

test('"não" na pergunta do nome pede o nome, não vira o nome', async () => {
  const { say, last } = setup();
  await say('RESERVA'); await say('2'); await say('amanhã'); await say('1');
  assert.equal(await say('não'), 'asked_name');
  assert.equal(last(), 'Em nome de quem fica a reserva?');
  assert.equal(await say('Bruno'), 'asked_confirm');
  assert.match(last(), /em nome de Bruno\./);
});

test('mensagens seguidas do mesmo contato são tratadas em ordem, uma de cada vez', async () => {
  const s = setup();
  // Banco lento: cada consulta espera um pouco, como no Supabase de verdade.
  const query = s.deps.db.query;
  s.deps.db.query = async (sql, params) => { await new Promise((r) => setTimeout(r, 5)); return query(sql, params); };
  await s.say('RESERVA');
  const results = await Promise.all([s.say('4'), s.say('sábado')]);
  assert.deepEqual(results, ['asked_day', 'asked_time']);
  assert.equal(s.conversations[0].step, 'time');
});

test('pausa que chega enquanto a conversa começa: a conversa já nasce com a equipe', async () => {
  const s = setup();
  let calls = 0;
  // 1ª checagem (entrada): livre; depois disso a equipe pausou.
  s.deps.isBotPaused = async () => (calls++ > 0);
  assert.equal(await s.say('RESERVA'), 'paused');
  assert.equal(s.conversations[0].status, 'handed_off');
  assert.equal(s.sent.length, 0);
});

test('"sábado" num sábado depois do último horário vai pro próximo sábado', async () => {
  const { say, last } = setup({ now: toInstant('2026-10-24', '22:00') });
  await say('RESERVA'); await say('2');
  assert.equal(await say('sábado'), 'asked_time');
  assert.match(last(), /^Pra sábado 31\/10 tenho: 1\) 12h/);
});

test('"não" na confirmação volta pra escolher o horário', async () => {
  const { say, last, conversations } = setup();
  await say('RESERVA'); await say('2'); await say('amanhã'); await say('1'); await say('sim');
  assert.equal(await say('não'), 'asked_time');
  assert.match(last(), /^Pra amanhã \(23\/10\) tenho: 1\) 12h/);
  assert.equal(conversations[0].status, 'active');
});

test('CANCELAR com 2 reservas: resposta errada repete a lista', async () => {
  const { say, last } = setup({ reservations: [
    { table_seats: 4, starts_at: toInstant('2026-10-24', '20:00'), ends_at: toInstant('2026-10-24', '22:00') },
    { table_seats: 2, starts_at: toInstant('2026-10-25', '13:00'), ends_at: toInstant('2026-10-25', '15:00') }
  ] });
  await say('cancelar');
  assert.equal(await say('a de sábado'), 'asked_cancel_pick_again');
  assert.equal(last(), 'Qual reserva você quer cancelar? 1) sábado 24/10, 20h  2) domingo 25/10, 13h');
});
