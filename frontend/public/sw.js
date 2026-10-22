// Service worker único dos 3 apps. Regra igual a src/pwa/swStrategy.js.
const CACHE = 'further-shell-v2';
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
          // Só guarda como shell uma página que veio certa (um 502 no meio do deploy não).
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(SHELL, copy));
          }
          return res;
        })
        .catch(() => caches.match(SHELL))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      // O fallback da SPA responde 200 com index.html pra um /assets/x.js que sumiu num
      // deploy: isso não pode ficar guardado no lugar do JS.
      const isHtml = (res.headers.get('content-type') || '').includes('text/html');
      if (res.ok && !isHtml) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }))
  );
});

// ---- Notificações push (Caixa e Na Mesa instalados) ----
// O servidor manda { title, body, tag, url, badge }. badge é o número da bolinha no ícone.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const app = (data.url || '').startsWith('/namesa') ? 'namesa' : 'caixa';
  const jobs = [
    self.registration.showNotification(data.title || 'Nova mensagem', {
      body: data.body || '',
      tag: data.tag,
      renotify: Boolean(data.tag),
      icon: `/icons/${app}-192.png`,
      badge: `/icons/${app}-192.png`,
      data: { url: data.url || '/' }
    })
  ];
  if (typeof data.badge === 'number' && self.navigator.setAppBadge) {
    jobs.push((data.badge > 0 ? self.navigator.setAppBadge(data.badge) : self.navigator.clearAppBadge()).catch(() => {}));
  }
  event.waitUntil(Promise.all(jobs));
});

// Tocar na notificação abre o app (ou traz pra frente se já estiver aberto).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      // O Balcão também abre no /caixa (app instalado antes da troca de nome).
      const paths = url === '/balcao' ? ['/balcao', '/caixa'] : [url];
      const open = windows.find((w) => paths.some((p) => new URL(w.url).pathname.startsWith(p)));
      return open ? open.focus() : self.clients.openWindow(url);
    })
  );
});
