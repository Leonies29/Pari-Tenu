// Service worker minimal : rend le site installable comme une app et utilisable hors-ligne.
const CACHE = 'pari-tenu-v17';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'config.js', 'api-supabase.js', 'api-demo.js', 'manifest.json', 'icon.svg', 'icon-192.png', 'icon-512.png', 'icon-180.png',
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

// ----- Notifications reçues même quand l'appli est fermée -----
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : '' }; }
  const travaux = [self.registration.showNotification(d.title || 'Pari tenu', {
    body: d.body || '',
    icon: 'assets/icon-192.png',
    badge: 'assets/icon-192.png',
    data: { url: d.url || '#/' },
    tag: d.tag || undefined,
  })];
  if (self.navigator && self.navigator.setAppBadge && d.badge) travaux.push(self.navigator.setAppBadge(d.badge).catch(() => {}));
  e.waitUntil(Promise.all(travaux));
});

// Appui sur la notification : ouvre l'appli sur la bonne page
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '#/', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((fenetres) => {
    for (const f of fenetres) {
      if ('focus' in f) { if ('navigate' in f) f.navigate(url); return f.focus(); }
    }
    return self.clients.openWindow(url);
  }));
});