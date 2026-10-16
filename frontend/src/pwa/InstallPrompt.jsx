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
