const CACHE = 'puzoto-static-v5';
const LEGACY_CACHE_PREFIXES = ['puzoto-shell-', 'puzoto-static-'];
const STABLE_ASSETS = [
  '/offline.html',
  '/offline.css',
  '/manifest.webmanifest',
  '/images/PuzotoLifeBlue.png',
  '/images/puzoto-180.png',
  '/images/puzoto-192.png',
  '/images/puzoto-transparent-192.png',
  '/images/puzoto-transparent-512.png',
];
const STABLE_PATHS = new Set(STABLE_ASSETS);

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(STABLE_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key !== CACHE && LEGACY_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix)))
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  // HTML and hashed JavaScript/CSS must always come from the active deployment.
  // Falling back to cached HTML can reference bundles that no longer exist.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request, { cache: 'no-store' }).catch(() => caches.match('/offline.html')));
    return;
  }

  if (!STABLE_PATHS.has(url.pathname)) return;
  event.respondWith(fetch(request).then((response) => {
    if (response.ok) caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
    return response;
  }).catch(() => caches.match(request)));
});
