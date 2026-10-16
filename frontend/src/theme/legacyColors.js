// O html2canvas 1.4 (PDF do relatório, imagem da apresentação) só entende rgb/rgba/hsl/hex
// e lança erro com color(srgb ...), que é como o navegador entrega um color-mix() calculado.
// Converte pra rgba() na cópia que vai ser desenhada.

const COLOR_FN = /color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)/g;

const channel = (v) => Math.round(Math.min(1, Math.max(0, parseFloat(v))) * 255);

export function toLegacyColors(value) {
  if (!value) return value;
  return String(value).replace(COLOR_FN, (m, r, g, b, a) => {
    let alpha = a === undefined ? 1 : a.endsWith('%') ? parseFloat(a) / 100 : parseFloat(a);
    alpha = Math.round(alpha * 1000) / 1000;
    return `rgba(${channel(r)}, ${channel(g)}, ${channel(b)}, ${alpha})`;
  });
}

const COLOR_PROPS = [
  'color', 'background-color', 'background-image', 'box-shadow', 'text-shadow',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'outline-color', 'fill', 'stroke'
];

// Chamar no onclone do html2canvas: reescreve como estilo inline, em cada elemento da cópia,
// as cores calculadas que o html2canvas não sabe ler.
export function legacyColorsInClone(root) {
  const win = root.ownerDocument.defaultView;
  const all = [root, ...root.querySelectorAll('*')];
  for (const el of all) {
    const cs = win.getComputedStyle(el);
    for (const prop of COLOR_PROPS) {
      const v = cs.getPropertyValue(prop);
      if (v && v.includes('color(')) el.style.setProperty(prop, toLegacyColors(v), 'important');
    }
  }
}
