// Som gerado pelo próprio navegador (Web Audio) -- sem arquivo de áudio pra hospedar.
// Navegadores só liberam áudio depois de alguma interação do usuário na página; quando
// a sessão do /caixa volta sozinha do localStorage (sem clique de login), o som só passa
// a tocar depois do primeiro clique em qualquer lugar da tela.
let audioCtx = null;

function getContext() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
  }
  return audioCtx;
}

export function unlockNotificationSound() {
  const ctx = getContext();
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

export function playNotificationSound() {
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();

  const start = ctx.currentTime;
  [[880, 0], [1320, 0.12]].forEach(([freq, offset]) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, start + offset);
    gain.gain.exponentialRampToValueAtTime(0.25, start + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.22);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start + offset);
    osc.stop(start + offset + 0.25);
  });
}
