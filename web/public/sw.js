// Phase 6.1 PWA service worker — minimal offline shell.
// No Workbox dep: cache-first for /icons + /offline.html, network-first for
// navigations with offline fallback. Bumped CACHE on every meaningful change.

const CACHE = "opsflow-v1";
const PRECACHE = ["/offline.html", "/icons/icon-192.png", "/icons/icon-512.png", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Never intercept API calls — they need fresh, authenticated responses.
  if (url.pathname.startsWith("/api") || url.pathname.startsWith("/agent") ||
      url.pathname.startsWith("/auth") || url.pathname.startsWith("/admin/") ||
      url.pathname.startsWith("/expenses") || url.pathname.startsWith("/_next/data")) {
    return;
  }

  // Navigations: network-first, fall back to offline.html on failure.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match("/offline.html"))
    );
    return;
  }

  // Static assets in our PRECACHE: cache-first.
  if (PRECACHE.includes(url.pathname)) {
    event.respondWith(caches.match(req).then((r) => r || fetch(req)));
    return;
  }
});
