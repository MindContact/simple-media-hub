// Service worker: makes the hub installable and keeps the page and the games working when the
// server is unreachable. Always network first, so a new deploy shows up on the next load;
// the cache is only the fallback. API calls and video streams are never cached.

const CACHE = 'hub-v1';
const SHELL = ['/', '/style.css', '/app.js', '/lib.js', '/theme.js', '/background.js', '/vendor/hls.min.js', '/favicon.svg', '/manifest.webmanifest'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/jf/')) {
    // Only the config is worth keeping: name, theme and games when the server is down.
    if (url.pathname === '/api/config') event.respondWith(networkFirst(event.request));
    return;
  }
  event.respondWith(networkFirst(event.request));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request, { ignoreSearch: request.mode === 'navigate' });
    if (cached) return cached;
    throw err;
  }
}
