import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventLabel, summaryRows } from './eventFormat.js';

test('etiqueta curta por tipo e andamento', () => {
  assert.equal(eventLabel('empresa'), 'Empresa');
  assert.equal(eventLabel('aniversario', 'orcamento'), 'Aniversário · orçamento');
  assert.equal(eventLabel('a_definir', 'fechado'), 'Evento · fechado');
  assert.equal(eventLabel(null), null);
});

test('quadro traz empresa e aniversário sempre; "a definir" só quando existe', () => {
  const zero = { arrived: 0, answered: 0, quoted: 0, closed: 0 };
  const base = { empresa: zero, aniversario: zero, a_definir: zero, total: zero };
  const rows = summaryRows({ current: base, previous: base });
  assert.deepEqual(rows.map((r) => r.label), ['Empresa', 'Aniversário', 'Total']);

  const withUndefined = summaryRows({
    current: { ...base, a_definir: { ...zero, arrived: 2 } },
    previous: { ...base, total: { ...zero, arrived: 5 } }
  });
  assert.deepEqual(withUndefined.map((r) => r.label), ['Empresa', 'Aniversário', 'A definir', 'Total']);
  assert.equal(withUndefined[3].before, 5);
});
