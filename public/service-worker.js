// v2 does not register a service worker. This stub lets browsers that still
// poll /service-worker.js (e.g. after v1 on the same origin) stop retrying with 404.
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    self.registration.unregister().catch(() => undefined),
  )
})
