# Responsivo, tema claro/escuro e PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Os 3 apps do frontend (Further Ads `/`, Caixa `/caixa`, Na Mesa `/namesa`) bonitos em celular/tablet/PC, com tema claro/escuro nas cores da Further e instaláveis como PWA.

**Architecture:**
- **Tema:** variáveis CSS com um valor por tema, definidas por seletor de atributo `[data-theme]`. Isso permite forçar o tema claro numa sub-árvore, que é como o relatório imprime claro.
- **Tamanho de tela:** três faixas no CSS, mais o hook `useBreakpoint` para mudanças de estrutura.
- **PWA:** três manifestos escritos à mão em `public/`, um service worker único e uma função pura `appForPath` que escolhe o app pelo endereço.
- **Lógica testável:** fica em funções puras testadas com `node --test` (que o frontend ainda não tinha). O visual é conferido com screenshots do Playwright.

**Tech Stack:**
- React 18 + Vite 5, estilos inline + `index.css`.
- recharts, lucide-react.
- Python + Pillow, só para gerar os PNG dos ícones uma vez.
- `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-15-responsivo-tema-pwa-design.md`

## Global Constraints

- **Faixas de tela:** celular `max-width: 640px`; tablet `641px–1024px`; PC `min-width: 1025px`. Nenhum outro ponto de corte.
- **Cores da marca:** marinho `#000D30`, turquesa `#0097B2`. Google `#4285f4` e Meta `#0084ff` não mudam com o tema.
- **Tema:** atributo `data-theme="dark|light"` no `<html>`, escolha salva em `localStorage['theme']` (`'dark' | 'light'`, ausente = segue o sistema).
- **Contraste:** WCAG AA (4,5:1 texto, 3:1 texto grande e componentes). O teste de contraste manda nos valores finais das variáveis.
- **Nenhum `#hex` / `rgb(` / `rgba(` literal em `src/**/*.jsx`.** A exceção é a linha marcar `cor-fixa-ok` num comentário (cor que vem do banco, amostras do seletor de cor do CRM, Google/Meta). Para transparência, usar `color-mix(in srgb, var(--x) N%, transparent)`.
- **Toque:** alvo mínimo de 44×44px no celular e no tablet. Campos com `font-size` ≥ 16px no celular.
- **Commits** em português, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Sem push.
- **Testes do frontend:** `cd frontend && node --test`. **Build:** `cd frontend && npx vite build`.

### Tabela de conversão de cores (vale para todas as tarefas de conversão)

| Literal hoje | Vira | Observação |
|---|---|---|
| `#fff`, `#ffffff`, `#f8fafc`, `#e2e8f0`, `#cbd5e1` como **cor de texto** sobre fundo/cartão | `var(--text-primary)` | |
| `#fff`/`#111` como texto **sobre botão ou selo colorido** (fundo accent/status) | `var(--on-accent)` | |
| `#94a3b8` | `var(--text-secondary)` | |
| `#64748b` | `var(--text-muted)` | |
| `#6366f1`, `#818cf8` | `var(--accent-primary)` | o roxo atual vira o turquesa da marca |
| `#4f46e5` | `var(--accent-primary-hover)` | |
| `#a5b4fc` (texto roxo claro) | `var(--accent-link)` | |
| `linear-gradient(... #6366f1 ... #a855f7 ...)` / `#a855f7`, `#8b5cf6` em gradiente de marca | `linear-gradient(135deg, var(--accent-primary), var(--accent-primary-hover))` | |
| `#a855f7`, `#8b5cf6`, `#ec4899`, `#3b82f6`, `#60a5fa`, `#38bdf8`, `#06b6d4` como **cor de série/categoria** | `var(--chart-1)` … `var(--chart-6)` | manter a ordem de uso no arquivo |
| `#10b981`, `#34d399`, `#22c55e`, `#059669` | `var(--accent-success)` | |
| `#f59e0b`, `#fbbf24` | `var(--accent-warning)` | |
| `#ef4444`, `#f87171`, `#fca5a5` | `var(--accent-danger)` | |
| `#131b2e`, `#0f1627`, `#0f1420`, `rgba(19,27,46,0.8/0.9)` | `var(--bg-card)` (ou `var(--glass-bg)` se havia blur) | |
| `#0b0f19`, `#0b1120`, `#070a12` | `var(--bg-dark)`; em campo de formulário, `var(--bg-input)` | |
| `rgba(255,255,255,0.02–0.06)` (fundo sutil) | `var(--surface-subtle)` | |
| `rgba(255,255,255,0.08–0.15)` (borda / divisor) | `var(--border-color)`; se for borda de destaque, `var(--border-strong)` | |
| `rgba(255,255,255,0.3–0.7)` (texto translúcido sobre accent) | `color-mix(in srgb, var(--on-accent) 70%, transparent)` | |
| `rgba(99,102,241,X)` | `color-mix(in srgb, var(--accent-primary) X*100%, transparent)` | |
| `rgba(16,185,129,X)` | `color-mix(in srgb, var(--accent-success) X*100%, transparent)` | |
| `rgba(239,68,68,X)`, `rgba(248,113,113,X)` | `color-mix(in srgb, var(--accent-danger) X*100%, transparent)` | |
| `rgba(245,158,11,X)` | `color-mix(in srgb, var(--accent-warning) X*100%, transparent)` | |
| `rgba(66,133,244,X)`, `rgba(59,130,246,X)` | `color-mix(in srgb, var(--accent-google) X*100%, transparent)` | |
| `rgba(0,0,0,0.6–0.85)` (fundo atrás de modal/lightbox) | `var(--overlay)` | |
| `#4285f4` | `var(--accent-google)` | |
| `#0084ff` | `var(--accent-meta)` | |

Quando um literal não está na tabela, use a variável de papel equivalente (texto, superfície, borda, status) e anote a escolha no commit.

## Review Focus

1. **Tema claro com pedaço escuro esquecido** (ex.: modal, tooltip do recharts, lightbox, autocomplete) → todo componente deve ficar legível no claro. O teste `noHardcodedColors` cobre o JSX. Tooltip/legenda do recharts recebem cores do `useTheme().chart` (Task 9).
2. **Celular em pé (375px) com rolagem lateral na página inteira** → nada pode vazar. A Task 12 confere `document.documentElement.scrollWidth <= innerWidth` em todas as telas.
3. **Service worker servindo `/api` velho ou `index.html` velho depois de deploy** → `sw.js` nunca intercepta `/api`, `/r/` e `/api/v1/whatsapp/webhook`, e a navegação é rede-primeiro. A Task 4 testa a função pura `swStrategyFor(url, mode)`.
4. **Login por PIN no iPhone dando zoom e cortando a tela** → campos com 16px e `100dvh` (Task 2, regra global). Conferido no screenshot de 375px.
5. **Relatório em PDF/print saindo escuro ou com texto branco no branco** → a área do relatório recebe `data-theme="light"` ao exportar e imprimir (Task 10). A Task 12 confere com screenshot da área do relatório forçada no claro.

---

### Task 1: Base do tema (variáveis claro/escuro, troca, contraste)

**Files:**
- Modify: `frontend/package.json` (script `test`)
- Modify: `frontend/src/index.css` (bloco `:root` das linhas 1–29 e scrollbar)
- Modify: `frontend/index.html` (script de tema inline + `theme-color`)
- Create: `frontend/src/theme/resolveTheme.js`
- Create: `frontend/src/theme/useTheme.js`
- Create: `frontend/src/theme/ThemeToggle.jsx`
- Test: `frontend/src/theme/resolveTheme.test.js`
- Test: `frontend/src/theme/contrast.test.js`

**Interfaces:**
- Produces: `resolveTheme(stored, systemPrefersDark) → 'dark'|'light'`; `THEME_STORAGE_KEY = 'theme'`; `contrastRatio(hexA, hexB) → number` (exportado de `resolveTheme.js`); `useTheme() → { theme, setTheme(t), toggle(), chart: { grid, axis, tooltipBg, tooltipText, series: string[] } }`; `<ThemeToggle size?={number} />`.
- Produces (CSS): todas as variáveis da spec, seção 1, mais `--surface-subtle`, `--border-strong`, `--chart-1..6`.

- [ ] **Step 1: Script de teste**

Em `frontend/package.json`, dentro de `"scripts"`, adicionar `"test": "node --test"`.

- [ ] **Step 2: Write the failing tests**

```js
// frontend/src/theme/resolveTheme.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTheme, contrastRatio } from './resolveTheme.js';

test('escolha salva vence o sistema', () => {
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('dark', false), 'dark');
});

test('sem escolha salva segue o sistema', () => {
  assert.equal(resolveTheme(null, true), 'dark');
  assert.equal(resolveTheme(null, false), 'light');
  assert.equal(resolveTheme('lixo', false), 'light');
});

test('contrastRatio bate com os valores conhecidos', () => {
  assert.equal(Math.round(contrastRatio('#000000', '#ffffff')), 21);
  assert.equal(contrastRatio('#777777', '#777777'), 1);
});
```

```js
// frontend/src/theme/contrast.test.js
// Lê as variáveis dos dois temas direto do index.css e confere WCAG AA.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { contrastRatio } from './resolveTheme.js';

const css = fs.readFileSync(new URL('../index.css', import.meta.url), 'utf8');

function tokens(selectorStart) {
  const start = css.indexOf(selectorStart);
  assert.ok(start >= 0, `bloco ${selectorStart} não encontrado`);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  const out = {};
  for (const m of body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) out[m[1]] = m[2];
  return out;
}

const THEMES = {
  dark: tokens(':root,\n[data-theme="dark"]'),
  light: tokens('[data-theme="light"]')
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd frontend && node --test`
Expected: FAIL (`resolveTheme.js` não existe).

