// Minimal service worker. Navigations are NETWORK-FIRST (an online client always gets the latest
// app shell -> latest hashed assets; falls back to cache offline). Hashed build assets are
// cache-first (immutable). Gives installability + offline without the stale-build trap.
//
// CACHE version = the update forcing-function. This file is static (not plugin-generated), so the
// browser only re-installs the SW when these BYTES change. BUMP this on any release that must evict
// an already-installed shell from existing clients; activate() then deletes the old cache and
// clients.claim() takes over immediately. (New hashed bundles are picked up automatically via the
// network-first navigation even without a bump — the bump only force-evicts a stuck shell.)
const CACHE = 'shithead-v3';
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
