// Dev service worker: always fetch JS/CSS fresh from network (bypass HTTP cache)
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
        .then(() => self.clients.claim())
));
self.addEventListener('fetch', e => {
    const url = e.request.url;
    if (url.endsWith('.js') || url.endsWith('.css')) {
        e.respondWith(fetch(e.request, { cache: 'no-store' }));
    }
});
