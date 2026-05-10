/* ══════════════════════════════════════════════════════════════
   مصحف الجماهيرية — Service Worker
   استراتيجية التخزين المؤقت:
   - Shell (HTML/JS/CSS/Font/Manifest) → Cache First
   - صور الصفحات → Cache First + تنزيل تدريجي
   - الصوت → Network Only (كبير جداً للتخزين)
   ══════════════════════════════════════════════════════════════ */

const VERSION        = 'v1.0.0';
const SHELL_CACHE    = 'quran-jam-shell-' + VERSION;
const PAGES_CACHE    = 'quran-jam-pages-' + VERSION;
const DB_CACHE       = 'quran-jam-data-' + VERSION;

// الملفات الأساسية التي تُخزَّن فوراً عند التثبيت
const SHELL_FILES = [
  './index.html',
  './manifest.json',
  './database.json',
];

const FONT_FILE = './fonts/kfgqpc-uthman-taha-hafs.ttf';

// ── INSTALL ──────────────────────────────────────────────────
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(SHELL_CACHE).then(cache => {
      // Cache shell files; ignore errors for optional files
      return Promise.allSettled(
        SHELL_FILES.map(url =>
          cache.add(url).catch(e => console.warn('SW: skip', url, e.message))
        )
      );
    }).then(() =>
      // Try caching the font too
      caches.open(SHELL_CACHE).then(cache =>
        cache.add(FONT_FILE).catch(() => {})
      )
    )
  );
});

// ── ACTIVATE ─────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== SHELL_CACHE && k !== PAGES_CACHE && k !== DB_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH ────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const path = url.pathname;

  // 1. Audio from archive.org → Network only (too large, user controls download)
  if (url.hostname.includes('archive.org') || url.hostname.includes('mp3quran.net')) {
    return; // let browser handle normally
  }

  // 2. Page images → Cache First (serve instantly if cached, else fetch+cache)
  if (path.match(/\/images\/page\d+\.(jpg|png)$/i)) {
    event.respondWith(
      caches.open(PAGES_CACHE).then(cache =>
        cache.match(event.request).then(cached => {
          if (cached) return cached;
          return fetch(event.request).then(response => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          }).catch(() => new Response('', { status: 504 }));
        })
      )
    );
    return;
  }

  // 3. database.json → Cache First
  if (path.endsWith('database.json')) {
    event.respondWith(
      caches.open(DB_CACHE).then(cache =>
        cache.match(event.request).then(cached => {
          if (cached) return cached;
          return fetch(event.request).then(r => {
            if (r.ok) cache.put(event.request, r.clone());
            return r;
          });
        })
      )
    );
    return;
  }

  // 4. Shell files (HTML, manifest, font) → Cache First
  if (
    path.endsWith('.html') || path.endsWith('.json') ||
    path.endsWith('.ttf')  || path.endsWith('.woff2') ||
    path.endsWith('.woff') || path === '/'
  ) {
    event.respondWith(
      caches.open(SHELL_CACHE).then(cache =>
        cache.match(event.request).then(cached => {
          if (cached) return cached;
          return fetch(event.request).then(r => {
            if (r.ok) cache.put(event.request, r.clone());
            return r;
          }).catch(() => cached || new Response('Offline', { status: 503 }));
        })
      )
    );
    return;
  }

  // 5. Everything else → Network with cache fallback
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// ── MESSAGES from the page ───────────────────────────────────
self.addEventListener('message', async event => {
  const { type, data } = event.data || {};

  // Download a batch of pages for offline use
  if (type === 'CACHE_PAGES') {
    const { pages } = data; // array of page numbers
    const cache = await caches.open(PAGES_CACHE);
    let done = 0;
    for (const p of pages) {
      const url = `./images/page${p}.jpg`;
      try {
        const already = await cache.match(url);
        if (!already) {
          const r = await fetch(url);
          if (r.ok) await cache.put(url, r);
        }
        done++;
        // Report progress every 10 pages
        if (done % 10 === 0 || done === pages.length) {
          event.source.postMessage({ type: 'CACHE_PROGRESS', done, total: pages.length });
        }
      } catch (e) {
        done++;
      }
    }
    event.source.postMessage({ type: 'CACHE_DONE', total: pages.length });
  }

  // Check which pages are already cached
  if (type === 'CHECK_CACHED') {
    const cache = await caches.open(PAGES_CACHE);
    const keys  = await cache.keys();
    const cached = keys.map(k => {
      const m = new URL(k.url).pathname.match(/page(\d+)\./);
      return m ? parseInt(m[1]) : 0;
    }).filter(Boolean);
    event.source.postMessage({ type: 'CACHED_LIST', pages: cached });
  }

  // Clear pages cache
  if (type === 'CLEAR_PAGES') {
    await caches.delete(PAGES_CACHE);
    event.source.postMessage({ type: 'CACHE_CLEARED' });
  }

  // Get cache size info
  if (type === 'CACHE_INFO') {
    const cacheNames = await caches.keys();
    let totalPages = 0;
    for (const name of cacheNames) {
      const c = await caches.open(name);
      const keys = await c.keys();
      if (name.startsWith('quran-jam-pages')) totalPages += keys.length;
    }
    event.source.postMessage({ type: 'CACHE_INFO_RESULT', totalPages, version: VERSION });
  }
});
