// Service Worker – Cache-First für Navigation & Assets, Network-Only für API.
// Robuster gegen einzelne Cache-Failures und URL-Varianten.
// VERSION und CORE werden von scripts/bump.py synchron mit den HTMLs aktualisiert.
const VERSION = 'v2026.06.28.0940';
const CACHE = 'wm2026-' + VERSION;

const CORE = [
  '/',
  '/de/', '/en/', '/fr/', '/es/',
  '/assets/app.min.js?v=v2026.06.28.0940',
  '/assets/i18n.min.js?v=v2026.06.28.0940',
  '/assets/styles.css?v=v2026.06.28.0940',
  '/assets/tailwind.css?v=v2026.06.28.0940',
  '/favicon.svg',
  '/icon-192.svg',
  '/icon-512.svg',
  '/og-image.svg',
  '/manifest.webmanifest'
];

// INSTALL: einzelne Adds mit try/catch – partielle Failures killen nicht den ganzen Install
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(CORE.map(async url => {
      try {
        // 'no-cache' damit wir nicht die HTTP-Cache-Version sondern frische Antwort kriegen
        const res = await fetch(url, { cache: 'no-cache', credentials: 'same-origin' });
        if (res && res.ok) {
          await cache.put(url, res);
        } else if (res && res.status === 0) {
          // Opaque response (cross-origin) – trotzdem speichern
          await cache.put(url, res);
        }
      } catch (e) {
        // Stillen Fehler ok – andere Assets trotzdem cachen
      }
    }));
    self.skipWaiting();
  })());
});

// ACTIVATE: alte Cache-Versionen löschen, Clients sofort übernehmen
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(k => k.startsWith('wm2026-') && k !== CACHE).map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

// FETCH: Cache-First mit Background-Refresh, robust gegen URL-Varianten
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // API: nie cachen, nie abfangen – immer frische Quoten
  if (url.host === 'api.the-odds-api.com') return;

  // Nur same-origin abfangen (CDN/external assets nicht stören)
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);

    // 1) Cache-First – probiere exakte URL, dann ignoreSearch
    // ignoreSearch wichtig: damit /assets/app.js (ohne ?v=) auch trifft falls /assets/app.js?v=X gecacht ist
    let cached = await cache.match(event.request);
    if (!cached && (url.pathname.startsWith('/assets/') || url.pathname === '/')) {
      cached = await cache.match(event.request, { ignoreSearch: true });
    } else if (!cached) {
      cached = await cache.match(event.request, { ignoreSearch: true });
    }

    if (cached) {
      // Im Hintergrund frische Version holen (ohne darauf zu warten)
      fetch(event.request).then(res => {
        if (res && res.ok) cache.put(event.request, res.clone()).catch(() => {});
      }).catch(() => {});
      return cached;
    }

    // 2) Kein Cache-Hit – probiere Network
    try {
      const res = await fetch(event.request);
      if (res && res.ok) {
        // Im Hintergrund cachen, nicht awaiten
        cache.put(event.request, res.clone()).catch(() => {});
      }
      return res;
    } catch (err) {
      // 3) Network ist offline und kein Cache – sinnvollen Fallback bei Navigation
      if (event.request.mode === 'navigate' || (event.request.headers.get('accept') || '').includes('text/html')) {
        // Sprach-Variante aus URL ermitteln
        const langMatch = url.pathname.match(/^\/(de|en|fr|es)\//);
        const fallbackUrl = langMatch ? `/${langMatch[1]}/` : '/de/';
        const fb = await cache.match(fallbackUrl)
          || await cache.match('/de/')
          || await cache.match('/en/')
          || await cache.match('/');
        if (fb) return fb;
      }
      // Sonst: fehlschlagen lassen
      throw err;
    }
  })());
});

// Aktiv steuern vom Hauptthread (Update-Trigger)
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
