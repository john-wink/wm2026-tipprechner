// Service Worker – Cache-First für statische Assets, Network-Only für API
const VERSION = 'v2026.05.23';
const CACHE = 'wm2026-' + VERSION;

const CORE = [
  '/',
  '/de/', '/en/', '/fr/', '/es/',
  '/assets/app.js',
  '/assets/i18n.js',
  '/assets/styles.css',
  '/assets/tailwind.css',
  '/favicon.svg',
  '/icon-192.svg',
  '/icon-512.svg',
  '/og-image.svg',
  '/manifest.webmanifest'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(CORE).catch(err => {
      // Wenn ein Asset nicht da ist, alle anderen trotzdem cachen
      console.warn('Service Worker partial cache:', err);
      return Promise.all(CORE.map(url => c.add(url).catch(() => {})));
    }))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k.startsWith('wm2026-') && k !== CACHE).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // API-Aufrufe nie cachen – immer frische Quoten
  if (url.host === 'api.the-odds-api.com') return;
  // Externe CDNs nicht via SW behandeln
  if (url.host === 'cdn.tailwindcss.com') return;
  // Nur same-origin abfangen
  if (url.origin !== self.location.origin) return;

  // HTML: Network-first mit Cache-Fallback (damit Updates schnell ankommen)
  if (e.request.mode === 'navigate' || (e.request.headers.get('accept') || '').includes('text/html')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(e.request).then(c => c || caches.match('/de/')))
    );
    return;
  }

  // Assets (JS/CSS/SVG): Stale-while-revalidate
  e.respondWith(
    caches.match(e.request).then(cached => {
      const networkFetch = fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => cached);
      return cached || networkFetch;
    })
  );
});

self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