- [ ] **Step 4: Implement**

```js
// frontend/src/theme/resolveTheme.js
export const THEME_STORAGE_KEY = 'theme';

export function resolveTheme(stored, systemPrefersDark) {
  if (stored === 'dark' || stored === 'light') return stored;
  return systemPrefersDark ? 'dark' : 'light';
}

function luminance(hex) {
  const n = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
```

Em `frontend/src/index.css`, substituir o bloco `:root { ... }` das linhas 1–29 por:

```css
/* Tema: valores por [data-theme]. Seletor de atributo (não só :root) pra dar pra forçar
   o tema claro numa parte da tela -- o relatório imprime/exporta sempre claro. */
:root {
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 18px;
  --radius-xl: 24px;
  --accent-google: #4285f4;
  --accent-meta: #0084ff;
  --brand-navy: #000D30;
  --brand-teal: #0097B2;
  --on-accent: #ffffff;
}

:root,
[data-theme="dark"] {
  color-scheme: dark;
  --bg-dark: #000A26;
  --bg-sidebar: #00081F;
  --bg-card: #071A3F;
  --bg-card-hover: #0C2350;
  --bg-input: #000A26;
  --bg-elevated: #0C2350;
  --surface-subtle: rgba(255, 255, 255, 0.04);
  --border-color: rgba(255, 255, 255, 0.09);
  --border-strong: rgba(255, 255, 255, 0.18);
  --border-glow: rgba(0, 151, 178, 0.25);
  --text-primary: #F1F5F9;
  --text-secondary: #9AAAC4;
  --text-muted: #8494B0;
  --accent-primary: #007F96;
  --accent-primary-hover: #0097B2;
  --accent-link: #3CC6E0;
  --accent-success: #10B981;
  --accent-warning: #F59E0B;
  --accent-danger: #F05252;
  --overlay: rgba(0, 4, 18, 0.7);
  --shadow-card: 0 10px 30px -10px rgba(0, 0, 0, 0.6);
  --shadow-glow: 0 0 25px rgba(0, 151, 178, 0.25);
  --glass-bg: rgba(7, 26, 63, 0.75);
  --glass-border: rgba(255, 255, 255, 0.1);
  --chart-1: #22C3E0;
  --chart-2: #8B9CFF;
  --chart-3: #F59E0B;
  --chart-4: #34D399;
  --chart-5: #F472B6;
  --chart-6: #A78BFA;
}

[data-theme="light"] {
  color-scheme: light;
  --bg-dark: #F3F6FA;
  --bg-sidebar: #FFFFFF;
  --bg-card: #FFFFFF;
  --bg-card-hover: #EEF3F8;
  --bg-input: #F7F9FC;
  --bg-elevated: #FFFFFF;
  --surface-subtle: rgba(0, 13, 48, 0.04);
  --border-color: rgba(0, 13, 48, 0.12);
  --border-strong: rgba(0, 13, 48, 0.24);
  --border-glow: rgba(0, 151, 178, 0.3);
  --text-primary: #000D30;
  --text-secondary: #3A4A6B;
  --text-muted: #5F6E8C;
  --accent-primary: #007F96;
  --accent-primary-hover: #006A80;
  --accent-link: #007189;
  --accent-success: #047857;
  --accent-warning: #B45309;
  --accent-danger: #C81E1E;
  --overlay: rgba(0, 13, 48, 0.4);
  --shadow-card: 0 8px 24px -12px rgba(0, 13, 48, 0.18);
  --shadow-glow: 0 0 20px rgba(0, 151, 178, 0.2);
  --glass-bg: rgba(255, 255, 255, 0.85);
  --glass-border: rgba(0, 13, 48, 0.1);
  --chart-1: #0097B2;
  --chart-2: #4F5BD5;
  --chart-3: #D97706;
  --chart-4: #059669;
  --chart-5: #DB2777;
  --chart-6: #7C3AED;
}
```

Na scrollbar do `index.css`, trocar `#1e293b` por `var(--border-strong)` e `#334155` por `var(--text-muted)`.

Em `frontend/index.html`, dentro do `<head>`, antes de qualquer `<link>`:

```html
    <meta name="theme-color" content="#000D30" />
    <script>
      // Aplica o tema antes do React, pra não piscar.
      (function () {
        var s = null;
        try { s = localStorage.getItem('theme'); } catch (e) {}
        var dark = s === 'dark' || (s !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
        document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
      })();
    </script>
```

```js
// frontend/src/theme/useTheme.js
import { useEffect, useState, useCallback } from 'react';
import { resolveTheme, THEME_STORAGE_KEY } from './resolveTheme.js';

function readStored() {
  try { return localStorage.getItem(THEME_STORAGE_KEY); } catch { return null; }
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function apply(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', cssVar('--bg-sidebar') || '#000D30');
}

const listeners = new Set();

// Cores pros gráficos (recharts não lê variável CSS sozinho).
function chartColors() {
  return {
    grid: cssVar('--border-color'),
    axis: cssVar('--text-muted'),
    tooltipBg: cssVar('--bg-elevated'),
    tooltipText: cssVar('--text-primary'),
    series: [1, 2, 3, 4, 5, 6].map((i) => cssVar(`--chart-${i}`))
  };
}

export function useTheme() {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const [theme, setThemeState] = useState(() => resolveTheme(readStored(), media.matches));

  useEffect(() => {
    const onChange = (t) => setThemeState(t);
    listeners.add(onChange);
    const onSystem = () => {
      if (readStored()) return;
      const t = resolveTheme(null, media.matches);
      apply(t);
      listeners.forEach((l) => l(t));
    };
    media.addEventListener('change', onSystem);
    return () => { listeners.delete(onChange); media.removeEventListener('change', onSystem); };
  }, []);

  const setTheme = useCallback((t) => {
    try { localStorage.setItem(THEME_STORAGE_KEY, t); } catch { /* modo privado */ }
    apply(t);
    listeners.forEach((l) => l(t));
  }, []);

  const toggle = useCallback(() => setTheme(theme === 'dark' ? 'light' : 'dark'), [theme, setTheme]);

  return { theme, setTheme, toggle, chart: chartColors() };
}
```

```jsx
// frontend/src/theme/ThemeToggle.jsx
import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from './useTheme.js';

export default function ThemeToggle({ size = 18 }) {
  const { theme, toggle } = useTheme();
  const label = theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro';
  return (
    <button type="button" onClick={toggle} title={label} aria-label={label} className="icon-button">
      {theme === 'dark' ? <Sun size={size} /> : <Moon size={size} />}
    </button>
  );
}
```

E no `index.css`, uma classe compartilhada:

```css
.icon-button {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 44px; min-height: 44px; border-radius: var(--radius-sm);
  background: transparent; border: 1px solid var(--border-color);
  color: var(--text-secondary); cursor: pointer;
}
.icon-button:hover { color: var(--text-primary); background: var(--surface-subtle); }
```

- [ ] **Step 5: Run tests**

Run: `cd frontend && node --test`
Expected: PASS. **Se algum par de contraste falhar, ajuste o valor da variável** no `index.css` (escureça ou clareie mantendo o matiz) até passar, e anote no commit. Não afrouxe o teste.

- [ ] **Step 6: Build e commit**

Run: `cd frontend && npx vite build`. Expected: build ok.

```bash
git add frontend/package.json frontend/index.html frontend/src/index.css frontend/src/theme
git commit -m "feat(ui): base do tema claro/escuro nas cores da Further

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Faixas de tela e regras globais de celular

**Files:**
- Create: `frontend/src/responsive/useBreakpoint.js`
- Test: `frontend/src/responsive/useBreakpoint.test.js`
- Modify: `frontend/src/index.css` (os `@media (max-width: 900px)` e `(max-width: 560px)` atuais)
- Modify: `frontend/index.html` (meta viewport)

**Interfaces:**
- Produces: `BREAKPOINTS = { phone: 640, tablet: 1024 }`, `breakpointFor(width) → 'phone'|'tablet'|'desktop'`, `useBreakpoint() → 'phone'|'tablet'|'desktop'`. Classes CSS: `.only-phone`, `.hide-phone`, `.stack-phone` (vira coluna no celular), `.page-pad` (padding com safe-area).

- [ ] **Step 1: Failing test**

```js
// frontend/src/responsive/useBreakpoint.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { breakpointFor } from './useBreakpoint.js';

test('faixas: celular até 640, tablet até 1024, PC acima', () => {
  assert.equal(breakpointFor(375), 'phone');
  assert.equal(breakpointFor(640), 'phone');
  assert.equal(breakpointFor(641), 'tablet');
  assert.equal(breakpointFor(1024), 'tablet');
  assert.equal(breakpointFor(1025), 'desktop');
});
```

- [ ] **Step 2:** `cd frontend && node --test` → FAIL (módulo não existe).

- [ ] **Step 3: Implement**

```js
// frontend/src/responsive/useBreakpoint.js
import { useEffect, useState } from 'react';

export const BREAKPOINTS = { phone: 640, tablet: 1024 };

export function breakpointFor(width) {
  if (width <= BREAKPOINTS.phone) return 'phone';
  if (width <= BREAKPOINTS.tablet) return 'tablet';
  return 'desktop';
}

