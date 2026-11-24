import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, checkDbHealth, lastDbHealth } from './dbHealth.js';

const MB = 1024 * 1024;

test('abaixo de 70% do limite não avisa', () => {
  const r = evaluate(100 * MB, 500, 70);
  assert.equal(r.percent, 20);
  assert.equal(r.warn, false);
});

test('a partir de 70% do limite avisa', () => {
  assert.equal(evaluate(350 * MB, 500, 70).warn, true);
  assert.equal(evaluate(349 * MB, 500, 70).warn, false);
});

test('checkDbHealth guarda o último resultado com as maiores tabelas', async () => {
  const db = {
    async query(sql) {
      if (/pg_database_size/.test(sql)) return { rows: [{ size: String(400 * MB) }] };
      return { rows: [{ name: 'whatsapp_messages', size: String(200 * MB) }] };
    },
  };
  const original = console.error;
  console.error = () => {};
  try {
    const r = await checkDbHealth(db, new Date('2026-11-24T20:00:00Z'));
    assert.equal(r.warn, true);
    assert.deepEqual(r.biggest, [{ name: 'whatsapp_messages', sizeMb: 200 }]);
    assert.equal(lastDbHealth(), r);
  } finally {
    console.error = original;
  }
});
