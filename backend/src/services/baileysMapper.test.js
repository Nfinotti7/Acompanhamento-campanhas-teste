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

test('mapBaileysMessageToEvent usa o numero real (remoteJidAlt) quando remoteJid e um LID', () => {
  const msg = {
    key: { remoteJid: '145517938012378@lid', remoteJidAlt: '5517938012378@s.whatsapp.net', id: 'LID1', fromMe: false },
    messageTimestamp: 1760000700,
    message: { conversation: 'oi' }
  };
  assert.equal(mapBaileysMessageToEvent(msg).waId, '5517938012378');
});

test('mapBaileysMessageToEvent usa o LID mesmo assim se nao tiver remoteJidAlt (sem numero real disponivel)', () => {
  const msg = {
    key: { remoteJid: '145517938012378@lid', id: 'LID2', fromMe: false },
    messageTimestamp: 1760000800,
    message: { conversation: 'oi' }
  };
  assert.equal(mapBaileysMessageToEvent(msg).waId, '145517938012378');
});

test('mapBaileysMessageToEvent identifica tipo, mimetype e nome de arquivo da midia', () => {
  const base = { key: { remoteJid: '5511999998888@s.whatsapp.net', id: 'M1', fromMe: false }, messageTimestamp: 1760000900 };

  const img = mapBaileysMessageToEvent({ ...base, message: { imageMessage: { mimetype: 'image/jpeg' } } });
  assert.equal(img.mediaType, 'image');
  assert.equal(img.mimeType, 'image/jpeg');

  const audio = mapBaileysMessageToEvent({ ...base, message: { audioMessage: { mimetype: 'audio/ogg; codecs=opus', ptt: true } } });
  assert.equal(audio.mediaType, 'audio');

  const doc = mapBaileysMessageToEvent({ ...base, message: { documentMessage: { mimetype: 'application/pdf', fileName: 'cardapio.pdf' } } });
  assert.equal(doc.mediaType, 'document');
  assert.equal(doc.filename, 'cardapio.pdf');

  const sticker = mapBaileysMessageToEvent({ ...base, message: { stickerMessage: { mimetype: 'image/webp' } } });
  assert.equal(sticker.mediaType, 'sticker');

  const text = mapBaileysMessageToEvent({ ...base, message: { conversation: 'oi' } });
  assert.equal(text.mediaType, null);
});

test('isUsableMessage usa o numero real (remoteJidAlt) pra validar LID', () => {
  const msg = {
    key: { remoteJid: '145517938012378@lid', remoteJidAlt: '5517938012378@s.whatsapp.net', id: 'LID3', fromMe: false },
    message: { conversation: 'oi' }
  };
  assert.equal(isUsableMessage(msg), true);
});

test('mensagem vinda de anuncio (Clique para WhatsApp) traz id do anuncio e do clique', () => {
  const msg = {
    key: { remoteJid: '5511999998888@s.whatsapp.net', id: 'AD1', fromMe: false },
    messageTimestamp: 1760000000,
    message: {
      extendedTextMessage: {
        text: 'Olá! Tenho interesse e queria mais informações, por favor.',
        contextInfo: {
          externalAdReply: {
            title: 'Rodízio de sushi',
            body: 'Reserve sua mesa',
            sourceType: 'ad',
            sourceId: '120200000000001',
            sourceUrl: 'https://fb.me/abc',
            thumbnailUrl: 'https://scontent.example/thumb.jpg',
            thumbnail: Buffer.from('bytes-grandes'),
            ctwaClid: 'CLID_XYZ'
          }
        }
      }
    }
  };

  const event = mapBaileysMessageToEvent(msg);

  assert.equal(event.adId, '120200000000001');
  assert.equal(event.ctwaClid, 'CLID_XYZ');
  assert.equal(event.adHeadline, 'Rodízio de sushi');
  assert.equal(event.adBody, 'Reserve sua mesa');
  assert.equal(event.adSourceUrl, 'https://fb.me/abc');
  assert.equal(event.referral.source_id, '120200000000001');
  assert.equal(event.referral.thumbnail, undefined); // bytes da miniatura não vão pro banco
  assert.equal(event.body, 'Olá! Tenho interesse e queria mais informações, por favor.');
});

test('cartao de anuncio tambem e lido em mensagem de imagem', () => {
  const msg = {
    key: { remoteJid: '5511999998888@s.whatsapp.net', id: 'AD2', fromMe: false },
    message: { imageMessage: { caption: 'oi', contextInfo: { externalAdReply: { sourceType: 'ad', sourceId: 'AD_9' } } } }
  };
  const event = mapBaileysMessageToEvent(msg);
  assert.equal(event.adId, 'AD_9');
  assert.equal(event.ctwaClid, null);
});

test('preview de link comum (externalAdReply sem ser anuncio) nao conta como anuncio', () => {
  const msg = {
    key: { remoteJid: '5511999998888@s.whatsapp.net', id: 'L1', fromMe: false },
    message: { extendedTextMessage: { text: 'olha isso', contextInfo: { externalAdReply: { title: 'Site', sourceUrl: 'https://site.com' } } } }
  };
  const event = mapBaileysMessageToEvent(msg);
  assert.equal(event.adId, null);
  assert.equal(event.referral, null);
});

test('mensagem enviada por nos nunca carrega atribuicao de anuncio', () => {
  const msg = {
    key: { remoteJid: '5511999998888@s.whatsapp.net', id: 'O1', fromMe: true },
    message: { extendedTextMessage: { text: 'x', contextInfo: { externalAdReply: { sourceType: 'ad', sourceId: 'AD_1' } } } }
  };
  assert.equal(mapBaileysMessageToEvent(msg).adId, null);
});
