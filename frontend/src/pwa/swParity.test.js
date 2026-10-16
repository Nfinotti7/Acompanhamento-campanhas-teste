// public/sw.js não importa módulos: a regra dele é uma cópia de swStrategy.js. Este teste
// roda a cópia do sw.js e compara com a original, pra elas não se descolarem.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { swStrategyFor } from './swStrategy.js';

const src = fs.readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');
const body = src.slice(src.indexOf('function strategyFor'), src.indexOf('\nself.addEventListener'));
const swStrategy = new Function('self', `${body}\nreturn strategyFor;`)({ location: { origin: 'https://furtherads.online' } });

const CASES = [
  ['/api/waitlist', 'cors'], ['/api/whatsapp/events?token=x', 'cors'], ['/r/abc', 'navigate'],
  ['/namesa', 'navigate'], ['/', 'navigate'], ['/caixa', 'navigate'],
  ['/assets/index-abc.js', 'no-cors'], ['/icons/namesa-192.png', 'no-cors'], ['/brand/x.png', 'no-cors'],
  ['/sw.js', 'no-cors'], ['/namesa.webmanifest', 'no-cors']
];

test('public/sw.js usa a mesma regra de src/pwa/swStrategy.js', () => {
  for (const [p, mode] of CASES) {
    const url = new URL(`https://furtherads.online${p}`);
    assert.equal(swStrategy(url, mode), swStrategyFor(url, mode), `${p} (${mode})`);
  }
  assert.equal(swStrategy(new URL('https://fonts.googleapis.com/css2'), 'cors'), 'bypass');
});
