/* مصحف الجماهيرية — Service Worker v4 */
const VER         = 'v4';
const CACHE_SHELL = 'qj-shell-' + VER;
const CACHE_PAGES = 'qj-pages-' + VER;
const CACHE_DATA  = 'qj-data-'  + VER;

// Auto-detect base path (works for root and subdirectory deployments)
const BASE = (() => {
  const p = self.location.pathname;
  return p.substring(0, p.lastIndexOf('/') + 1);
})();

const SHELL_URLS = [
  BASE + 'index.html',
  BASE + 'manifest.json',
  BASE + 'database.json',
  BASE + 'font/kfgqpc-uthman-taha-hafs.ttf',
  BASE + 'fonts/kfgqpc-uthman-taha-hafs.ttf',
  BASE + 'images/icon-192.png',
  BASE + 'images/icon-512.png',
];

self.addEventListener('install', e => {
  console.log('[SW] Installing v4, BASE:', BASE);
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_SHELL).then(cache =>
      Promise.allSettled(
        SHELL_URLS.map(u =>
          cache.add(u).catch(err => console.warn('[SW] skip:', u.split('/').pop(), err.message))
        )
      )
    )
  );
});

self.addEventListener('activate', e => {
  console.log('[SW] Activated v4');
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => ![CACHE_SHELL, CACHE_PAGES, CACHE_DATA].includes(k))
            .map(k => { console.log('[SW] Delete old cache:', k); return caches.delete(k); })
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Never intercept: audio CDNs, Google Fonts
  if (url.hostname.includes('archive.org') ||
      url.hostname.includes('mp3quran.net') ||
      url.hostname.includes('googleapis.com') ||
      url.hostname.includes('gstatic.com')) {
    return;
  }

  const path = url.pathname;

  // Page images → Cache First
  if (/\/images\/page\d+\.(jpg|png)$/i.test(path)) {
    e.respondWith(
      caches.open(CACHE_PAGES).then(c =>
        c.match(e.request).then(hit =>
          hit || fetch(e.request).then(r => { if(r.ok) c.put(e.request, r.clone()); return r; })
                                 .catch(() => new Response('', {status:504}))
        )
      )
    );
    return;
  }

  // database.json → Cache First + background refresh
  if (path.endsWith('database.json')) {
    e.respondWith(
      caches.open(CACHE_DATA).then(c =>
        c.match(e.request).then(hit => {
          const net = fetch(e.request).then(r => { if(r.ok) c.put(e.request, r.clone()); return r; }).catch(()=>null);
          return hit || net;
        })
      )
    );
    return;
  }

  // Shell files → Cache First
  if (path.endsWith('.html') || path.endsWith('.json') ||
      path.endsWith('.ttf')  || path.endsWith('.woff2') ||
      path.endsWith('.png')  || path === BASE || path.endsWith('/')) {
    e.respondWith(
      caches.open(CACHE_SHELL).then(c =>
        c.match(e.request).then(hit =>
          hit || fetch(e.request).then(r => { if(r.ok) c.put(e.request, r.clone()); return r; })
                                 .catch(() => hit || new Response('Offline', {status:503}))
        )
      )
    );
    return;
  }

  // Default
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request).then(r => r || new Response('', {status:504})))
  );
});

// Messages
self._caching = false;
self.addEventListener('message', async e => {
  const { type, data } = e.data || {};

  if (type === 'CACHE_PAGES') {
    self._caching = true;
    const pages = data?.pages || [];
    const cache = await caches.open(CACHE_PAGES);
    let done = 0;
    for (const p of pages) {
      if (!self._caching) break;
      for (const ext of ['jpg','png']) {
        const url = BASE + `images/page${p}.${ext}`;
        try {
          if (!await cache.match(url)) {
            const r = await fetch(url);
            if (r.ok) { await cache.put(url, r); break; }
          } else break;
        } catch(_) {}
      }
      done++;
      if (done % 10 === 0 || done === pages.length)
        e.source?.postMessage({ type:'CACHE_PROGRESS', done, total:pages.length });
    }
    self._caching = false;
    e.source?.postMessage({ type:'CACHE_DONE', total:pages.length });
  }

  if (type === 'STOP_CACHE')  self._caching = false;
  if (type === 'CLEAR_PAGES') { await caches.delete(CACHE_PAGES); e.source?.postMessage({type:'CACHE_CLEARED'}); }
  if (type === 'CACHE_INFO') {
    let n = 0;
    try { const c = await caches.open(CACHE_PAGES); n = (await c.keys()).length; } catch(_){}
    e.source?.postMessage({ type:'CACHE_INFO', totalPages:n, ver:VER });
  }
});