// Só pra quando a ESTRUTURA muda (tabela -> cartões, lista/conversa em 2 telas).
// Tamanho/espaçamento ficam no CSS.
export function useBreakpoint() {
  const [bp, setBp] = useState(() => breakpointFor(window.innerWidth));
  useEffect(() => {
    const onResize = () => setBp(breakpointFor(window.innerWidth));
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);
  return bp;
}
```

Em `index.html`, trocar a meta viewport por:

```html
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
```

No `index.css`:
- Trocar `@media (max-width: 900px)` por `@media (max-width: 1024px)` e `@media (max-width: 560px)` por `@media (max-width: 640px)`.
- Trocar `rgba(0, 0, 0, 0.6)` do `.sidebar-overlay.open` por `var(--overlay)` e o `box-shadow` da `.sidebar` por `var(--shadow-card)`.
- Acrescentar no fim (antes do `@media print`):

```css
/* ===== Regras globais de celular/tablet ===== */
html, body, #root { min-height: 100dvh; }
body { padding-bottom: env(safe-area-inset-bottom); }

.page-pad {
  padding-left: max(16px, env(safe-area-inset-left));
  padding-right: max(16px, env(safe-area-inset-right));
}

.only-phone { display: none !important; }

@media (max-width: 640px) {
  .only-phone { display: revert !important; }
  .hide-phone { display: none !important; }
  .stack-phone { flex-direction: column !important; align-items: stretch !important; }
  /* iOS dá zoom em campo com fonte < 16px */
  input, select, textarea { font-size: 16px !important; }
  .main-content { padding: 16px 12px; }
}

@media (max-width: 1024px) {
  button, .btn, a.btn, select { min-height: 44px; }
}
```

- [ ] **Step 4:** `cd frontend && node --test` → PASS. `npx vite build` → ok.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/responsive frontend/src/index.css frontend/index.html
git commit -m "feat(ui): faixas de tela (640/1024) e regras globais de celular

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Logos, ícones dos apps e componentes de marca

**Files:**
- Create: `frontend/public/brand/` (6 PNG copiados), `frontend/public/icons/` (PNG gerados)
- Create: `frontend/scripts/generate_icons.py`
- Create: `frontend/src/brand/AppIcon.jsx`, `frontend/src/brand/BrandLogo.jsx`

**Interfaces:**
- Produces:
  - `<BrandLogo variant="horizontal"|"vertical"|"arrow" height={n} />` (escolhe a versão clara ou escura pelo tema via `useTheme`).
  - `<AppIcon app="further"|"caixa"|"namesa" size={n} />` (SVG inline).
  - Arquivos `/icons/{app}-192.png`, `/icons/{app}-512.png`, `/icons/{app}-maskable-512.png`, `/icons/{app}-apple-180.png`, `/icons/{app}-favicon-32.png`, com `app ∈ further|caixa|namesa`.

- [ ] **Step 1: Copiar as logos** (as imagens que o usuário mandou nesta sessão)

```bash
SRC="/c/Users/nicol/AppData/Local/Temp/claude/c--Users-nicol-OneDrive-Documentos-Ag-ncia-Further-Acompanhamento-campanhas/b9c9e2c9-83b8-40ad-a05e-53b9a27b9586/images"
DST="frontend/public/brand"; mkdir -p "$DST" frontend/public/icons
cp "$SRC/1.png" "$DST/further-horizontal-dark.png"
cp "$SRC/6.png" "$DST/further-horizontal-light.png"
cp "$SRC/2.png" "$DST/further-vertical-dark.png"
cp "$SRC/3.png" "$DST/further-vertical-light.png"
cp "$SRC/5.png" "$DST/further-arrow-dark.png"
cp "$SRC/4.png" "$DST/further-arrow-light.png"
```

As logos têm muita margem transparente (83–94%). O script do passo 2 também gera versões recortadas (`*-trim.png`) para uso na interface.

- [ ] **Step 2: Gerador de ícones**

```python
# frontend/scripts/generate_icons.py
# Gera os ícones PNG dos 3 apps (PWA, Apple, favicon) e recorta as logos.
# Rodar uma vez: python -I frontend/scripts/generate_icons.py  (precisa de Pillow)
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent / "public"
BRAND, ICONS = ROOT / "brand", ROOT / "icons"
NAVY, TEAL, WHITE = (0, 13, 48, 255), (0, 151, 178, 255), (255, 255, 255, 255)
S = 1024  # desenha grande e reduz (antialias)


def trim(name):
    im = Image.open(BRAND / f"{name}.png").convert("RGBA")
    im.crop(im.getbbox()).save(BRAND / f"{name}-trim.png")


def canvas():
    return Image.new("RGBA", (S, S), NAVY)


def further(art_scale):
    im = canvas()
    arrow = Image.open(BRAND / "further-arrow-light.png").convert("RGBA")
    arrow = arrow.crop(arrow.getbbox())
    w = int(S * art_scale)
    h = int(arrow.height * w / arrow.width)
    arrow = arrow.resize((w, h), Image.LANCZOS)
    im.alpha_composite(arrow, ((S - w) // 2 + int(S * 0.03), (S - h) // 2))
    return im


def caixa(art_scale):
    im = canvas()
    d = ImageDraw.Draw(im)
    w = S * art_scale
    x0, y0 = (S - w) / 2, (S - w * 0.8) / 2 - S * 0.04
    x1, y1 = x0 + w, y0 + w * 0.72
    d.rounded_rectangle([x0, y0, x1, y1], radius=w * 0.2, fill=TEAL)
    d.polygon([(x0 + w * 0.2, y1 - 2), (x0 + w * 0.18, y1 + w * 0.2), (x0 + w * 0.42, y1 - 2)], fill=TEAL)
    r = w * 0.06
    cy = (y0 + y1) / 2
    for i in (-1, 0, 1):
        cx = S / 2 + i * w * 0.22
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=WHITE)
    return im


def namesa(art_scale):
    im = canvas()
    d = ImageDraw.Draw(im)
    w = S * art_scale
    c, R = S / 2, w * 0.3
    d.ellipse([c - R, c - R, c + R, c + R], fill=TEAL)
    r2 = R * 0.68
    d.ellipse([c - r2, c - r2, c + r2, c + r2], outline=WHITE, width=int(w * 0.035))
    t = w * 0.045
    # garfo (esquerda) e faca (direita)
    fx = c - R - w * 0.12
    d.rounded_rectangle([fx - t / 2, c - R, fx + t / 2, c + R], radius=t / 2, fill=WHITE)
    for dx in (-t * 1.6, 0, t * 1.6):
        d.rounded_rectangle([fx + dx - t / 4, c - R, fx + dx + t / 4, c - R * 0.45], radius=t / 4, fill=WHITE)
    d.rounded_rectangle([fx - t * 1.85, c - R * 0.5, fx + t * 1.85, c - R * 0.38], radius=t / 3, fill=WHITE)
    kx = c + R + w * 0.12
    d.rounded_rectangle([kx - t / 2, c - R * 0.1, kx + t / 2, c + R], radius=t / 2, fill=WHITE)
    d.pieslice([kx - t * 1.4, c - R, kx + t * 0.6, c + R * 0.2], 270, 90, fill=WHITE)
    return im


def save(img, name, size, rounded=False):
    out = img.resize((size, size), Image.LANCZOS)
    if rounded:
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=size * 0.22, fill=255)
        out.putalpha(mask)
    out.save(ICONS / name)


def main():
    ICONS.mkdir(exist_ok=True)
    for n in ["further-horizontal-dark", "further-horizontal-light", "further-vertical-dark",
              "further-vertical-light", "further-arrow-dark", "further-arrow-light"]:
        trim(n)
    for app, draw in {"further": further, "caixa": caixa, "namesa": namesa}.items():
        normal, maskable = draw(0.62), draw(0.5)  # maskable: arte dentro do círculo seguro (80%)
        save(normal, f"{app}-192.png", 192, rounded=True)
        save(normal, f"{app}-512.png", 512, rounded=True)
        save(maskable, f"{app}-maskable-512.png", 512)
        save(normal, f"{app}-apple-180.png", 180)  # iOS arredonda sozinho e não aceita transparência
        save(normal, f"{app}-favicon-32.png", 32, rounded=True)


if __name__ == "__main__":
    main()
```

Run: `python -I frontend/scripts/generate_icons.py && ls frontend/public/icons`
Expected: 15 arquivos PNG (5 por app) e os 6 `*-trim.png` em `brand/`. **Abra (Read) `namesa-512.png`, `caixa-512.png` e `further-512.png` e confira visualmente.** Se o desenho do garfo/faca ou do balão ficar ruim, ajuste as proporções no script e rode de novo.

- [ ] **Step 3: Componentes de marca**

```jsx
// frontend/src/brand/BrandLogo.jsx
import React from 'react';
import { useTheme } from '../theme/useTheme.js';

// Logo clara no tema escuro, escura no tema claro.
export default function BrandLogo({ variant = 'horizontal', height = 32, style }) {
  const { theme } = useTheme();
  const tone = theme === 'dark' ? 'light' : 'dark';
  return (
    <img src={`/brand/further-${variant}-${tone}-trim.png`} alt="Further" style={{ height, width: 'auto', display: 'block', ...style }} />
  );
}
```

```jsx
// frontend/src/brand/AppIcon.jsx
import React from 'react';

// Ícone de cada app em SVG (mesmo desenho dos PNG gerados por scripts/generate_icons.py).
export default function AppIcon({ app, size = 40 }) {
  if (app === 'further') {
    return <img src="/icons/further-192.png" alt="" width={size} height={size} style={{ borderRadius: size * 0.22 }} />;
  }
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <rect width="100" height="100" rx="22" fill="var(--brand-navy)" />
      {app === 'caixa' ? (
        <>
          <rect x="19" y="20" width="62" height="45" rx="12" fill="var(--brand-teal)" />
          <polygon points="31,64 30,78 45,64" fill="var(--brand-teal)" />
          {[36, 50, 64].map((cx) => <circle key={cx} cx={cx} cy="42.5" r="4" fill="#fff" />)}{/* cor-fixa-ok */}
        </>
      ) : (
        <>
          <circle cx="50" cy="50" r="19" fill="var(--brand-teal)" />
          <circle cx="50" cy="50" r="13" fill="none" stroke="#fff" strokeWidth="2.2" />{/* cor-fixa-ok */}
          <rect x="23" y="31" width="2.8" height="38" rx="1.4" fill="#fff" />{/* cor-fixa-ok */}
          <rect x="74.2" y="48" width="2.8" height="21" rx="1.4" fill="#fff" />{/* cor-fixa-ok */}
          <path d="M75.6 31 a4 9 0 0 1 0 19 z" fill="#fff" />{/* cor-fixa-ok */}
        </>
      )}
    </svg>
  );
}
```

- [ ] **Step 4:** `cd frontend && npx vite build` → ok.

- [ ] **Step 5: Commit**

```bash
git add frontend/public/brand frontend/public/icons frontend/scripts/generate_icons.py frontend/src/brand
git commit -m "feat(ui): logos da Further, icones dos 3 apps e componentes de marca

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: PWA (manifestos, escolha do app, service worker, instalar, sem conexão)

