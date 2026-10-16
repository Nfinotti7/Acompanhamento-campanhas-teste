import { useEffect, useState, useCallback } from 'react';
import { resolveTheme, THEME_STORAGE_KEY } from './resolveTheme.js';

function readStored() {
  try { return localStorage.getItem(THEME_STORAGE_KEY); } catch { return null; }
}

function cssVar(name, el = document.documentElement) {
  return getComputedStyle(el).getPropertyValue(name).trim();
}

function apply(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', cssVar('--bg-sidebar') || '#000D30'); // cor-fixa-ok
}

const listeners = new Set();

// Cores pros gráficos (recharts não lê variável CSS sozinho). `el` permite ler as
// cores de uma área forçada no claro (relatório exportado).
export function chartColors(el) {
  return {
    grid: cssVar('--border-color', el),
    axis: cssVar('--text-muted', el),
    tooltipBg: cssVar('--bg-elevated', el),
    tooltipText: cssVar('--text-primary', el),
    series: [1, 2, 3, 4, 5, 6].map((i) => cssVar(`--chart-${i}`, el))
  };
}

export function useTheme() {
  const [theme, setThemeState] = useState(() =>
    resolveTheme(readStored(), window.matchMedia('(prefers-color-scheme: dark)').matches));

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
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
