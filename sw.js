// رحلاتك PWA — service worker بسيط للتثبيت على الشاشة الرئيسية
self.addEventListener('install', e=>self.skipWaiting());
self.addEventListener('activate', e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', ()=>{});
