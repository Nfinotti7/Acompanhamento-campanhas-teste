// Lê as variáveis dos dois temas direto do index.css e confere WCAG AA.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { contrastRatio } from './resolveTheme.js';

const css = fs.readFileSync(new URL('../index.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

function tokens(selectorStart) {
  const start = css.indexOf(selectorStart);
  assert.ok(start >= 0, `bloco ${selectorStart} não encontrado`);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  const out = {};
  for (const m of body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) out[m[1]] = m[2];
  return out;
}

const base = tokens(':root {');
const THEMES = {
  dark: { ...base, ...tokens(':root,\n[data-theme="dark"]') },
  light: { ...base, ...tokens('[data-theme="light"] {') }
};

const PAIRS = [
  ['text-primary', 'bg-dark', 4.5],
  ['text-primary', 'bg-card', 4.5],
  ['text-primary', 'bg-elevated', 4.5],
  ['text-secondary', 'bg-card', 4.5],
  ['text-secondary', 'bg-dark', 4.5],
  ['text-muted', 'bg-card', 4.5],
  ['accent-link', 'bg-card', 4.5],
  ['accent-link', 'bg-dark', 4.5],
  ['on-accent', 'accent-primary', 4.5],
  ['on-accent', 'accent-success', 3],
  ['on-accent', 'accent-danger', 3],
  ['accent-primary', 'bg-card', 3],
  ['accent-success', 'bg-card', 3],
  ['accent-warning', 'bg-card', 3],
  ['accent-danger', 'bg-card', 3]
];

for (const [theme, t] of Object.entries(THEMES)) {
  for (const [fg, bg, min] of PAIRS) {
    test(`${theme}: --${fg} sobre --${bg} >= ${min}`, () => {
      assert.ok(t[fg] && t[bg], `faltou --${fg} ou --${bg} no tema ${theme}`);
      const ratio = contrastRatio(t[fg], t[bg]);
      assert.ok(ratio >= min, `${t[fg]} sobre ${t[bg]} = ${ratio.toFixed(2)}`);
    });
  }
}
