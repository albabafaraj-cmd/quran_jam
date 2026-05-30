/* مصحف الجماهيرية — Service Worker */
const CACHE_NAME  = 'quran-jam-v4';
const PAGES_CACHE = 'quran-jam-pages-v4';

// الملفات الأساسية — تُحمَّل فور التثبيت مثل tanzilat
const PRE_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './database.json',
  './font/kfgqpc-uthman-taha-hafs.ttf',
  './images/icon-192.png',
  './images/icon-512.png',
];

// ── INSTALL ──
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled(
        PRE_CACHE.map(url =>
          cache.add(url).catch(e => console.warn('[SW] skip:', url, e.message))
        )
      )
    )
  );
});

// ── ACTIVATE ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== PAGES_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH — نفس منطق tanzilat بس مع إضافة صفحات المصحف ──
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // الصوت الخارجي — لا نتدخل
  if (url.includes('archive.org') || url.includes('mp3quran.net') ||
      url.includes('googleapis.com') || url.includes('gstatic.com')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(response => {
      // موجود في الكاش — اعرضه فوراً
      if (response) return response;

      // غير موجود — اجلبه من الشبكة
      return fetch(event.request).then(fetchResponse => {
        // تخزين: صور المصحف + صور الأيقونات + الملفات الأساسية
        const shouldCache =
          url.includes('images/') ||
          url.includes('font/') ||
          url.includes('fonts/') ||
          url.includes('manifest.json') ||
          url.includes('database.json') ||
          url.endsWith('.html');

        if (shouldCache && fetchResponse.ok) {
          const cacheName = url.includes('images/page') ? PAGES_CACHE : CACHE_NAME;
          caches.open(cacheName).then(cache =>
            cache.put(event.request, fetchResponse.clone())
          );
        }
        return fetchResponse;
      }).catch(() => {
        // أوفلاين — حاول الكاش مرة ثانية
        return caches.match(event.request);
      });
    })
  );
});

// ── MESSAGES — تنزيل الصفحات للاستخدام أوفلاين ──
self._caching = false;

self.addEventListener('message', async event => {
  const { type, data } = event.data || {};

  if (type === 'CACHE_PAGES') {
    self._caching = true;
    const pages = data?.pages || [];
    const cache = await caches.open(PAGES_CACHE);
    let done = 0;
    for (const p of pages) {
      if (!self._caching) break;
      for (const ext of ['jpg', 'png']) {
        const url = `./images/page${p}.${ext}`;
        try {
          if (!await cache.match(url)) {
            const r = await fetch(url);
            if (r.ok) { await cache.put(url, r); break; }
          } else break;
        } catch (_) {}
      }
      done++;
      if (done % 10 === 0 || done === pages.length)
        event.source?.postMessage({ type: 'CACHE_PROGRESS', done, total: pages.length });
    }
    self._caching = false;
    event.source?.postMessage({ type: 'CACHE_DONE', total: pages.length });
  }

  if (type === 'STOP_CACHE')  self._caching = false;

  if (type === 'CLEAR_PAGES') {
    await caches.delete(PAGES_CACHE);
    event.source?.postMessage({ type: 'CACHE_CLEARED' });
  }

  if (type === 'CACHE_INFO') {
    let totalPages = 0;
    try {
      const c = await caches.open(PAGES_CACHE);
      totalPages = (await c.keys()).length;
    } catch (_) {}
    event.source?.postMessage({ type: 'CACHE_INFO', totalPages });
  }
});
