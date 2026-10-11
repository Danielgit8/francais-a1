// Offline: App-Dateien zuerst vom Netz (Fallback Cache), Audios zuerst aus dem Cache.
const V = 'fra1-v1';
const SHELL = ['./', 'index.html', 'app.css', 'supabase.js', 'manifest.webmanifest', 'icon.svg',
  'js/app.js', 'js/store.js', 'js/srs.js', 'js/sync.js', 'js/player.js', 'js/modes.js', 'js/md.js',
  'content/data.json', 'content/grammatik.md'];

self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('fra1-v') && k !== V).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  if (u.pathname.includes('/audio/')) {
    e.respondWith(caches.open('fra1-audio').then(async c => {
      const hit = await c.match(e.request, { ignoreSearch: true });
      if (hit) return hit;
      const r = await fetch(u.href);
      if (r.status === 200) c.put(e.request.url, r.clone());
      return r;
    }));
    return;
  }
  e.respondWith(fetch(e.request).then(r => {
    if (r.status === 200) { const cl = r.clone(); caches.open(V).then(c => c.put(e.request, cl)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});
