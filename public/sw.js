const CACHE_VERSION = 'sd-core-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const IMAGE_CACHE = `${CACHE_VERSION}-images`;
const OFFLINE_URL = '/offline';
const PRECACHE_URLS = ['/', '/offline', '/brand-logo.png', '/product-placeholder.svg', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('sd-core-') && key !== STATIC_CACHE && key !== IMAGE_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') {
    return;
  }
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match(OFFLINE_URL)))
    );
    return;
  }

  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/fonts/') ||
    url.pathname === '/brand-logo.png' ||
    url.pathname === '/product-placeholder.svg'
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
            return response;
          })
      )
    );
    return;
  }

  if (url.pathname.startsWith('/product-images/')) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then((cache) =>
        cache.match(request).then(
          (cached) =>
            cached ||
            fetch(request)
              .then((response) => {
                if (response.ok) {
                  cache.put(request, response.clone());
                }
                return response;
              })
              .catch(() => caches.match('/product-placeholder.svg'))
        )
      )
    );
  }
});
