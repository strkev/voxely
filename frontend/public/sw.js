// Minimal Service Worker to satisfy PWA criteria

self.addEventListener('install', () => {
  console.log('Service Worker: Installed');
  self.skipWaiting();
});

self.addEventListener('activate', () => {
  console.log('Service Worker: Activated');
});

self.addEventListener('fetch', (event) => {
  // Pass through all requests - we just need the SW to exist for PWA recognition
  event.respondWith(fetch(event.request));
});
