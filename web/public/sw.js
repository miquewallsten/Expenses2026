// Financial Ops Service Worker — PWA offline support
// Bumped cache version to force all clients to update their cached chunks.
const CACHE_NAME = 'finops-v2';
const PRECACHE_URLS = [
  '/',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Aggressively clear ALL old caches on activation so stale chunks
  // (like the Buffer polyfill bundle) are never served.
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // Skip non-GET, API calls, and Next.js static chunks (they are content-hashed and immutable)
  if (request.method !== 'GET' || request.url.includes('/api/') || request.url.includes('/_next/static/')) return;

  // For HTML navigations, always go network-first to avoid stale chunks
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
    return;
  }

  // For other assets, stale-while-revalidate
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      }).catch(() => cached);

      return cached || fetchPromise;
    })
  );
});
