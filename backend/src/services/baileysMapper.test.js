import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapBaileysMessageToEvent, isUsableMessage } from './baileysMapper.js';

test('mapBaileysMessageToEvent extrai texto simples (conversation)', () => {
  const msg = {
    key: { remoteJid: '5511999998888@s.whatsapp.net', id: 'ABCD1234', fromMe: false },
    pushName: 'Maria Teste',
    messageTimestamp: 1760000000,
    message: { conversation: 'Oi, quero reservar' }
  };

  const event = mapBaileysMessageToEvent(msg);

  assert.equal(event.waId, '5511999998888');
  assert.equal(event.profileName, 'Maria Teste');
  assert.equal(event.waMessageId, 'ABCD1234');
  assert.equal(event.direction, 'inbound');
  assert.equal(event.body, 'Oi, quero reservar');
  assert.equal(event.sentAt, new Date(1760000000 * 1000).toISOString());
  assert.equal(event.ctwaClid, null);
});

test('mapBaileysMessageToEvent extrai texto de extendedTextMessage (mensagem com link/resposta)', () => {
  const msg = {
    key: { remoteJid: '5511988887777@s.whatsapp.net', id: 'XYZ999', fromMe: false },
    pushName: 'Joao',
    messageTimestamp: 1760000100,
    message: { extendedTextMessage: { text: 'Vocês têm mesa hoje?' } }
  };

  const event = mapBaileysMessageToEvent(msg);
  assert.equal(event.body, 'Vocês têm mesa hoje?');
});

test('mapBaileysMessageToEvent marca direction outbound quando fromMe e true', () => {
  const msg = {
    key: { remoteJid: '5511999998888@s.whatsapp.net', id: 'OUT1', fromMe: true },
    messageTimestamp: 1760000200,
    message: { conversation: 'Oi! Temos mesa sim.' }
  };

  const event = mapBaileysMessageToEvent(msg);
  assert.equal(event.direction, 'outbound');
});

test('isUsableMessage retorna false quando nao ha conteudo de mensagem', () => {
  const msg = { key: { remoteJid: '5511999998888@s.whatsapp.net', id: 'E1', fromMe: false } };
  assert.equal(isUsableMessage(msg), false);
});

test('isUsableMessage retorna false quando nao consegue extrair wa_id', () => {
  const msg = { key: { remoteJid: null, id: 'E2', fromMe: false }, message: { conversation: 'oi' } };
  assert.equal(isUsableMessage(msg), false);
});

test('isUsableMessage retorna true pra figurinha (toda mensagem real do contato deve aparecer)', () => {
  const msg = {
    key: { remoteJid: '5511999998888@s.whatsapp.net', id: 'E3', fromMe: false },
    message: { stickerMessage: {} }
  };
  assert.equal(isUsableMessage(msg), true);
});

test('isUsableMessage retorna true pra mensagem de texto normal', () => {
  const msg = {
    key: { remoteJid: '5511999998888@s.whatsapp.net', id: 'E4', fromMe: false },
    message: { conversation: 'oi' }
  };
  assert.equal(isUsableMessage(msg), true);
});

test('isUsableMessage retorna false pra reacao (emoji reagindo a outra mensagem, nao e mensagem nova)', () => {
  const msg = {
    key: { remoteJid: '5511999998888@s.whatsapp.net', id: 'E5', fromMe: false },
    message: { reactionMessage: { text: '👍' } }
  };
  assert.equal(isUsableMessage(msg), false);
});

test('mapBaileysMessageToEvent usa legenda da imagem quando tem', () => {
  const msg = {
    key: { remoteJid: '5511999998888@s.whatsapp.net', id: 'IMG1', fromMe: false },
    messageTimestamp: 1760000300,
    message: { imageMessage: { caption: 'Olha essa mesa!' } }
  };
  assert.equal(mapBaileysMessageToEvent(msg).body, 'Olha essa mesa!');
});

test('mapBaileysMessageToEvent usa rotulo generico quando a imagem nao tem legenda', () => {
  const msg = {
    key: { remoteJid: '5511999998888@s.whatsapp.net', id: 'IMG2', fromMe: false },
    messageTimestamp: 1760000400,
    message: { imageMessage: {} }
  };
  assert.equal(mapBaileysMessageToEvent(msg).body, '📷 Imagem');
});

test('mapBaileysMessageToEvent usa rotulo de audio/mensagem de voz', () => {
  const msg = {
    key: { remoteJid: '5511999998888@s.whatsapp.net', id: 'AUD1', fromMe: false },
    messageTimestamp: 1760000500,
    message: { audioMessage: { ptt: true } }
  };
  assert.equal(mapBaileysMessageToEvent(msg).body, '🎤 Mensagem de voz');
});

test('mapBaileysMessageToEvent usa rotulo de figurinha', () => {
  const msg = {
    key: { remoteJid: '5511999998888@s.whatsapp.net', id: 'STK1', fromMe: false },
    messageTimestamp: 1760000600,
    message: { stickerMessage: {} }
  };
  assert.equal(mapBaileysMessageToEvent(msg).body, '😊 Figurinha');
});
