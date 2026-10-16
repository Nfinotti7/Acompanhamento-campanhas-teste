// Nenhuma cor fixa no JSX: tudo via var(--...) pra funcionar nos dois temas.
// Exceção: linha com "cor-fixa-ok" (cor vinda do banco, amostra do seletor de cor, etc.).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PENDING_COLOR_FILES } from './pendingColorFiles.js';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COLOR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(/;

function jsxFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return jsxFiles(p);
    return d.name.endsWith('.jsx') ? [p] : [];
  });
}

test('nenhuma cor fixa fora dos arquivos ainda pendentes', () => {
  const offenders = [];
  for (const file of jsxFiles(SRC)) {
    const rel = path.relative(SRC, file).split(path.sep).join('/');
    if (PENDING_COLOR_FILES.includes(rel)) continue;
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (COLOR.test(line) && !line.includes('cor-fixa-ok')) offenders.push(`${rel}:${i + 1}: ${line.trim().slice(0, 80)}`);
    });
  }
  assert.deepEqual(offenders, [], `cores fixas:\n${offenders.join('\n')}`);
});

test('a lista de pendentes só tem arquivos que ainda têm cor fixa', () => {
  for (const rel of PENDING_COLOR_FILES) {
    const text = fs.readFileSync(path.join(SRC, rel), 'utf8');
    const has = text.split('\n').some((l) => COLOR.test(l) && !l.includes('cor-fixa-ok'));
    assert.ok(has, `${rel} já está limpo: tire da lista PENDING_COLOR_FILES`);
  }
});