**Files:**
- Create: `frontend/public/further.webmanifest`, `frontend/public/caixa.webmanifest`, `frontend/public/namesa.webmanifest`
- Create: `frontend/public/sw.js`
- Create: `frontend/src/pwa/apps.js`, `frontend/src/pwa/swStrategy.js`, `frontend/src/pwa/installHint.js`
- Create: `frontend/src/pwa/registerSW.js`, `frontend/src/pwa/InstallPrompt.jsx`, `frontend/src/pwa/OfflineBanner.jsx`
- Test: `frontend/src/pwa/apps.test.js`, `frontend/src/pwa/swStrategy.test.js`, `frontend/src/pwa/installHint.test.js`, `frontend/src/pwa/manifests.test.js`
- Modify: `frontend/src/main.jsx`, `frontend/index.html` (título neutro, remover `favicon.svg`)

**Interfaces:**
- Produces:
  - `APPS` e `appForPath(pathname) → { key, title, manifest, appleIcon, favicon, appleTitle }`.
  - `swStrategyFor(url: URL, mode: string) → 'network-first-shell'|'cache-first'|'bypass'`.
  - `installHintFor({ userAgent, standalone, hasPrompt, dismissed }) → 'android'|'ios'|null`.
  - `<InstallPrompt appKey />`, `<OfflineBanner />`, `registerSW()`.
- `public/sw.js` reimplementa `swStrategyFor` (o service worker não importa módulos do Vite). Os dois têm que ter a **mesma regra**; o teste da Task 4 testa a versão do `src`, e o `sw.js` tem um comentário apontando para ela.

- [ ] **Step 1: Failing tests**

```js
// frontend/src/pwa/apps.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appForPath } from './apps.js';

test('cada endereço leva ao app certo', () => {
  assert.equal(appForPath('/caixa').key, 'caixa');
  assert.equal(appForPath('/caixa/qualquer').key, 'caixa');
  assert.equal(appForPath('/namesa').key, 'namesa');
  assert.equal(appForPath('/').key, 'further');
  assert.equal(appForPath('/admin').key, 'further');
  assert.equal(appForPath('/caixas').key, 'further');
});

test('config do Na Mesa aponta pro manifesto e ícones dele', () => {
  const a = appForPath('/namesa');
  assert.equal(a.manifest, '/namesa.webmanifest');
  assert.equal(a.appleIcon, '/icons/namesa-apple-180.png');
  assert.equal(a.title, 'Na Mesa');
});
```

```js
// frontend/src/pwa/swStrategy.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { swStrategyFor } from './swStrategy.js';

const u = (p) => new URL(`https://furtherads.online${p}`);

test('API, link rastreável e webhook nunca passam pelo cache', () => {
  assert.equal(swStrategyFor(u('/api/waitlist'), 'cors'), 'bypass');
  assert.equal(swStrategyFor(u('/api/whatsapp/events?token=x'), 'cors'), 'bypass');
  assert.equal(swStrategyFor(u('/r/abc'), 'navigate'), 'bypass');
  assert.equal(swStrategyFor(u('/api/v1/whatsapp/webhook'), 'cors'), 'bypass');
});

test('abrir página é rede primeiro com fallback pro shell', () => {
  assert.equal(swStrategyFor(u('/namesa'), 'navigate'), 'network-first-shell');
  assert.equal(swStrategyFor(u('/'), 'navigate'), 'network-first-shell');
});

test('arquivos com hash e ícones vão pelo cache', () => {
  assert.equal(swStrategyFor(u('/assets/index-abc123.js'), 'no-cors'), 'cache-first');
  assert.equal(swStrategyFor(u('/icons/namesa-192.png'), 'no-cors'), 'cache-first');
  assert.equal(swStrategyFor(u('/brand/further-arrow-dark-trim.png'), 'no-cors'), 'cache-first');
});

test('outro domínio (fonte do Google) não é com a gente', () => {
  assert.equal(swStrategyFor(new URL('https://fonts.googleapis.com/css2'), 'cors'), 'bypass');
});
```

```js
// frontend/src/pwa/installHint.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installHintFor } from './installHint.js';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/120.0 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36';

test('Android com prompt guardado mostra o botão instalar', () => {
  assert.equal(installHintFor({ userAgent: ANDROID, standalone: false, hasPrompt: true, dismissed: false }), 'android');
});

test('iPhone no Safari mostra a dica de Compartilhar', () => {
  assert.equal(installHintFor({ userAgent: IPHONE, standalone: false, hasPrompt: false, dismissed: false }), 'ios');
});

test('Chrome no iPhone não instala PWA: sem dica', () => {
  assert.equal(installHintFor({ userAgent: IPHONE_CHROME, standalone: false, hasPrompt: false, dismissed: false }), null);
});

test('já instalado ou dispensado: nada', () => {
  assert.equal(installHintFor({ userAgent: IPHONE, standalone: true, hasPrompt: false, dismissed: false }), null);
  assert.equal(installHintFor({ userAgent: ANDROID, standalone: false, hasPrompt: true, dismissed: true }), null);
});
```

```js
// frontend/src/pwa/manifests.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const pub = new URL('../../public/', import.meta.url);

