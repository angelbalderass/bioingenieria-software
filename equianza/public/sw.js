// Service worker mínimo: guarda la "cáscara" de la app para abrirla más rápido y mostrar algo sin red.
// Siempre intenta primero la red (así las actualizaciones llegan de inmediato).
const CACHE = 'equianza-v3';
const ARCHIVOS = ['./', 'index.html', 'app.css', 'app.js', 'core.js', 'util.js', 'agenda.js', 'consultorios.js', 'dentistas.js', 'pacientes.js', 'reportes.js', 'cuenta.js', 'firebase-config.js', 'logo.png', 'logo-192.png', 'logo-maskable-512.png', 'favicon.png', 'manifest.webmanifest'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;   // Firebase y fuentes van directo a internet
  e.respondWith(fetch(e.request).then(r => { const copia = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copia)); return r; }).catch(() => caches.match(e.request)));
});
