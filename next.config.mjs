/** @type {import('next').NextConfig} */

// When building for GitHub Pages (set in CI), serve the app under the repo
// subpath and emit a fully static export. Local `next dev`/`next build` leave
// these unset so the app is served from the root as usual.
const basePath = process.env.PAGES_BASE_PATH ?? "";

const nextConfig = {
  output: "export",
  basePath,
  assetPrefix: basePath || undefined,
  trailingSlash: true,
  images: {
    // next/image optimization needs a server; static export can't provide one.
    unoptimized: true,
  },
  // Dev-only: allow clients that reach the dev server via 127.0.0.1 (Playwright
  // e2e) to load /_next/* resources — Next blocks cross-origin dev requests by
  // default, which otherwise stops the app hydrating under test.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // Exposed to the client so raw asset references (CSS url(), <img src>, script tags)
  // can be prefixed with the deploy subpath — Next only prefixes Link/favicon automatically.
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
    NEXT_PUBLIC_PAGES_BASE_PATH: basePath,
  },
};

export default nextConfig;
