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
