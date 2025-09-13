const BUILD_ID = new URL(self.location).searchParams.get('v') || String(Date.now())
const CACHE_NAME = `er-app-${BUILD_ID}`

self.addEventListener('install', (event) => {
  // Don’t pre-cache HTML; Vite assets are already hashed.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter(k => k.startsWith('er-app-') && k !== CACHE_NAME).map(k => caches.delete(k)))
    await self.clients.claim()
  })())
})

// Pass-through fetch (let the network/HTTP headers decide).
self.addEventListener('fetch', () => {})
