/* ══════════════════════════════════════════════════════════════
   مصحف الجماهيرية — Service Worker v2
   ── استراتيجية الكاش ──
   • Shell + DB + Font  → Cache First (تُحمَّل فور التثبيت)
   • صور الصفحات        → Cache First + تنزيل تدريجي
   • الصوت من archive   → Network Only (كبير جداً، اختياري)
   ══════════════════════════════════════════════════════════════ */

const VER        = 'v2';
const CACHE_SHELL = 'qj-shell-' + VER;
const CACHE_PAGES = 'qj-pages-' + VER;
const CACHE_DATA  = 'qj-data-'  + VER;

const SHELL_URLS = [
  './',
  './index.html',
  './manifest.json',
  './database.json',
  './fonts/kfgqpc-uthman-taha-hafs.ttf',
  './images/icon-192.png',
  './images/icon-512.png',
];

// ── INSTALL: cache shell immediately ────────────────────────
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_SHELL).then(cache =>
      Promise.allSettled(
        SHELL_URLS.map(u => cache.add(u).catch(err => console.warn('SW skip:', u, err.message)))
      )
    )
  );
});

// ── ACTIVATE: delete old caches ─────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys
        .filter(k => ![CACHE_SHELL, CACHE_PAGES, CACHE_DATA].includes(k))
        .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH ────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const { request } = e;
  const url = new URL(request.url);

  // Audio (archive.org / mp3quran) → pass through, never cache
  if (url.hostname.includes('archive.org') || url.hostname.includes('mp3quran.net')) return;

  // Page images → Cache First
  if (/\/images\/page\d+\.(jpg|png)$/i.test(url.pathname)) {
    e.respondWith(
      caches.open(CACHE_PAGES).then(cache =>
        cache.match(request).then(hit => hit || fetch(request).then(r => {
          if (r.ok) cache.put(request, r.clone());
          return r;
        }).catch(() => new Response('', { status: 504 })))
      )
    );
    return;
  }

  // database.json → Cache First, background refresh
  if (url.pathname.endsWith('database.json')) {
    e.respondWith(
      caches.open(CACHE_DATA).then(cache =>
        cache.match(request).then(hit => {
          const network = fetch(request).then(r => { if (r.ok) cache.put(request, r.clone()); return r; }).catch(() => null);
          return hit || network;
        })
      )
    );
    return;
  }

  // Shell files (HTML / manifest / font / icons)
  if (
    url.pathname.endsWith('.html') || url.pathname.endsWith('.json') ||
    url.pathname.endsWith('.ttf')  || url.pathname.endsWith('.png')  ||
    url.pathname === '/' || url.pathname === ''
  ) {
    e.respondWith(
      caches.open(CACHE_SHELL).then(cache =>
        cache.match(request).then(hit =>
          hit || fetch(request).then(r => { if (r.ok) cache.put(request, r.clone()); return r; })
                               .catch(() => hit || new Response('Offline', { status: 503 }))
        )
      )
    );
    return;
  }

  // Google Fonts & everything else → network with shell fallback
  e.respondWith(
    fetch(request).catch(() => caches.match(request).then(r => r || new Response('', { status: 504 })))
  );
});

// ── MESSAGES ─────────────────────────────────────────────────
self.addEventListener('message', async e => {
  const { type, data } = e.data || {};

  if (type === 'CACHE_PAGES') {
    const pages = data?.pages || [];
    const cache = await caches.open(CACHE_PAGES);
    let done = 0;
    for (const p of pages) {
      if (!self._cachingActive) break; // allow cancel
      const url = `./images/page${p}.jpg`;
      try {
        if (!(await cache.match(url))) {
          const r = await fetch(url);
          if (r.ok) await cache.put(url, r);
        }
      } catch (_) {}
      done++;
      if (done % 10 === 0 || done === pages.length)
        e.source?.postMessage({ type: 'CACHE_PROGRESS', done, total: pages.length });
    }
    e.source?.postMessage({ type: 'CACHE_DONE', total: pages.length });
    self._cachingActive = false;
  }

  if (type === 'CACHE_PAGES') self._cachingActive = true;

  if (type === 'CLEAR_PAGES') {
    await caches.delete(CACHE_PAGES);
    e.source?.postMessage({ type: 'CACHE_CLEARED' });
  }

  if (type === 'CACHE_INFO') {
    let totalPages = 0;
    try {
      const c = await caches.open(CACHE_PAGES);
      totalPages = (await c.keys()).length;
    } catch (_) {}
    e.source?.postMessage({ type: 'CACHE_INFO', totalPages, ver: VER });
  }
});
