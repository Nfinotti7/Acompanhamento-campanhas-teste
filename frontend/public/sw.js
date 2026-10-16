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
