import { test } from 'node:test';
import assert from 'node:assert/strict';
import { easterSunday, nthWeekday, datesForYear, upcomingDates } from './seasonality.js';

test('Páscoa conhecida', () => {
  assert.equal(easterSunday(2026), '2026-04-05');
  assert.equal(easterSunday(2027), '2027-03-28');
  assert.equal(easterSunday(2025), '2025-04-20');
});

test('datas móveis', () => {
  assert.equal(nthWeekday(2026, 5, 0, 2), '2026-05-10'); // Dia das Mães 2026
  assert.equal(nthWeekday(2026, 8, 0, 2), '2026-08-09'); // Dia dos Pais 2026
  assert.equal(nthWeekday(2026, 11, 5, 4), '2026-11-27'); // Black Friday 2026
  const carnaval = datesForYear(2026).find((d) => d.key === 'carnaval');
  assert.equal(carnaval.date, '2026-02-17');
});

test('próximas datas a partir de 3/11/2026', () => {
  const list = upcomingDates('2026-11-03', 60);
  assert.deepEqual(list.map((d) => d.key), ['black-friday', 'confraternizacao', 'natal', 'reveillon']);
  const bf = list[0];
  assert.equal(bf.daysUntil, 24);
  assert.equal(bf.startOn, '2026-11-17');
  assert.equal(bf.status, 'em_breve');
  assert.equal(list[1].status, 'comecar_agora'); // confraternização: começar em novembro
});

test('vira o ano', () => {
  const list = upcomingDates('2026-12-20', 60);
  assert.ok(list.some((d) => d.key === 'reveillon'));
  assert.ok(list.every((d) => d.date >= '2026-12-20' && d.date <= '2027-02-18'));
});
