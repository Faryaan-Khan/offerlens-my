/* OfferLens MY service worker: offline support.
 * Pages and data: network first, fall back to cache (so CPI data stays fresh).
 * Hashed build assets and fonts: cache first (they never change once built). */
const VERSION = 'offerlens-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './favicon.svg', './data/market.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

async function networkFirst(req) {
  const cache = await caches.open(VERSION);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return (await cache.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? cache.match('./index.html') : Response.error());
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate' || url.pathname.endsWith('.json') || url.pathname.endsWith('.webmanifest')) {
    e.respondWith(networkFirst(req));
  } else if (url.pathname.includes('/assets/') || /\.(woff2?|png|svg)$/.test(url.pathname)) {
    e.respondWith(cacheFirst(req));
  }
});
