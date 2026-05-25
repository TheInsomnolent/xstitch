// Cozy Cross Stitch service worker — app-shell cache with network-first navigation.
const VERSION = 'ccs-v1';
const ASSET_CACHE = `${VERSION}-assets`;
const APP_SHELL = [
  '/CosyCrossStitch/',
  '/CosyCrossStitch/index.html',
  '/CosyCrossStitch/manifest.webmanifest',
  '/CosyCrossStitch/favicon.svg',
  '/CosyCrossStitch/icon.svg',
  '/CosyCrossStitch/icon-maskable.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(ASSET_CACHE).then((c) => c.addAll(APP_SHELL).catch(() => undefined)),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigation requests: network first, fall back to cached shell (offline).
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(ASSET_CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(req);
          if (cached) return cached;
          const shell = await caches.match('/CosyCrossStitch/index.html');
          return shell || Response.error();
        }),
    );
    return;
  }

  // Other GETs: stale-while-revalidate.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(ASSET_CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
