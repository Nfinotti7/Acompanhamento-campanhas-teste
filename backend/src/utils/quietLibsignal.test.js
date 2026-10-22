import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quietLibsignal } from './quietLibsignal.js';

function fakeConsole() {
  const lines = [];
  const record = (...args) => lines.push(args);
  return { lines, target: { log: record, info: record, warn: record } };
}

test('linha da libsignal sai só com o texto, sem as chaves da sessão', () => {
  const { lines, target } = fakeConsole();
  quietLibsignal(target);
  target.info('Closing session:', { currentRatchet: { privKey: 'segredo' } });
  target.warn('Session already closed', { rootKey: 'segredo' });
  assert.deepEqual(lines, [['Closing session:'], ['Session already closed']]);
});

test('outras linhas do log saem inteiras', () => {
  const { lines, target } = fakeConsole();
  quietLibsignal(target);
  target.log('Baileys close', { statusCode: 503 });
  target.info({ objeto: true });
  assert.deepEqual(lines, [['Baileys close', { statusCode: 503 }], [{ objeto: true }]]);
});
