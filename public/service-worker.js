/**
 * Cache vendored wallet scripts (/lib/*, /workers/*) for faster repeat loads.
 * Works with any deploy base path — matches on pathname, not origin root.
 */
const CACHE_NAME = "conceal-wallet-static-v1";

function isCachedAssetUrl(url) {
  try {
    const path = new URL(url).pathname;
    return path.includes("/lib/") || path.includes("/workers/");
  } catch {
    return false;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  if (!isCachedAssetUrl(event.request.url)) {
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);
      if (cached) {
        return cached;
      }

      const response = await fetch(event.request);
      if (response.ok) {
        void cache.put(event.request, response.clone());
      }
      return response;
    }),
  );
});
