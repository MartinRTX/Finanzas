// Guarda la app en el celular para que abra rápido y funcione sin señal.
// Cuando subas una versión nueva de la app, cambia el número de VERSION.
const VERSION = 'fin-v3.0';
const ARCHIVOS = [
  './', './index.html', './app.js', './manifest.webmanifest', './bricolage.woff2',
  './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png', './sc-gasto.png', './sc-pagar.png', './sc-cuadrar.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION)
    .then(c => c.addAll(ARCHIVOS.map(u => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Archivos de la app: responde con lo guardado y actualiza en segundo plano.
// Las llamadas a Google (tus datos) nunca se guardan aquí.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(caches.open(VERSION).then(cache =>
    cache.match(e.request, { ignoreSearch: true }).then(guardado => {
      const red = fetch(e.request).then(resp => {
        if (resp && resp.ok) cache.put(e.request, resp.clone());
        return resp;
      }).catch(() => guardado);
      return guardado || red;
    })));
});
