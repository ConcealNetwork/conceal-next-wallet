/** @type {import('next').NextConfig} */

// When building for GitHub Pages (set in CI), serve the app under the repo
// subpath and emit a fully static export. Local `next dev`/`next build` leave
// these unset so the app is served from the root as usual.
const basePath = process.env.PAGES_BASE_PATH ?? '';

const nextConfig = {
  output: 'export',
  basePath,
  assetPrefix: basePath || undefined,
  trailingSlash: true,
  images: {
    // next/image optimization needs a server; static export can't provide one.
    unoptimized: true,
  },
  // Exposed to the client so raw asset references (CSS url(), <img src>, the QR
  // image setting) can be prefixed with the same subpath — Next only prefixes
  // next/image, Link and the favicon automatically.
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

export default nextConfig;
