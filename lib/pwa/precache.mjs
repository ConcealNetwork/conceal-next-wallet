/**
 * Pick the app-shell assets to precache for offline open, from a flat list of
 * paths relative to the static-export root (`out/`). Pure — the build script
 * feeds it the real file list; tests feed it fixtures.
 *
 * Included: route HTML (the navigable shell) + the Next static chunks/CSS/media
 * + the web manifest. Excluded: design-mockup pages under `explorations/`, the
 * vendored crypto libs + sync workers (already runtime-cached, and large),
 * source maps, and build sidecar files.
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
  return false;
}