for (const [app, scope] of [['further', '/'], ['caixa', '/caixa'], ['namesa', '/namesa']]) {
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
```

- [ ] **Step 2:** `cd frontend && node --test` → as 4 suítes novas falham (módulos e manifestos não existem).

- [ ] **Step 3: Implement**

```js
// frontend/src/pwa/apps.js
// Os 3 "apps" que o mesmo frontend serve. Cada um vira um PWA instalável próprio.
export const APPS = {
  further: { key: 'further', title: 'Further Ads', appleTitle: 'Further' },
  caixa: { key: 'caixa', title: 'Caixa', appleTitle: 'Caixa' },
  namesa: { key: 'namesa', title: 'Na Mesa', appleTitle: 'Na Mesa' }
};

function withFiles(app) {
  return {
    ...app,
    manifest: `/${app.key}.webmanifest`,
    appleIcon: `/icons/${app.key}-apple-180.png`,
    favicon: `/icons/${app.key}-favicon-32.png`
  };
}

export function appForPath(pathname) {
  const p = pathname || '/';
  if (p === '/caixa' || p.startsWith('/caixa/')) return withFiles(APPS.caixa);
  if (p === '/namesa' || p.startsWith('/namesa/')) return withFiles(APPS.namesa);
  return withFiles(APPS.further);
}
```

A origem própria entra como parâmetro (em Node não existe `self`). O `sw.js` usa `self.location.origin`.

```js
// frontend/src/pwa/swStrategy.js
// Mesma regra do public/sw.js (o service worker não importa módulos do Vite).
// Mudou aqui? Mude lá também.
export function swStrategyFor(url, mode, ownOrigin = 'https://furtherads.online') {
  if (url.origin !== ownOrigin) return 'bypass';
  const p = url.pathname;
  if (p.startsWith('/api/') || p.startsWith('/r/')) return 'bypass';
  if (mode === 'navigate') return 'network-first-shell';
  if (p.startsWith('/assets/') || p.startsWith('/icons/') || p.startsWith('/brand/')) return 'cache-first';
  return 'bypass';
}
```

```js
// frontend/src/pwa/installHint.js
export function installHintFor({ userAgent, standalone, hasPrompt, dismissed }) {
  if (standalone || dismissed) return null;
  if (hasPrompt) return 'android';
  const ua = userAgent || '';
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return isIOS && isSafari ? 'ios' : null;
}
```

```js
// frontend/public/sw.js
// Service worker único dos 3 apps. Regra igual a src/pwa/swStrategy.js.
const CACHE = 'further-shell-v1';
const SHELL = '/index.html';

function strategyFor(url, mode) {
  if (url.origin !== self.location.origin) return 'bypass';
  const p = url.pathname;
  if (p.startsWith('/api/') || p.startsWith('/r/')) return 'bypass';
  if (mode === 'navigate') return 'network-first-shell';
  if (p.startsWith('/assets/') || p.startsWith('/icons/') || p.startsWith('/brand/')) return 'cache-first';
  return 'bypass';
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.add(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const strategy = strategyFor(new URL(req.url), req.mode);
  if (strategy === 'bypass') return;

  if (strategy === 'network-first-shell') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(SHELL, copy));
          return res;
        })
        .catch(() => caches.match(SHELL))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }))
  );
});
```

Manifestos (um por app; trocar `further`/nome/escopo):

```json
{
  "id": "/namesa",
  "name": "Na Mesa",
  "short_name": "Na Mesa",
  "description": "Fila de espera do restaurante",
  "start_url": "/namesa",
  "scope": "/namesa",
  "display": "standalone",
  "orientation": "any",
  "background_color": "#000D30",
  "theme_color": "#000D30",
  "lang": "pt-BR",
  "icons": [
    { "src": "/icons/namesa-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/namesa-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/namesa-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

- `caixa.webmanifest`: `"id": "/caixa"`, `"name": "Caixa"`, `"short_name": "Caixa"`, `"description": "Conversas, funil e agenda do restaurante"`, escopo e `start_url` `/caixa`, ícones `caixa-*`.
- `further.webmanifest`: `"id": "/"`, `"name": "Further Ads"`, `"short_name": "Further"`, `"description": "Painel de campanhas da Further"`, escopo e `start_url` `/`, ícones `further-*`.

```js
// frontend/src/pwa/registerSW.js
export function registerSW() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e) => console.error('Service worker:', e));
  });
}
```

```jsx
// frontend/src/pwa/InstallPrompt.jsx
import React, { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { installHintFor } from './installHint.js';

let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; });

const key = (app) => `install_dismissed_${app}`;

export default function InstallPrompt({ appKey, appName }) {
  const [hint, setHint] = useState(null);

  useEffect(() => {
    const compute = () => {
      let dismissed = false;
      try { dismissed = localStorage.getItem(key(appKey)) === '1'; } catch { /* privado */ }
      setHint(installHintFor({
        userAgent: navigator.userAgent,
        standalone: window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
        hasPrompt: Boolean(deferredPrompt),
        dismissed
      }));
    };
    compute();
    window.addEventListener('beforeinstallprompt', compute);
    return () => window.removeEventListener('beforeinstallprompt', compute);
  }, [appKey]);

  if (!hint) return null;

  const dismiss = () => {
    try { localStorage.setItem(key(appKey), '1'); } catch { /* privado */ }
    setHint(null);
  };
  const install = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    setHint(null);
  };

  return (
    <div className="install-banner" role="status">
      {hint === 'android' ? (
        <>
          <span>Instale o {appName} no celular pra abrir direto.</span>
          <button className="btn btn-primary" onClick={install}><Download size={16} /> Instalar</button>
        </>
      ) : (
        <span>Pra instalar: toque em <Share size={14} style={{ verticalAlign: 'middle' }} /> <b>Compartilhar</b> e depois em <b>Adicionar à Tela de Início</b>.</span>
      )}
      <button className="icon-button" onClick={dismiss} aria-label="Fechar"><X size={16} /></button>
    </div>
  );
}
```

```jsx
// frontend/src/pwa/OfflineBanner.jsx
import React, { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

export default function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);
  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  if (!offline) return null;
  return <div className="offline-banner" role="alert"><WifiOff size={16} /> Sem conexão: tentando reconectar…</div>;
}
```

CSS em `index.css`:

```css
.install-banner, .offline-banner {
  position: fixed; left: 12px; right: 12px; z-index: 2000;
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 12px 14px; border-radius: var(--radius-md);
  background: var(--bg-elevated); color: var(--text-primary);
  border: 1px solid var(--border-strong); box-shadow: var(--shadow-card);
  font-size: 0.9rem;
}
.install-banner { bottom: calc(12px + env(safe-area-inset-bottom)); }
.install-banner > span { flex: 1 1 200px; }
.offline-banner {
  top: calc(8px + env(safe-area-inset-top));
  background: color-mix(in srgb, var(--accent-danger) 15%, var(--bg-elevated));
  border-color: var(--accent-danger); justify-content: center;
}
@media (min-width: 1025px) { .install-banner { left: auto; max-width: 420px; } }
```

`frontend/src/main.jsx`:

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import CaixaApp from './CaixaApp.jsx';
import NaMesaApp from './NaMesaApp.jsx';
import { appForPath } from './pwa/apps.js';
import { registerSW } from './pwa/registerSW.js';
import InstallPrompt from './pwa/InstallPrompt.jsx';
import OfflineBanner from './pwa/OfflineBanner.jsx';
import './index.css';

const app = appForPath(window.location.pathname);

// Manifesto, ícones e título do app certo, antes de renderizar.
function setHead(selector, create, attrs) {
  let el = document.head.querySelector(selector);
  if (!el) { el = document.createElement(create); document.head.appendChild(el); }
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
}
document.title = app.title;
setHead('link[rel="manifest"]', 'link', { rel: 'manifest', href: app.manifest });
setHead('link[rel="apple-touch-icon"]', 'link', { rel: 'apple-touch-icon', href: app.appleIcon });
setHead('link[rel="icon"]', 'link', { rel: 'icon', type: 'image/png', href: app.favicon });
setHead('meta[name="apple-mobile-web-app-title"]', 'meta', { name: 'apple-mobile-web-app-title', content: app.appleTitle });
setHead('meta[name="apple-mobile-web-app-capable"]', 'meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
setHead('meta[name="mobile-web-app-capable"]', 'meta', { name: 'mobile-web-app-capable', content: 'yes' });
setHead('meta[name="apple-mobile-web-app-status-bar-style"]', 'meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' });

registerSW();

const Root = { caixa: CaixaApp, namesa: NaMesaApp, further: App }[app.key];

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
    <OfflineBanner />
    <InstallPrompt appKey={app.key} appName={app.title} />
  </React.StrictMode>,
);
```

Em `index.html`, remover `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />` e trocar o `<title>` por `<title>Further</title>`.

- [ ] **Step 4:** `cd frontend && node --test` → PASS. `npx vite build` → ok. Conferir que `frontend/dist/sw.js`, `dist/*.webmanifest`, `dist/icons/` e `dist/brand/` existem.

- [ ] **Step 5: Servidor serve os arquivos certos**

Com `npm run build` na raiz (copia o `dist` para `backend/frontend-dist`) e o backend rodando (`BAILEYS_AUTOCONNECT=false node src/server.js`):

```bash
curl -sI localhost:5000/sw.js | grep -i "content-type\|cache-control"
curl -sI localhost:5000/namesa.webmanifest | grep -i content-type
curl -s localhost:5000/namesa.webmanifest | head -c 60
```

Expected:
- `sw.js` com `application/javascript`.
- O manifesto com `application/manifest+json`, e o corpo começando com `{`. Não pode ser o `index.html` da SPA.

Se o `.webmanifest` sair com o content-type errado, adicionar em `server.js`, antes do `express.static`:

```js
express.static.mime.define({ 'application/manifest+json': ['webmanifest'] });
```

Se o `sw.js` vier com `max-age` maior que 0, servir com `setHeaders` no `express.static` do `frontendDistPath`:

```js
app.use(express.static(frontendDistPath, {
  setHeaders: (res, filePath) => { if (filePath.endsWith('sw.js')) res.setHeader('Cache-Control', 'no-cache'); }
}));
```

- [ ] **Step 6: Commit**

```bash
git add frontend/public frontend/src/pwa frontend/src/main.jsx frontend/index.html frontend/src/index.css backend/src/server.js
git commit -m "feat(pwa): 3 apps instalaveis (manifestos, service worker, instalar, sem conexao)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Teste que trava cor fixa + componentes de UI reaproveitáveis

**Files:**
- Create: `frontend/src/theme/noHardcodedColors.test.js`
- Create: `frontend/src/theme/pendingColorFiles.js` (lista de arquivos ainda não convertidos, que encolhe a cada tarefa)
- Create: `frontend/src/components/ui/Sheet.jsx`
- Create: `frontend/src/components/ui/ResponsiveTable.jsx`
- Modify: `frontend/src/components/Modal.jsx`

**Interfaces:**
- Produces:
  - `PENDING_COLOR_FILES: string[]`, com caminhos relativos a `src/` e barras `/`.
  - `<Sheet open onClose title children />`: folha de baixo no celular, modal centralizado no tablet e no PC.
  - `<ResponsiveTable columns rows rowKey cardTitle? />`: tabela no tablet e no PC (rolagem lateral no tablet, primeira coluna fixa), cartões no celular. `columns: [{ key, label, render?(row), align?, hideOnCard? }]`.
  - `Modal`: mesma API de hoje, tela inteira no celular.

- [ ] **Step 1: Teste que trava cor fixa**

```js
// frontend/src/theme/noHardcodedColors.test.js
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
```

- [ ] **Step 2: Lista inicial** (gerar com o comando abaixo e colar no arquivo):

```bash
cd frontend/src && grep -rlE "#[0-9a-fA-F]{3,8}\b|\brgba?\(" --include=*.jsx . | sed 's#^\./##' | sort
```

```js
// frontend/src/theme/pendingColorFiles.js
// Arquivos que ainda têm cor fixa. Cada tarefa de conversão tira os seus daqui.
// No fim do plano esta lista tem que estar VAZIA.
export const PENDING_COLOR_FILES = [
  // colar aqui a saída do comando, um caminho por linha, entre aspas
];
```

- [ ] **Step 3:** `cd frontend && node --test` → PASS (todos os arquivos com cor ainda estão na lista). Agora **tire `components/Modal.jsx` da lista** e rode de novo → FAIL apontando as linhas de `Modal.jsx`.

- [ ] **Step 4: Modal + Sheet + ResponsiveTable**

```jsx
// frontend/src/components/Modal.jsx
import React from 'react';
import { createPortal } from 'react-dom';

// Renderizado direto no <body> (portal): dentro da área principal ele herdava o contexto
// de camadas dela, e a barra lateral ficava por cima do modal.
// No celular ocupa a tela inteira (classe .modal-panel no index.css).
export default function Modal({ onClose, children, maxWidth = '720px' }) {
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth }}>
        {children}
      </div>
    </div>,
    document.body
  );
}
```

```jsx
// frontend/src/components/ui/Sheet.jsx
import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

// Folha que sobe de baixo no celular; modal centralizado no tablet/PC.
export default function Sheet({ open, onClose, title, children }) {
  if (!open) return null;
  return createPortal(
    <div className="modal-backdrop sheet-backdrop" onClick={onClose}>
      <div className="modal-panel sheet-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="sheet-header">
          <strong>{title}</strong>
          <button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}
```

```jsx
// frontend/src/components/ui/ResponsiveTable.jsx
import React from 'react';
import { useBreakpoint } from '../../responsive/useBreakpoint.js';

// Tabela no tablet/PC (rolagem lateral + 1ª coluna fixa), cartões no celular.
export default function ResponsiveTable({ columns, rows, rowKey, cardTitle, emptyText = 'Nada por aqui ainda.' }) {
  const bp = useBreakpoint();
  if (!rows.length) return <p style={{ color: 'var(--text-muted)', padding: '16px' }}>{emptyText}</p>;
  const cell = (col, row) => (col.render ? col.render(row) : row[col.key]);

  if (bp === 'phone') {
    const titleCol = cardTitle || columns[0];
    return (
      <div className="rt-cards">
        {rows.map((row) => (
          <div className="rt-card" key={rowKey(row)}>
            <div className="rt-card-title">{cell(titleCol, row)}</div>
            <dl>
              {columns.filter((c) => c !== titleCol && !c.hideOnCard).map((c) => (
                <div key={c.key} className="rt-card-row"><dt>{c.label}</dt><dd>{cell(c, row)}</dd></div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="rt-scroll">
      <table className="rt-table">
        <thead><tr>{columns.map((c) => <th key={c.key} style={{ textAlign: c.align || 'left' }}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>{columns.map((c) => <td key={c.key} style={{ textAlign: c.align || 'left' }}>{cell(c, row)}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

CSS em `index.css`:

```css
/* ===== Modal / Sheet ===== */
.modal-backdrop {
  position: fixed; inset: 0; background: var(--overlay); z-index: 1000;
  display: flex; align-items: center; justify-content: center; padding: 20px;
}
.modal-panel {
  background: var(--bg-elevated); color: var(--text-primary);
  border: 1px solid var(--border-color); border-radius: var(--radius-md);
  padding: 20px; width: 100%; max-height: 85vh; overflow-y: auto; box-shadow: var(--shadow-card);
}
.sheet-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
@media (max-width: 640px) {
  .modal-backdrop { padding: 0; align-items: stretch; }
  .modal-panel {
    max-width: none !important; max-height: none; height: 100dvh; border-radius: 0; border: none;
    padding: calc(16px + env(safe-area-inset-top)) 16px calc(16px + env(safe-area-inset-bottom));
  }
  .sheet-backdrop { align-items: flex-end; }
  .sheet-panel { height: auto; max-height: 90dvh; border-radius: var(--radius-lg) var(--radius-lg) 0 0; }
}

/* ===== ResponsiveTable ===== */
.rt-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.rt-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
.rt-table th { color: var(--text-muted); font-weight: 600; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; }
.rt-table th, .rt-table td { padding: 12px 14px; border-bottom: 1px solid var(--border-color); white-space: nowrap; }
.rt-table tr > :first-child { position: sticky; left: 0; background: var(--bg-card); z-index: 1; }
.rt-cards { display: grid; gap: 10px; }
.rt-card { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 14px; }
.rt-card-title { font-weight: 700; margin-bottom: 8px; }
.rt-card-row { display: flex; justify-content: space-between; gap: 12px; padding: 4px 0; font-size: 0.9rem; }
.rt-card-row dt { color: var(--text-muted); }
.rt-card-row dd { text-align: right; }
```

- [ ] **Step 5:** `cd frontend && node --test` → PASS (`Modal.jsx` limpo). `npx vite build` → ok.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/theme frontend/src/components/ui frontend/src/components/Modal.jsx frontend/src/index.css
git commit -m "feat(ui): trava de cor fixa, Sheet, ResponsiveTable e modal tela cheia no celular

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Na Mesa responsivo e com tema

**Files:**
- Modify: `frontend/src/NaMesaApp.jsx`, `frontend/src/components/namesa/QueueBoard.jsx`, `frontend/src/components/namesa/WaitlistSettings.jsx`
- Modify: `frontend/src/theme/pendingColorFiles.js` (tirar os 3)
- Modify: `frontend/src/index.css` (classes `.nm-*`)

**Interfaces:**
- Consumes: `useBreakpoint`, `ThemeToggle`, `AppIcon`, `BrandLogo`, `Sheet` (Tasks 1–5).

- [ ] **Step 1: RED.** Tirar os 3 arquivos de `PENDING_COLOR_FILES` → `cd frontend && node --test` FAIL listando as linhas deles.

- [ ] **Step 2: Converter e ajustar o layout**

Cores: conversão pela tabela das Global Constraints. O objeto `C` de cores no topo dos 3 arquivos é **removido**; cada uso vira `var(--...)`. O âmbar do Na Mesa (`#f59e0b` como destaque) vira `var(--accent-primary)` (turquesa), porque o usuário escolheu as cores da Further em tudo. Status:
- Chamar: `var(--accent-warning)`, com texto `var(--on-accent)` só se o contraste passar. Se não passar, usar fundo `color-mix(in srgb, var(--accent-warning) 18%, transparent)` com texto `var(--text-primary)` e borda `var(--accent-warning)`.
- Sentou: `var(--accent-success)`.
- Não veio: `var(--bg-card-hover)`.
- Atrasado: `var(--accent-danger)`.

`NaMesaApp.jsx`:
- **Login (seleção e PIN):** container com `minHeight: '100dvh'` e classe `page-pad`. No topo vão `<AppIcon app="namesa" size={64} />`, o `<h1>Na Mesa</h1>` e o subtítulo "Fila de espera". No canto superior direito, `<ThemeToggle />`. No rodapé, `<span>por</span> <BrandLogo variant="horizontal" height={18} />`, centralizado, com `opacity: 0.8`.
- **Cabeçalho do app:** `<AppIcon app="namesa" size={32} />` + "Na Mesa · {restaurante}".
  - No celular (`bp === 'phone'`), o nome do restaurante vai numa segunda linha menor, e os botões de aba mostram **só o ícone** (com `aria-label`).
  - Depois das abas vêm `<ThemeToggle />` e o botão sair (`className="icon-button"`).
  - O cabeçalho é `position: sticky; top: 0`, com `paddingTop: env(safe-area-inset-top)` e `background: var(--bg-sidebar)`.

`QueueBoard.jsx` (`const bp = useBreakpoint()`):
- **Resumo do dia:** no celular, `display: flex; overflowX: auto; scroll-snap-type: x mandatory`, com cada item `flex: 0 0 auto; minWidth: 120px`. No tablet e no PC, como hoje (`flex-wrap`).
- **Linha da fila** (`row()`):
  - **Celular:** cartão em coluna.
    - Linha 1: a posição (fonte 1.8rem) à esquerda, nome + "· N pessoas" ao lado e um botão `⋯` (`MoreVertical`) à direita. O `⋯` abre um `Sheet` com "Editar" e "Remover".
    - Linha 2: os tempos.
    - Linha 3: grid `repeat(3, 1fr)` (ou 2 colunas para "chamados", que não têm Chamar) com os botões Chamar / Sentou / Não veio, cada um com `minHeight: 48px` e rótulo + ícone.
  - **Tablet/PC:** o layout atual (faixa única, botões à direita).
- **"+ Adicionar":**
  - No celular vira botão flutuante, `position: fixed; right: 16px; bottom: calc(16px + env(safe-area-inset-bottom)); width: 56px; height: 56px; borderRadius: 50%`, com ícone `Plus`, `background: var(--accent-primary)`, `color: var(--on-accent)` e `boxShadow: var(--shadow-card)`.
  - O formulário abre num `<Sheet title="Adicionar na fila">`, com os campos em coluna e o botão "Colocar na fila" com largura total.
  - No tablet e no PC, continua o botão + formulário inline de hoje.
- **Aviso de WhatsApp:** `background: color-mix(in srgb, var(--accent-danger) 12%, transparent)`, `border: 1px solid var(--accent-danger)`, `color: var(--text-primary)`.
- A lista ganha `paddingBottom: 96px` no celular, para o botão flutuante não cobrir o último cartão.

`WaitlistSettings.jsx`:
- O grid já é `auto-fit minmax(300px)` (vira uma coluna no celular). Campos com `background: var(--bg-input)`, `color: var(--text-primary)` e `border: 1px solid var(--border-color)`.
- No celular, botões com largura total.
- O HTML da janela de impressão do QR fica **claro e fixo**, porque é papel. As cores dentro da template string recebem `/* cor-fixa-ok */` na mesma linha.

- [ ] **Step 3: GREEN.** `cd frontend && node --test` → PASS. `npx vite build` → ok.

- [ ] **Step 4: Conferência rápida** (Playwright, os 2 servidores locais, um cliente de teste "Mercearia (teste)" igual ao da sessão do Na Mesa; ver diário). Screenshot de `/namesa` em 375×812 e 1024×768, nos temas claro e escuro. **Ler cada imagem** e corrigir o que estiver ruim: texto ilegível, botão cortado ou rolagem lateral (`document.documentElement.scrollWidth <= window.innerWidth`).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/NaMesaApp.jsx frontend/src/components/namesa frontend/src/theme/pendingColorFiles.js frontend/src/index.css
git commit -m "feat(namesa): layout de celular (cartoes, botao flutuante) e tema claro/escuro

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Caixa responsivo e com tema

**Files:**
- Modify: `frontend/src/CaixaApp.jsx`, `frontend/src/components/CaixaChatView.jsx`, `frontend/src/components/CaixaFunilView.jsx`, `frontend/src/components/ContactDetailPanel.jsx`, `frontend/src/components/AttributionView.jsx`, `frontend/src/components/whatsappMedia.jsx`, `frontend/src/components/chatFormat.jsx` (se tiver cor), `frontend/src/components/crm/CrmBoard.jsx`, `frontend/src/components/crm/DealBar.jsx`, `frontend/src/components/crm/CrmSettings.jsx`
- Modify: `frontend/src/theme/pendingColorFiles.js`, `frontend/src/index.css`

**Interfaces:**
- Consumes: `useBreakpoint`, `ThemeToggle`, `AppIcon`, `BrandLogo`.
- `ContactDetailPanel` ganha a prop opcional `onBack` (mostra a seta voltar no cabeçalho quando passada).

- [ ] **Step 1: RED.** Tirar os arquivos acima de `PENDING_COLOR_FILES` → `node --test` FAIL.

- [ ] **Step 2: Converter e ajustar o layout**

Cores pela tabela. **Exceções `cor-fixa-ok`** em `CrmSettings.jsx` e `CrmBoard.jsx`: a lista de amostras de cor para escolher a cor da etapa ou da tag, e o uso de `stage.color`/`tag.color` que vem do banco. Texto sobre a cor da etapa/tag escolhida: usar `var(--on-accent)` se a cor for escura, ou `var(--brand-navy)` se for clara. Para isso, criar em `crm/` uma função pura `readableOn(hex)` (luminância > 0,5 → `'var(--brand-navy)'`, senão `'var(--on-accent)'`) **com teste** `crm/readableOn.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readableOn } from './readableOn.js';

test('texto escuro sobre cor clara e claro sobre cor escura', () => {
  assert.equal(readableOn('#fde047'), 'var(--brand-navy)');
  assert.equal(readableOn('#1e3a8a'), 'var(--on-accent)');
  assert.equal(readableOn('lixo'), 'var(--text-primary)');
});
```

```js
// frontend/src/components/crm/readableOn.js
export function readableOn(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return 'var(--text-primary)';
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.5 ? 'var(--brand-navy)' : 'var(--on-accent)';
}
```

`CaixaApp.jsx` (`const bp = useBreakpoint()`):
- **Login:** mesmo padrão do Na Mesa (`AppIcon app="caixa"`, "Caixa", `ThemeToggle`, rodapé "por Further"), com `minHeight: 100dvh`.
- **Shell:** no PC e no tablet fica o rail atual à esquerda (cores convertidas: ativo `var(--accent-primary)` com `var(--on-accent)`, inativo `var(--text-secondary)`) e `ThemeToggle` acima do Sair.
- **Shell no celular:**
  - Coluna `height: 100dvh`.
  - Conteúdo `flex: 1; overflow: hidden; padding: 0`.
  - **Barra de abas embaixo:** `<nav>` com `display: grid; grid-template-columns: repeat(4, 1fr)` (Conversas, Funil, Agenda, Mais), `paddingBottom: env(safe-area-inset-bottom)`, `background: var(--bg-sidebar)` e `borderTop: 1px solid var(--border-color)`.
  - Cada aba tem ícone + rótulo pequeno e `minHeight: 56px`.
  - "Mais" abre um `Sheet` com o `ThemeToggle` ("Tema claro/escuro") e "Sair".
- O padding do conteúdo (`20px`) passa a `0` no celular e a `12px` no tablet.

`CaixaChatView.jsx`:
- **PC:** `gridTemplateColumns: '300px 1fr'`. **Tablet:** `'280px 1fr'`.
- **Celular:** uma tela por vez.
  - Sem `selectedContact`, mostra só a lista em tela cheia.
  - Com `selectedContact`, mostra só o `ContactDetailPanel` com `onBack={() => setSelectedContact(null)}`.
  - O botão voltar do Android/iOS também fecha a conversa: `history.pushState({ chat: id }, '')` ao abrir e um listener de `popstate` que limpa a seleção.

`ContactDetailPanel.jsx`:
- Com `onBack`, o cabeçalho ganha um `icon-button` com `ArrowLeft` à esquerda do avatar.
- No celular, as abas (Conversa/Histórico/Origem/...) ficam com rolagem lateral (`overflowX: auto`, sem quebrar).
- O campo de resposta fica `position: sticky; bottom: 0` com `paddingBottom: env(safe-area-inset-bottom)`.
- Balões: recebido `var(--bg-card-hover)` / texto `var(--text-primary)`; enviado `var(--accent-primary)` / texto `var(--on-accent)`; horário `color-mix(in srgb, currentColor 70%, transparent)`.

`CrmBoard.jsx`:
- No celular, cada coluna fica com `flex: 0 0 85vw`, o container com `scroll-snap-type: x mandatory` e as colunas com `scroll-snap-align: start`.
- No tablet, `flex: 0 0 300px`.
- Filtros quebram linha (`flex-wrap`).

`whatsappMedia.jsx`: o lightbox usa `var(--overlay)`. O avatar sem foto usa `var(--accent-primary)` com as iniciais em `var(--on-accent)`.

- [ ] **Step 3: GREEN.** `cd frontend && node --test` → PASS. `npx vite build` → ok.

- [ ] **Step 4: Conferência rápida.** Com o Playwright, fazer login no `/caixa` de um cliente de teste com conversas (o cliente de teste com mensagens simuladas por webhook, como no Na Mesa, com `dashboard_enabled=true`) e tirar screenshots em 375px (lista, conversa aberta, funil) e em 1024px, nos dois temas. Ler as imagens e corrigir.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/CaixaApp.jsx frontend/src/components frontend/src/theme/pendingColorFiles.js frontend/src/index.css
git commit -m "feat(caixa): layout de celular estilo WhatsApp (abas embaixo, lista/conversa) e tema

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Dashboard, estrutura (barra lateral, topo, login, KPIs)

**Files:**
- Modify: `frontend/src/components/Sidebar.jsx`, `frontend/src/components/Navbar.jsx`, `frontend/src/pages/LoginPage.jsx`, `frontend/src/components/KPICards.jsx`, `frontend/src/App.jsx`
- Modify: `frontend/src/theme/pendingColorFiles.js`, `frontend/src/index.css`

**Interfaces:**
- Consumes: `BrandLogo`, `ThemeToggle`, `Sheet`, `useBreakpoint`.

- [ ] **Step 1: RED.** Tirar os 5 arquivos da lista → FAIL.

- [ ] **Step 2: Converter e ajustar**

- **`Sidebar.jsx`:** o bloco "Brand Header" (o quadrado com `BarChart3` em gradiente + "Further Ads / Ads Analytics Engine") vira `<BrandLogo variant="horizontal" height={36} />`, com "Painel de campanhas" em `var(--text-muted)` embaixo.
  - Avatar do usuário: admin `var(--accent-primary)`, cliente `var(--accent-success)`, texto `var(--on-accent)`.
  - Item de menu ativo: `background: color-mix(in srgb, var(--accent-primary) 14%, transparent)`, `color: var(--accent-link)` e borda esquerda `var(--accent-primary)`.
- **`Navbar.jsx`:**
  - `<ThemeToggle />` à direita, antes do botão de sincronizar.
  - No celular (`bp === 'phone'`), os 3 seletores (cliente, plataforma, período) saem da barra e vão para um `Sheet title="Filtros"`, aberto por um botão "Filtros" (ícone `SlidersHorizontal`) que mostra a contagem de filtros diferentes do padrão.
  - No tablet, continuam na barra com `flex-wrap`.
  - O botão de menu (hambúrguer) aparece até 1024px (já existe, `.mobile-menu-btn`).
- **`LoginPage.jsx`:** `<BrandLogo variant="vertical" height={140} />` no lugar do cabeçalho atual, `ThemeToggle` no canto, container `minHeight: 100dvh`, cartão do formulário com `width: min(400px, 100%)`.
- **`KPICards.jsx`:** grid `repeat(auto-fit, minmax(220px, 1fr))` no PC/tablet e `repeat(2, 1fr)` no celular (com o valor em 1.3rem). Cores pela tabela (as cores por plataforma usam `--accent-google`/`--accent-meta`).
- **`App.jsx`:** o cartão de resultado da sincronização usa `color-mix` para as bordas de sucesso e erro (tabela). O `main-content` recebe a classe `page-pad`.

- [ ] **Step 3: GREEN.** `node --test` → PASS. Build ok.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/Sidebar.jsx frontend/src/components/Navbar.jsx frontend/src/pages/LoginPage.jsx frontend/src/components/KPICards.jsx frontend/src/App.jsx frontend/src/theme/pendingColorFiles.js frontend/src/index.css
git commit -m "feat(dashboard): logo da Further, filtros em folha no celular e tema

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Dashboard, páginas, tabelas e gráficos

**Files:**
- Modify: `frontend/src/components/ChartsSection.jsx`, `frontend/src/components/CampaignsTable.jsx`, `frontend/src/pages/RemarketingPage.jsx`, `frontend/src/pages/TrackingLinksPage.jsx`, `frontend/src/pages/WhatsAppDashboardPage.jsx`, `frontend/src/pages/ClientsPage.jsx`, `frontend/src/pages/CredentialsPage.jsx`, `frontend/src/pages/TrackingPage.jsx`, `frontend/src/pages/WhatsAppInboxPage.jsx`, `frontend/src/pages/WhatsAppKanbanPage.jsx`, `frontend/src/pages/WhatsAppAgendaPage.jsx`, `frontend/src/pages/DashboardPage.jsx`
- Modify: `frontend/src/theme/pendingColorFiles.js`

**Interfaces:**
- Consumes: `useTheme().chart`, `ResponsiveTable`, `useBreakpoint`.

- [ ] **Step 1: RED.** Tirar os arquivos da lista → FAIL.

- [ ] **Step 2: Converter e ajustar**

- **Gráficos (`ChartsSection.jsx`, `WhatsAppDashboardPage.jsx`):**
  - `const { chart } = useTheme();`.
  - `CartesianGrid stroke={chart.grid}`, `XAxis/YAxis tick={{ fill: chart.axis, fontSize: 12 }} stroke={chart.grid}`.
  - `Tooltip contentStyle={{ background: chart.tooltipBg, border: '1px solid var(--border-color)', color: chart.tooltipText, borderRadius: 8 }}` e `labelStyle={{ color: chart.tooltipText }}`.
  - Séries: Google `var(--accent-google)`; Meta `var(--accent-meta)`; as demais `chart.series[i]`. No recharts, `stroke`/`fill` aceitam `var(--x)` em SVG; se algum não aceitar (gradiente `<stop stopColor>`), usar o valor lido de `chart.series`.
  - Altura dos gráficos: `bp === 'phone' ? 220 : 300`, com a `Legend` embaixo (`verticalAlign="bottom"`).
- **Tabelas → `ResponsiveTable`:**
  - Arquivos: `CampaignsTable.jsx`, a tabela de `RemarketingPage.jsx`, as 2 de `TrackingLinksPage.jsx` e a "resultado por campanha" de `WhatsAppDashboardPage.jsx`.
  - Cada `<table>` vira `<ResponsiveTable columns=[...] rows={...} rowKey={(r) => r.id} />`, mantendo as mesmas colunas, formatações e ações (os botões de ação viram uma coluna com `render`).
  - Nos cartões do celular, colunas secundárias podem ganhar `hideOnCard: true`, deixando no máximo 5 linhas por cartão.
- **Formulários (`ClientsPage`, `CredentialsPage`, `TrackingLinksPage`):** grids de 2 colunas usam a classe `form-grid-2col` (já vira 1 coluna no celular). Linhas de botões ganham `stack-phone`.
- **`WhatsAppKanbanPage`/`WhatsAppAgendaPage`:** só cores. O quadro já usa `CrmBoard`, ajustado na Task 7.
- Demais cores pela tabela.

- [ ] **Step 3: GREEN.** `node --test` → PASS. Build ok.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components frontend/src/pages frontend/src/theme/pendingColorFiles.js
git commit -m "feat(dashboard): tabelas viram cartoes no celular, graficos seguem o tema

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Relatório e apresentação (tela, celular e impressão clara)

**Files:**
- Modify: `frontend/src/components/ReportModal.jsx`, `frontend/src/components/PresentationView.jsx`
- Modify: `frontend/src/index.css` (bloco `@media print`)
- Modify: `frontend/src/theme/pendingColorFiles.js` (deve ficar **vazia**)

**Interfaces:**
- Consumes: `useTheme`, `useBreakpoint`.
- Os blocos `[data-theme]` da Task 1 permitem forçar o claro numa sub-árvore.

- [ ] **Step 1: RED.** Tirar os 2 arquivos da lista (que fica vazia) → FAIL.

- [ ] **Step 2: Converter e ajustar**

- **Cores pela tabela** (são mais de 170 literais; converter todos). Os gráficos usam `useTheme().chart`, como na Task 9.
- **Área imprimível:** a `div#printable-report-area` recebe `data-theme={exporting ? 'light' : undefined}`. Ao exportar PDF (o fluxo com `html2canvas`), antes de capturar:

```js
setExporting(true);
await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); // espera repintar no claro
// ... html2canvas(area, { backgroundColor: getComputedStyle(area).getPropertyValue('--bg-card').trim() || '#ffffff' /* cor-fixa-ok */ }) ...
setExporting(false);
```

  Os gráficos dentro da área leem cores do tema global. Para a captura, passe ao `ReportModal` as cores do claro: um `chartColors` calculado lendo as variáveis de dentro da própria área (`getComputedStyle(area)`) quando `exporting` for verdadeiro.
- **`@media print` do `index.css`:** trocar o bloco atual (que força fundo escuro) por:

```css
@media print {
  #printable-report-area, #printable-report-area * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  body { background: #ffffff !important; color: #000D30 !important; }
  aside, header, .no-print, nav, button, .install-banner, .offline-banner { display: none !important; }
  #printable-report-area { width: 100% !important; margin: 0 !important; padding: 20px !important; border: none !important; box-shadow: none !important; }
  @page { size: A4 portrait; margin: 10mm; }
}
```

  Antes de `window.print()`, o código também seta `data-theme="light"` na área e restaura no evento `afterprint`.
- **Celular:**
  - `ReportModal` usa o `Modal`, que já fica em tela cheia no celular. Os blocos internos em grid passam para uma coluna com `repeat(auto-fit, minmax(260px, 1fr))`.
  - `PresentationView`: no celular, slides empilhados com rolagem vertical (sem a navegação de slide) e texto grande reduzido em 30%.

- [ ] **Step 3: GREEN.** `node --test` → PASS, e `PENDING_COLOR_FILES` vazio. Build ok.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ReportModal.jsx frontend/src/components/PresentationView.jsx frontend/src/index.css frontend/src/theme/pendingColorFiles.js
git commit -m "feat(relatorio): tema, celular e impressao/PDF sempre no claro

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Remover a lista de pendentes

**Files:**
- Modify: `frontend/src/theme/noHardcodedColors.test.js`
- Delete: `frontend/src/theme/pendingColorFiles.js`

- [ ] **Step 1:** No teste, remover o import de `PENDING_COLOR_FILES`, a linha `if (PENDING_COLOR_FILES.includes(rel)) continue;` e o segundo teste ("a lista de pendentes..."). Apagar `pendingColorFiles.js`.
- [ ] **Step 2:** `cd frontend && node --test` → PASS. `npx vite build` → ok.
- [ ] **Step 3: Commit**

```bash
git add -A frontend/src/theme
git commit -m "test(ui): trava de cor fixa vale pro frontend inteiro

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Conferência visual completa + PWA no navegador + diário

Sem código de produto. Corrige o que a conferência achar.

**Files:**
- Modify: `docs/diario.md`
- Create (scratchpad, não commitar): script de screenshots

- [ ] **Step 1: Subir local.**
  - `npm run build` na raiz.
  - Backend com `BAILEYS_AUTOCONNECT=false META_APP_SECRET=namesa_local_test node src/server.js`, servindo o build em `localhost:5000`, porque o service worker só registra em produção.
  - Criar 2 clientes de teste no banco: um só Na Mesa e um com dashboard + WhatsApp `cloud_api` falso, com algumas mensagens por webhook. Usar o script do diário (sessão do Na Mesa) como base.
  - Para o admin, pedir ao usuário uma senha de admin local **ou** gerar um JWT de admin assinado com o `JWT_SECRET` do `.env` local (só para a conferência, sem deixar arquivo no repo).
- [ ] **Step 2: Screenshots com o Playwright**, em larguras 375, 768 e 1280 × temas claro e escuro, setando `localStorage.theme` antes de carregar. As telas:
  - Login do Further.
  - Dashboard (KPIs + gráficos).
  - Campanhas.
  - Funil (admin).
  - Painel do contato.
  - Clientes.
  - Chaves e APIs.
  - Links e Conversões.
  - Dashboard WhatsApp.
  - Relatório (modal).
  - `/caixa`: login, lista, conversa e funil.
  - `/namesa`: login, fila com 4 pessoas e Configurar.

  Em cada uma, o script registra `document.documentElement.scrollWidth > window.innerWidth` (rolagem lateral) e qualquer erro do console.
- [ ] **Step 3: Ler as imagens** (em lotes por app) e listar problemas: texto ilegível, sobreposição, botão < 44px, rolagem lateral, pedaço escuro no claro ou claro no escuro. Corrigir cada um, rodar `node --test` + build e commitar com `fix(ui): ...`.
- [ ] **Step 4: Relatório no claro.** Abrir o relatório com tema escuro, chamar a exportação e conferir (screenshot da área com `data-theme="light"`) que sai claro e legível.
- [ ] **Step 5: PWA no Chromium.** Em `localhost:5000/namesa`, `/caixa` e `/`, conferir:
  - `document.querySelector('link[rel=manifest]').href` aponta pro manifesto certo.
  - `await navigator.serviceWorker.ready` resolve.
  - Pela aba de rede (`browser_network_requests`), uma chamada `/api/...` depois de recarregar não vem do service worker.
- [ ] **Step 6: Limpar** os dados de teste do banco e parar os servidores.
- [ ] **Step 7: Diário.** Entrada nova em `docs/diario.md` (o que mudou, como testar o PWA no celular, o que não foi testado em aparelho real), atualizando "Estado atual". Commit `docs(diario): responsivo, tema e PWA`.
