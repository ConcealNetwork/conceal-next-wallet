/**
 * Offline app shell + vendored-asset cache.
 *
 * - On install, precache the app shell from `precache-manifest.json` (generated
 *   at build time from the static export) so the wallet can open offline.
 * - Navigations are NETWORK-FIRST: online users always get the fresh page; the
 *   cached shell is only served when the network is unavailable. This makes a
 *   stale or bad cache unable to break the live site for online users.
 * - Vendored `/lib/*` and `/workers/*` stay cache-first (large, immutable).
 * - Everything resolves by pathname, so it works under any deploy base path.
 */
const CACHE_PREFIX = "conceal-wallet-";
// Replaced at build time with a content hash of the precache list (see
// generate-precache-manifest.mjs). A content change → new SW bytes → the browser
// reinstalls → the shell is re-precached under a new cache name and the stale one
// is pruned on activate. Left as the literal token in dev (no precache there).
const SW_VERSION = "__SW_VERSION__";
const SHELL_CACHE = `${CACHE_PREFIX}shell-${SW_VERSION}`;
// Vendored libs/workers are immutable; keep their cache stable across deploys.
const ASSET_CACHE = `${CACHE_PREFIX}static-v2`;
const KEEP = new Set([SHELL_CACHE, ASSET_CACHE]);

function isRuntimeAsset(url) {
  try {
    const path = new URL(url).pathname;
    return path.includes("/lib/") || path.includes("/workers/");
  } catch {
    return false;
  }
}

// A Turbopack Web Worker bootstrap chunk. Its config rides in the URL HASH
// (`turbopack-worker-<hash>.js#params=…`), which never reaches the SW; serving the
// bare chunk from cache makes the worker's `self.location` lose the params →
// "Missing worker bootstrap config" (deep-sync scan pool, #184). Keep these on the
// network (never cache-first) so the hash survives. Mirrors `isWorkerChunk` in
// lib/pwa/precache.mjs, which also keeps them OUT of the precache manifest.
function isWorkerChunk(pathname) {
  return /\/_next\/static\/chunks\/[^/]*worker[^/]*\.js$/.test(pathname);
}

function isPrecacheAsset(url) {
  try {
    const path = new URL(url).pathname;
    if (isWorkerChunk(path)) return false;
    return path.includes("/_next/static/") || path.endsWith(".webmanifest");
  } catch {
    return false;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      let urls = null;
      try {
        // The manifest sits next to the SW (same scope), so a relative URL
        // resolves correctly under a deploy base path.
        const res = await fetch("precache-manifest.json", { cache: "no-cache" });
        if (res.ok) {
          const manifest = await res.json();
          if (Array.isArray(manifest.urls)) urls = manifest.urls;
        }
      } catch {
        // No manifest (e.g. dev) → skip precache; runtime caching still applies.
      }
      if (urls && urls.length > 0) {
        // Atomic: if any shell asset fails, the install rejects and the previous
        // SW stays active — never activate a half-cached, broken offline shell.
        const cache = await caches.open(SHELL_CACHE);
        await cache.addAll(urls);
      }
      // Do NOT skipWaiting() here: an updated SW must WAIT until the page tells it
      // to activate (via the SKIP_WAITING message below). Activating mid-session
      // with clients.claim() could swap content-hashed chunks under a running tab
      // and break a lazy-loaded old chunk name. The page surfaces an "update
      // available" prompt and only then asks this worker to take over.
    })(),
  );
});

// The page posts {type:"SKIP_WAITING"} (from the "Reload" action of its
// update-available toast) when the user opts in to the new version. Only then
// does the waiting worker activate; the page reloads on the resulting
// `controllerchange`. Anything else is ignored.
self.addEventListener("message", (event) => {
  // Only honour messages from our OWN origin's pages — never a cross-origin sender
  // (defense-in-depth; an in-scope SW shouldn't receive these, but be explicit).
  if (event.origin && event.origin !== self.location.origin) return;
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        // Only our own caches — never delete caches belonging to other apps on
        // the same origin (the GitHub Pages domain hosts other projects).
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && !KEEP.has(key))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  // Navigations: network-first, fall back to the cached shell when offline.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          // Treat a server error (e.g. a GitHub Pages 5xx outage) like being
          // offline so the cached shell is served instead of an error page.
          if (response.status >= 500) throw new Error(`nav ${response.status}`);
          return response;
        } catch {
          const shell = await caches.open(SHELL_CACHE);
          // Normalize to a trailing slash so a non-canonical "/wallet/account"
          // still resolves to the precached "/wallet/account/index.html".
          const slashUrl = request.url.replace(/\/?(\?.*)?$/, "/");
          const cached =
            (await shell.match(request, { ignoreSearch: true })) ||
            (await shell.match(new URL("index.html", slashUrl).href, { ignoreSearch: true })) ||
            (await shell.match("index.html"));
          return (
            cached ||
            new Response("<h1>Offline</h1><p>This page isn't available offline yet.</p>", {
              status: 503,
              headers: { "Content-Type": "text/html; charset=utf-8" },
            })
          );
        }
      })(),
    );
    return;
  }

  // Precached shell assets (Next chunks, manifest): cache-first for speed.
  if (isPrecacheAsset(request.url)) {
    event.respondWith(
      caches.open(SHELL_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) void cache.put(request, response.clone()).catch(() => {});
        return response;
      }),
    );
    return;
  }

  // Vendored libs + sync workers: cache-first runtime cache.
  if (isRuntimeAsset(request.url)) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) void cache.put(request, response.clone()).catch(() => {});
        return response;
      }),
    );
  }
});

// Clicking an OS notification (from reminders / check-ins) focuses an existing
// wallet window if one is open, otherwise opens a new one. Best-effort and
// additive — it never touches the cache logic above. Resolves to the SW scope
// so it works under any deploy base path. If the notification carries a target
// path (`data.url`) it focuses/navigates there; otherwise the app root.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      try {
        const scope = new URL(self.registration.scope);
        // Resolve an optional target path RELATIVE to scope, so it works under
        // any deploy base path. A bad/cross-origin value falls back to scope.
        const raw = event.notification.data?.url;
        let target = scope;
        if (typeof raw === "string" && raw.length > 0) {
          try {
            const resolved = new URL(raw, scope);
            if (resolved.href.startsWith(scope.href)) target = resolved;
          } catch {
            // Unparseable target — fall back to the scope root.
          }
        }
        const clientList = await self.clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        });
        for (const client of clientList) {
          // A window WITHIN OUR SCOPE is already open → focus it (navigating to
          // the target first when one was supplied) rather than spawning one.
          // Scope (not just origin) matters: GitHub Pages hosts many projects on
          // one origin, so an origin-only check could focus a different app.
          try {
            if (new URL(client.url).href.startsWith(scope.href) && "focus" in client) {
              if (target.href !== scope.href && typeof client.navigate === "function") {
                try {
                  const navigated = await client.navigate(target.href);
                  if (navigated && "focus" in navigated) return await navigated.focus();
                } catch {
                  // Navigation can reject (e.g. cross-origin guard) — just focus.
                }
              }
              return await client.focus();
            }
          } catch {
            // Skip clients with unparseable URLs.
          }
        }
        if (self.clients.openWindow) {
          return await self.clients.openWindow(target.href);
        }
      } catch {
        // Best-effort only — never let a focus/open failure surface an error.
      }
    })(),
  );
});
