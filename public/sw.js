// Minimal service worker. Navigations are NETWORK-FIRST (an online client always gets the latest
// app shell -> latest hashed assets; falls back to cache offline). Hashed build assets are
// cache-first (immutable). Gives installability + offline without the stale-build trap.
const CACHE = 'shithead-v2';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req)
      .then((res) => { const c = res.clone(); caches.open(CACHE).then((ca) => ca.put('./index.html', c)).catch(() => {}); return res; })
      .catch(() => caches.match('./index.html')));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    const c = res.clone(); caches.open(CACHE).then((ca) => ca.put(req, c)).catch(() => {}); return res;
  })));
});
