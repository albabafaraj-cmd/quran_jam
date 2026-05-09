const CACHE_NAME = 'quran-v1';
const ASSETS = [
  'index.html',
  'database.json',
  'manifest.json',
  // أضف هنا أي ملفات CSS أو JS خارجية إذا حملتها محلياً
];

// تثبيت الـ Service Worker وتخزين الملفات الأساسية
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// استراتيجية Cache First: البحث في الكاش أولاً ثم الإنترنت
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((res) => {
      return res || fetch(e.request).then((networkRes) => {
        // إذا كان ملف صوتي أو صورة صفحة، قم بتخزينه تلقائياً للمرة القادمة
        if (e.request.url.includes('.mp3') || e.request.url.includes('.jpg') || e.request.url.includes('.png')) {
          const cacheCopy = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, cacheCopy));
        }
        return networkRes;
      });
    })
  );
});