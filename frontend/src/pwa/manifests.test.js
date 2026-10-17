import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const pub = new URL('../../public/', import.meta.url);

for (const [app, scope] of [['further', '/painel'], ['caixa', '/caixa'], ['namesa', '/namesa']]) {
  test(`${app}.webmanifest é válido e os ícones existem`, () => {
    const m = JSON.parse(fs.readFileSync(new URL(`${app}.webmanifest`, pub), 'utf8'));
    for (const k of ['id', 'name', 'short_name', 'start_url', 'scope', 'display', 'background_color', 'theme_color', 'icons']) {
      assert.ok(m[k], `faltou ${k}`);
    }
    assert.equal(m.scope, scope);
    assert.equal(m.start_url, scope);
    assert.equal(m.display, 'standalone');
    assert.ok(m.icons.some((i) => i.purpose === 'maskable'));
    assert.ok(m.icons.some((i) => i.sizes === '512x512'));
    for (const i of m.icons) assert.ok(fs.existsSync(new URL(i.src.slice(1), pub)), `ícone ${i.src} não existe`);
  });
}

test('nenhum app engloba o endereço de outro (senão o Android abre um dentro do outro)', () => {
  const ms = ['further', 'caixa', 'namesa'].map((a) => JSON.parse(fs.readFileSync(new URL(`${a}.webmanifest`, pub), 'utf8')));
  assert.equal(new Set(ms.map((m) => m.id)).size, 3, 'ids repetidos');
  for (const a of ms) for (const b of ms) {
    if (a !== b) assert.ok(!b.start_url.startsWith(a.scope), `${a.name} (escopo ${a.scope}) engloba ${b.start_url}`);
  }
});
