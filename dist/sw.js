const CACHE_VERSION = 'piano-cosmico-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const APP_SHELL_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon.svg',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(APP_SHELL_URLS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !key.startsWith(CACHE_VERSION))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Cache-first for Google Fonts and static assets to minimize data usage
  if (
    url.origin === 'https://fonts.googleapis.com' ||
    url.origin === 'https://fonts.gstatic.com' ||
    /\.(js|css|woff2?|png|svg|webp|webmanifest)$/i.test(url.pathname)
  ) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (response && (response.status === 200 || response.type === 'opaque')) {
            cache.put(request, response.clone());
          }
          return response;
        } catch {
          const fallback = await caches.match(request);
          return fallback || new Response('', { status: 503, statusText: 'Offline' });
        }
      }),
    );
    return;
  }

  // Network-first with persistent offline fallback for navigation requests
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put('/index.html', copy));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match('/index.html');
          return cached || new Response('Modo sin conexión activo', { status: 200 });
        }),
    );
  }
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'PRECACHE_SHELL') {
    event.waitUntil(
      caches.open(STATIC_CACHE).then((cache) => cache.addAll(APP_SHELL_URLS)),
    );
  }
  if (event.data && event.data.type === 'CLEAR_SW_CACHE') {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))),
    );
  }
});
