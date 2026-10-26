import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleInboundForInfo, REPEAT_WINDOW_MS } from './infoBot.js';
import { DEFAULT_INFO_SETTINGS } from './infoText.js';

const NOW = new Date('2026-10-26T15:00:00Z');
const INFO = {
  ...DEFAULT_INFO_SETTINGS,
  enabled: true,
  menu: 'Aqui está o nosso cardápio 🍣\nhttps://cardapio.example',
  prices: 'Rodízio a partir de R$ 129.',
  hours: 'Abrimos às 17h.',
  location: 'Estamos na R. C-248, 284.'
};

function setup({ info = INFO, paused = false, upcoming = [], activeReservation = false, recent = [] } = {}) {
  const replies = recent.map((topic) => ({ topic, sent_at: new Date(NOW.getTime() - 3600e3) }));
  const db = {
    query: async (sql, params = []) => {
      if (/FROM info_replies/.test(sql)) {
        const [, since] = params;
        return { rows: replies.filter((r) => r.sent_at > since).map((r) => ({ topic: r.topic })) };
      }
      if (/INSERT INTO info_replies/.test(sql)) {
        replies.push({ topic: params[2], sent_at: NOW });
        return { rows: [] };
      }
      if (/FROM reservation_conversations/.test(sql)) return { rows: activeReservation ? [{ 1: 1 }] : [] };
      return { rows: [] };
    }
  };
  const sent = [];
  const deps = {
    db,
    now: () => NOW,
    typing: async () => {},
    send: async (m) => { sent.push(m); return 'w'; },
    loadSettings: async () => ({ bot_enabled: true, info }),
    isBotPaused: async () => paused,
    upcomingReservations: async () => upcoming
  };
  const say = (body) => handleInboundForInfo({ clientId: 9, contactId: 3, waId: '5562999990000', profileName: 'Carlos Eduardo', body }, deps);
  return { say, sent, deps };
}

const HINT = DEFAULT_INFO_SETTINGS.reserveHint;

test('cardápio: manda o texto do restaurante e convida pra reservar', async () => {
  const { say, sent } = setup();
  assert.equal(await say('Quero ver o cardápio'), 'answered');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].body, `Aqui está o nosso cardápio 🍣\nhttps://cardapio.example\n\n${HINT}`);
  assert.equal(sent[0].sentBy, 'bot_info');
});

test('duas perguntas na mesma mensagem: duas respostas, convite só no fim', async () => {
  const { say, sent } = setup();
  assert.equal(await say('Preço? Localização?'), 'answered');
  assert.deepEqual(sent.map((m) => m.body), ['Rodízio a partir de R$ 129.', `Estamos na R. C-248, 284.\n\n${HINT}`]);
});

test('o mesmo assunto não se repete em 12h, mesmo mandado 3 vezes seguidas', async () => {
  const { say, sent } = setup();
  const results = await Promise.all([say('Quero ver o cardápio'), say('Quero ver o cardápio'), say('Quero ver o cardápio')]);
  assert.deepEqual(results, ['answered', 'repeated', 'repeated']);
  assert.equal(sent.length, 1);
});

test('assunto respondido há mais de 12h responde de novo', async () => {
  const s = setup({ recent: ['menu'] });
  assert.equal(await s.say('Quero ver o cardápio'), 'repeated');
  s.deps.now = () => new Date(NOW.getTime() + REPEAT_WINDOW_MS);
  assert.equal(await s.say('Quero ver o cardápio'), 'answered');
});

test('equipe já respondeu (robô pausado): não responde', async () => {
  const { say, sent } = setup({ paused: true });
  assert.equal(await say('Onde vocês ficam?'), 'paused');
  assert.equal(sent.length, 0);
});

test('desligado ou sem texto daquele assunto: não responde', async () => {
  const off = setup({ info: { ...INFO, enabled: false } });
  assert.equal(await off.say('Quero ver o cardápio'), 'ignored');
  const noMenu = setup({ info: { ...INFO, menu: '' } });
  assert.equal(await noMenu.say('Quero ver o cardápio'), 'ignored');
  assert.equal(noMenu.sent.length, 0);
});

test('quem já tem reserva ou está no meio de uma não recebe o convite', async () => {
  const booked = setup({ upcoming: [{ id: 1 }] });
  await booked.say('Onde vocês ficam?');
  assert.equal(booked.sent[0].body, 'Estamos na R. C-248, 284.');
  const booking = setup({ activeReservation: true });
  await booking.say('Quero ver o cardápio');
  assert.equal(booking.sent[0].body, 'Aqui está o nosso cardápio 🍣\nhttps://cardapio.example');
});

test('"Tenho outra dúvida": responde na hora, sem convite', async () => {
  const { say, sent } = setup();
  assert.equal(await say('Tenho outra dúvida'), 'answered');
  assert.deepEqual(sent.map((m) => m.body), ['Claro, pode mandar sua dúvida 🙂']);
});

test('mensagem comum não é respondida', async () => {
  const { say, sent } = setup();
  assert.equal(await say('ola'), 'ignored');
  assert.equal(await say('2'), 'ignored');
  assert.equal(sent.length, 0);
});

test('equipe responde durante o "digitando": não envia', async () => {
  const s = setup();
  let calls = 0;
  s.deps.isBotPaused = async () => calls++ > 0;
  assert.equal(await s.say('Quero ver o cardápio'), 'paused');
  assert.equal(s.sent.length, 0);
});
