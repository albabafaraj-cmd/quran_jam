const CACHE_NAME = 'quran-v1';
const ASSETS = [
  'index.html',
  'database.json',
  'manifest.json',
  'icon-192.png',
  'icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((res) => {
      return res || fetch(e.request).then((networkRes) => {
        // تخزين صفحات المصحف والصوتيات تلقائياً عند تصفحها لأول مرة
        if (e.request.url.includes('.mp3') || e.request.url.includes('.jpg') || e.request.url.includes('.png')) {
          const cacheCopy = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, cacheCopy));
        }
        return networkRes;
      });
    })
  );
});