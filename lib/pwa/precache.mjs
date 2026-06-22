/**
 * Pick the app-shell assets to precache for offline open, from a flat list of
 * paths relative to the static-export root (`out/`). Pure — the build script
 * feeds it the real file list; tests feed it fixtures.
 *
 * Included: route HTML (the navigable shell) + the Next static chunks/CSS/media
 * + the web manifest. Excluded: design-mockup pages under `explorations/`, the
 * vendored crypto libs + sync workers (already runtime-cached, and large),
 * Turbopack WORKER bootstrap chunks (see below), source maps, and build sidecars.
 *
 * Turbopack instantiates a Web Worker with its bootstrap config encoded in the
 * URL **hash** (`turbopack-worker-<hash>.js#params=…`). The hash never reaches the
 * network, so a cache-first SW would serve the bare, hashless chunk from cache and
 * the worker's `self.location` loses the params → "Missing worker bootstrap config"
 * (the deep-sync scan pool, #184). Excluding these chunks here (and from the SW's
 * cache-first path) keeps them on the network so the hash survives. They're tiny
 * and only needed online (the worker scan only runs during a live sync).
 *
 * Returns root-relative URLs WITHOUT a leading slash so the service worker
 * resolves them against its own scope — automatically correct under a deploy
 * base path (e.g. `/conceal-next-wallet/`).
 */
export function buildPrecacheList(relPaths) {
  const seen = new Set();
  for (const raw of relPaths) {
    const path = raw.replace(/^\.?\/+/, "").replace(/\\/g, "/");
    if (!path || !shouldPrecache(path)) continue;
    seen.add(path);
  }
  return [...seen].sort();
}

function shouldPrecache(path) {
  // Never precache these — runtime-cached, huge, error pages served via the
  // offline fallback, or not part of the app shell.
  if (
    path.startsWith("explorations/") ||
    path.startsWith("lib/") ||
    path.startsWith("workers/") ||
    isWorkerChunk(path) ||
    path === "404.html" ||
    path.startsWith("404/") ||
    path.startsWith("_not-found/") ||
    path.endsWith(".map") ||
    path.endsWith(".txt")
  ) {
    return false;
  }
  if (path.endsWith(".html")) return true;
  if (path.startsWith("_next/static/")) return true;
  if (path === "manifest.webmanifest") return true;
  // The manifest's own install/splash icons + social card — small, top-level
  // PNGs the install prompt needs offline. (Other PNGs aren't matched.)
  if (MANIFEST_IMAGES.has(path)) return true;
  return false;
}

/**
 * A Turbopack Web Worker bootstrap chunk (`_next/static/chunks/…worker….js`).
 * These must NOT be SW-cached — their config rides in the URL hash, which a cached
 * response drops (see the module header). Exported so the SW and tests share one rule.
 */
export function isWorkerChunk(path) {
  return /^_next\/static\/chunks\/[^/]*worker[^/]*\.js$/.test(path);
}

// Top-level images referenced by the manifest (icons) + metadata (og.png).
// Kept as a fixed allowlist so unrelated PNGs aren't pulled into the shell.
const MANIFEST_IMAGES = new Set([
  "icon-192.png",
  "icon-512.png",
  "icon-maskable-512.png",
  "og.png",
]);
