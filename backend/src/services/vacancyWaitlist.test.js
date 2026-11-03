import { test } from 'node:test';
import assert from 'node:assert/strict';
import { offerVacancies, OFFER_HOLD_MS } from './vacancyWaitlist.js';
import { DEFAULT_RESERVATION_SETTINGS } from './reservationSlots.js';
import { DEFAULT_FOLLOWUP_SETTINGS } from './followupText.js';
import { isWaitCommand } from './reservationText.js';

// Quinta 5/11/2026 12:00 em Brasília; o sábado 7/11 tem uma mesa de 4 e turno das 18h às 20h.
const NOW = new Date('2026-11-05T15:00:00Z');
const SETTINGS = {
  ...DEFAULT_RESERVATION_SETTINGS,
  tables: [{ seats: 4, count: 1 }],
  hours: { ...DEFAULT_RESERVATION_SETTINGS.hours, 6: [{ start: '18:00', lastBooking: '20:00' }] },
  bot_enabled: true,
  followup: { ...DEFAULT_FOLLOWUP_SETTINGS, vacancy_enabled: true }
};

function setup({ waiters, reservations = [], conflict = false, settings = SETTINGS, paused = false, sendFails = false, now = NOW }) {
  const state = { waiters: waiters.map((w) => ({ ...w })), conversations: [], sent: [] };
  const db = {
    query: async (sql, params = []) => {
      if (/UPDATE reservation_waiters SET status = 'expired'\s+WHERE client_id/.test(sql)) return { rows: [] };
      if (/UPDATE reservation_waiters w SET status = 'booked'/.test(sql)) return { rows: [] };
      if (/FROM reservation_waiters w/.test(sql)) return { rows: state.waiters.filter((w) => ['waiting', 'notified'].includes(w.status)) };
      if (/INSERT INTO reservation_conversations/.test(sql)) {
        if (conflict) { const e = new Error('dup'); e.code = '23505'; throw e; }
        state.conversations.push(JSON.parse(params[2]));
        return { rows: [] };
      }
      if (/SET status = 'notified'/.test(sql)) {
        const w = state.waiters.find((x) => x.id === params[1] && x.status === 'waiting');
        if (!w) return { rows: [] };
        w.status = 'notified'; w.notified_at = params[0];
        return { rows: [{ id: w.id }] };
      }
      if (/SET status = 'expired' WHERE id = \?/.test(sql)) {
        state.waiters.find((x) => x.id === params[0]).status = 'expired';
        return { rows: [] };
      }
      if (/SET status = 'waiting', notified_at = NULL/.test(sql)) {
        const w = state.waiters.find((x) => x.id === params[0]); w.status = 'waiting'; w.notified_at = null;
        return { rows: [] };
      }
      if (/UPDATE reservation_conversations SET status = 'expired'/.test(sql)) { state.conversations.pop(); return { rows: [] }; }
      throw new Error('SQL inesperado: ' + sql);
    }
  };
  const deps = {
    db, now: () => now,
    loadSettings: async () => settings,
    listReservations: async () => reservations,
    isBotPaused: async () => paused,
    send: async (m) => { if (sendFails) throw new Error('off'); state.sent.push(m); }
  };
  return { state, deps };
}

const waiter = (over = {}) => ({
  id: 1, client_id: 9, contact_id: 3, day_text: '2026-11-07', party_size: 4, name: 'Carlos Lima', profile_name: 'Carlos',
  restaurant_name: 'Malibu', status: 'waiting', notified_at: null, created_at: new Date('2026-11-04T12:00:00Z'), ...over
});

const FULL = [{ id: 50, status: 'confirmed', table_seats: 4, starts_at: new Date('2026-11-07T21:00:00Z'), ends_at: new Date('2026-11-07T23:00:00Z') }];

test('mesa livre: avisa o primeiro da fila e abre a conversa no passo do horário', async () => {
  const { state, deps } = setup({ waiters: [waiter()] });
  assert.equal(await offerVacancies(9, deps), 1);
  assert.equal(state.sent.length, 1);
  assert.match(state.sent[0].body, /Abriu uma mesa/);
  assert.match(state.sent[0].body, /1\) 18h/);
  assert.equal(state.sent[0].sentBy, 'bot_reserva');
  assert.deepEqual(state.conversations[0], { size: 4, day: '2026-11-07', options: ['18:00', '18:30', '19:00', '19:30', '20:00'] });
  assert.equal(state.waiters[0].status, 'notified');
});

test('dia ainda lotado: não avisa', async () => {
  // reserva das 18h (21h UTC) ocupa a única mesa por 2h: 18:00 a 19:30 ficam sem vaga, mas 20h abre
  const { state, deps } = setup({ waiters: [waiter()], reservations: FULL });
  assert.equal(await offerVacancies(9, deps), 1);
  assert.deepEqual(state.conversations[0].options, ['20:00']);
  const none = setup({
    waiters: [waiter()],
    reservations: [{ ...FULL[0], ends_at: new Date('2026-11-08T03:00:00Z') }]
  });
  assert.equal(await offerVacancies(9, none.deps), 0);
});

test('só um aviso por dia enquanto a oferta está valendo; depois passa pro próximo', async () => {
  const { state, deps } = setup({ waiters: [waiter(), waiter({ id: 2, contact_id: 4, name: 'Ana Souza', profile_name: 'Ana' })] });
  assert.equal(await offerVacancies(9, deps), 1);
  assert.equal(state.sent.length, 1);
  assert.equal(await offerVacancies(9, deps), 0); // o primeiro ainda tem a vaga
  const later = new Date(NOW.getTime() + OFFER_HOLD_MS + 60e3);
  const next = setup({
    waiters: [waiter({ status: 'notified', notified_at: NOW }), waiter({ id: 2, contact_id: 4, profile_name: 'Ana', name: 'Ana Souza' })],
    now: later
  });
  assert.equal(await offerVacancies(9, next.deps), 1);
  assert.equal(next.state.waiters[0].status, 'expired');
  assert.match(next.state.sent[0].body, /Ana/);
});

test('desligado, fora do horário, pausado ou já em conversa: não avisa', async () => {
  const off = setup({ waiters: [waiter()], settings: { ...SETTINGS, followup: { ...SETTINGS.followup, vacancy_enabled: false } } });
  assert.equal(await offerVacancies(9, off.deps), 0);
  const night = setup({ waiters: [waiter()], now: new Date('2026-11-06T04:00:00Z') }); // 01h local
  assert.equal(await offerVacancies(9, night.deps), 0);
  const paused = setup({ waiters: [waiter()], paused: true });
  assert.equal(await offerVacancies(9, paused.deps), 0);
  const busy = setup({ waiters: [waiter()], conflict: true });
  assert.equal(await offerVacancies(9, busy.deps), 0);
  assert.equal(busy.state.waiters[0].status, 'waiting');
});

test('falha no envio devolve a pessoa pra fila', async () => {
  const { state, deps } = setup({ waiters: [waiter()], sendFails: true });
  assert.equal(await offerVacancies(9, deps), 0);
  assert.equal(state.waiters[0].status, 'waiting');
  assert.equal(state.conversations.length, 0);
});

test('AVISAR é reconhecido só como pedido curto', () => {
  for (const ok of ['AVISAR', 'Avisar', 'me avisa', 'pode me avisar', 'quero ser avisado', 'lista de espera']) assert.equal(isWaitCommand(ok), true, ok);
  for (const no of ['sábado', '2', 'quero avisar que vou atrasar muito hoje de noite por favor', 'sim']) assert.equal(isWaitCommand(no), false, no);
});
