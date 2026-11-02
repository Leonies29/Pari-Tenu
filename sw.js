// Service worker minimal : rend le site installable comme une app et utilisable hors-ligne.
const CACHE = 'pari-tenu-v15';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'config.js', 'api-supabase.js', 'api-demo.js', 'manifest.json', 'icon.svg',
  'fonts/lilita-one-latin-400-normal.woff2', 'fonts/jost-latin-300-normal.woff2', 'fonts/jost-latin-400-normal.woff2',
  'fonts/jost-latin-500-normal.woff2', 'fonts/jost-latin-600-normal.woff2'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
});

// Réseau d'abord, cache en secours (fichiers du site uniquement)
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return; // jamais les appels Supabase
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});