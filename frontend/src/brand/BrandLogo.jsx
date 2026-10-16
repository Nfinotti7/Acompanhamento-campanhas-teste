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
