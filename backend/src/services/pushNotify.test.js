import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pushToApp, buildInboundPayload, buildJoinedPayload } from './pushNotify.js';

test('aviso de mensagem nova: nome do contato, texto e o total de não lidas pra bolinha', () => {
  const payload = buildInboundPayload({ contactId: 7, profileName: 'Maria', waId: '5511999998888', body: 'Tem mesa?', unread: 3 });
  assert.deepEqual(payload, { title: 'Maria', body: 'Tem mesa?', tag: 'msg-7', badge: 3 });
  assert.equal(buildInboundPayload({ contactId: 7, waId: '5511999998888', body: 'oi', unread: 1 }).title, '+5511999998888');
});

test('aviso de entrada na fila: quem entrou e quantos grupos esperam (número da bolinha)', () => {
  assert.deepEqual(buildJoinedPayload({ name: 'João', partySize: 4, waitingCount: 3 }), {
    title: 'Entrou na fila', body: 'João, 4 pessoas. 3 grupos esperando.', tag: 'fila', badge: 3
  });
  assert.equal(buildJoinedPayload({ name: 'Ana', partySize: 1, waitingCount: 1 }).body, 'Ana, 1 pessoa. 1 grupo esperando.');
});

test('pushToApp manda pra todos os aparelhos do restaurante e apaga inscrição que não existe mais', async () => {
  const queries = [];
  const db = {
    query: async (sql, params) => {
      queries.push({ sql, params });
      if (sql.includes('SELECT id, endpoint')) {
        return { rows: [
          { id: 1, endpoint: 'https://push/a', keys: { p256dh: 'x', auth: 'y' } },
          { id: 2, endpoint: 'https://push/b', keys: {} }
        ] };
      }
      return { rows: [] };
    }
  };
  const sent = [];
  const send = async (sub, body) => {
    sent.push({ endpoint: sub.endpoint, body: JSON.parse(body) });
    if (sub.endpoint === 'https://push/b') { const e = new Error('gone'); e.statusCode = 410; throw e; }
  };

  const delivered = await pushToApp(9, 'caixa', { title: 'Maria', badge: 2 }, { db, send });

  assert.equal(delivered, 1);
  assert.deepEqual(sent[0].body, { url: '/caixa', title: 'Maria', badge: 2 });
  const deleted = queries.find((q) => q.sql.startsWith('DELETE'));
  assert.deepEqual(deleted.params, [2]);
});
