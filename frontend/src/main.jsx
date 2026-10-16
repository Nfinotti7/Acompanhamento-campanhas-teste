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
setHead('meta[name="apple-mobile-web-app-status-bar-style"]', 'meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'black' });

registerSW();

const Root = { caixa: CaixaApp, namesa: NaMesaApp, further: App }[app.key];

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
    <OfflineBanner />
    <InstallPrompt appKey={app.key} appName={app.title} />
  </React.StrictMode>,
);
