/* ============================================================
   Fitnessmith Executive Dashboard — Service Worker
   Strategy:
     - App shell (HTML, JS libs): Cache-first, update in background
     - n8n API calls: Network-only (always live data)
   ============================================================ */

const CACHE_NAME = 'fitnessmith-v1';
const SHELL_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=Open+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400;1,600&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
];

// Install: pre-cache app shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(SHELL_URLS).catch(err => {
        console.warn('[SW] Pre-cache partial failure (ok for fonts):', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate: delete old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: network-only for n8n; cache-first for everything else
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // Always network for n8n webhooks
  if (url.includes('n8n.cloud') || url.includes('/webhook/')) {
    return; // let browser handle normally (no cache)
  }

  // Cache-first for app shell assets
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        // Update cache in background
        fetch(event.request).then(resp => {
          if (resp && resp.status === 200 && resp.type !== 'opaque') {
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, resp));
          }
        }).catch(() => {});
        return cached;
      }
      // Not in cache — fetch from network and cache it
      return fetch(event.request).then(resp => {
        if (!resp || resp.status !== 200 || resp.type === 'opaque') return resp;
        const toCache = resp.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, toCache));
        return resp;
      }).catch(() => {
        // Offline and not cached — return the main HTML as fallback
        if (event.request.mode === 'navigate') {
          return caches.match('/') || caches.match('/index.html');
        }
      });
    })
  );
});
