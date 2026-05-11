/* مصحف الجماهيرية — Service Worker v3 */
const VER         = 'v3';
const CACHE_SHELL = 'qj-shell-' + VER;
const CACHE_PAGES = 'qj-pages-' + VER;
const CACHE_DATA  = 'qj-data-'  + VER;

// Base path for GitHub Pages (auto-detected)
const BASE = self.location.pathname.replace(/\/sw\.js$/, '') + '/';

const SHELL_URLS = [
  BASE,
  BASE + 'index.html',
  BASE + 'manifest.json',
  BASE + 'database.json',
  BASE + 'font/kfgqpc-uthman-taha-hafs.ttf',   // repo folder is "font"
  BASE + 'fonts/kfgqpc-uthman-taha-hafs.ttf',  // fallback
  BASE + 'images/icon-192.png',
  BASE + 'images/icon-512.png',
];

// ── INSTALL ───────────────────────────────────────────────
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_SHELL).then(cache =>
      Promise.allSettled(
        SHELL_URLS.map(u =>
          cache.add(u).catch(err => console.warn('SW skip:', u.split('/').pop(), err.message))
        )
      )
    )
  );
});

// ── ACTIVATE ──────────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => ![CACHE_SHELL, CACHE_PAGES, CACHE_DATA].includes(k))
            .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── FETCH ─────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Audio (external CDNs) → never intercept
  if (url.hostname.includes('archive.org') ||
      url.hostname.includes('mp3quran.net') ||
      url.hostname.includes('googleapis.com') ||
      url.hostname.includes('gstatic.com')) {
    return;
  }

  const path = url.pathname;

  // ── Page images → Cache First ──
  if (/\/images\/page\d+\.(jpg|png)$/i.test(path)) {
    e.respondWith(
      caches.open(CACHE_PAGES).then(cache =>
        cache.match(e.request).then(hit =>
          hit || fetch(e.request).then(r => {
            if (r.ok) cache.put(e.request, r.clone());
            return r;
          }).catch(() => new Response('', { status: 504 }))
        )
      )
    );
    return;
  }

  // ── database.json → Cache with network update ──
  if (path.endsWith('database.json')) {
    e.respondWith(
      caches.open(CACHE_DATA).then(cache =>
        cache.match(e.request).then(hit => {
          const net = fetch(e.request)
            .then(r => { if (r.ok) cache.put(e.request, r.clone()); return r; })
            .catch(() => null);
          return hit || net;
        })
      )
    );
    return;
  }

  // ── Shell (HTML / manifest / font / icons) → Cache First ──
  if (path.endsWith('.html') || path.endsWith('.json') ||
      path.endsWith('.ttf')  || path.endsWith('.woff2') ||
      path.endsWith('.png')  || path === BASE || path === '/') {
    e.respondWith(
      caches.open(CACHE_SHELL).then(cache =>
        cache.match(e.request).then(hit =>
          hit || fetch(e.request).then(r => {
            if (r.ok) cache.put(e.request, r.clone());
            return r;
          }).catch(() => hit || new Response('Offline', { status: 503 }))
        )
      )
    );
    return;
  }

  // ── Everything else → Network fallback cache ──
  e.respondWith(
    fetch(e.request).catch(() =>
      caches.match(e.request).then(r => r || new Response('', { status: 504 }))
    )
  );
});

// ── MESSAGES ──────────────────────────────────────────────
self._pageCaching = false;

self.addEventListener('message', async e => {
  const { type, data } = e.data || {};

  if (type === 'CACHE_PAGES') {
    self._pageCaching = true;
    const pages = data?.pages || [];
    const cache = await caches.open(CACHE_PAGES);
    let done = 0;
    for (const p of pages) {
      if (!self._pageCaching) break;
      const urls = [
        BASE + `images/page${p}.jpg`,
        BASE + `images/page${p}.png`,
      ];
      for (const url of urls) {
        try {
          if (!(await cache.match(url))) {
            const r = await fetch(url);
            if (r.ok) { await cache.put(url, r); break; }
          } else { break; }
        } catch (_) {}
      }
      done++;
      if (done % 10 === 0 || done === pages.length)
        e.source?.postMessage({ type: 'CACHE_PROGRESS', done, total: pages.length });
    }
    self._pageCaching = false;
    e.source?.postMessage({ type: 'CACHE_DONE', total: pages.length });
  }

  if (type === 'STOP_CACHE')  { self._pageCaching = false; }

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
