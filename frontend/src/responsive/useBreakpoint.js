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
