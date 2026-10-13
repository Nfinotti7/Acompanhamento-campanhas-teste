import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldApplyStatus, baileysStatusToName, applyMessageStatus } from './messageStatus.js';

test('status so avanca: enviada -> entregue -> lida', () => {
  assert.equal(shouldApplyStatus('sent', 'delivered'), true);
  assert.equal(shouldApplyStatus('delivered', 'read'), true);
  assert.equal(shouldApplyStatus(null, 'sent'), true);
});

test('aviso atrasado nao faz o status voltar (webhook fora de ordem)', () => {
  assert.equal(shouldApplyStatus('read', 'delivered'), false);
  assert.equal(shouldApplyStatus('delivered', 'sent'), false);
  assert.equal(shouldApplyStatus('read', 'read'), false);
});

test('falha so substitui quem ainda nao foi entregue', () => {
  assert.equal(shouldApplyStatus('sent', 'failed'), true);
  assert.equal(shouldApplyStatus('pending', 'failed'), true);
  assert.equal(shouldApplyStatus('delivered', 'failed'), false);
});

test('status desconhecido e ignorado', () => {
  assert.equal(shouldApplyStatus('sent', 'deleted'), false);
});

test('converte o codigo numerico do Baileys pro nome do status', () => {
  assert.equal(baileysStatusToName(0), 'failed');
  assert.equal(baileysStatusToName(1), 'pending');
  assert.equal(baileysStatusToName(2), 'sent');
  assert.equal(baileysStatusToName(3), 'delivered');
  assert.equal(baileysStatusToName(4), 'read');
  assert.equal(baileysStatusToName(5), 'read'); // audio ouvido conta como lido
  assert.equal(baileysStatusToName(undefined), null);
});

function makeFakeDb(currentStatus) {
  const calls = [];
  return {
    calls,
    db: {
      query: async (sql, params = []) => {
        calls.push({ sql, params });
        if (/SELECT id, contact_id, status FROM whatsapp_messages/.test(sql)) {
          return { rows: currentStatus === undefined ? [] : [{ id: 7, contact_id: 3, status: currentStatus }] };
        }
        return { rows: [] };
      }
    }
  };
}

test('applyMessageStatus grava e avisa a tela quando o status avanca', async () => {
  const { db, calls } = makeFakeDb('sent');
  const broadcasts = [];

  await applyMessageStatus({ clientId: 9, waMessageId: 'ABC', status: 'read', db, broadcast: (...args) => broadcasts.push(args) });

  const update = calls.find((c) => /UPDATE whatsapp_messages SET status/.test(c.sql));
  assert.deepEqual(update.params, ['read', 7]);
  assert.equal(broadcasts.length, 1);
  assert.equal(broadcasts[0][2].kind, 'status');
  assert.equal(broadcasts[0][2].contactId, 3);
});

test('applyMessageStatus ignora mensagem que nao conhecemos (ex: enviada antes do sistema existir)', async () => {
  const { db, calls } = makeFakeDb(undefined);
  await applyMessageStatus({ clientId: 9, waMessageId: 'X', status: 'read', db, broadcast: () => {} });
  assert.ok(!calls.some((c) => /UPDATE/.test(c.sql)));
});

test('applyMessageStatus nao regride status', async () => {
  const { db, calls } = makeFakeDb('read');
  await applyMessageStatus({ clientId: 9, waMessageId: 'ABC', status: 'delivered', db, broadcast: () => {} });
  assert.ok(!calls.some((c) => /UPDATE/.test(c.sql)));
});
