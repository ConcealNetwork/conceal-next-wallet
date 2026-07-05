/** @type {import('next').NextConfig} */

// When building for GitHub Pages (set in CI), serve the app under the repo
// subpath and emit a fully static export. Local `next dev`/`next build` leave
// these unset so the app is served from the root as usual.
const basePath = process.env.PAGES_BASE_PATH ?? "";
const isCordova = process.env.NEXT_PUBLIC_CORDOVA === "true";

const nextConfig = {
  output: "export",
  basePath: isCordova ? "" : basePath,
  // Cordova Android serves www/ at https://localhost/ — origin-absolute `/_next/…`
  // works from every nested route; `./_next` breaks under e.g. /wallet/account/.
  assetPrefix: isCordova ? undefined : basePath || undefined,
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
    NEXT_PUBLIC_BASE_PATH: isCordova ? "" : basePath,
    NEXT_PUBLIC_PAGES_BASE_PATH: isCordova ? "" : basePath,
  },
  // Only consulted when running the webpack bundler (`next dev --webpack`) — used
  // locally to dodge a Turbopack 16.2.9 idle-CPU spin. The Conceal crypto ships as
  // a `.wasm` module, which webpack 5 leaves disabled by default. Turbopack (the
  // default for `next dev`/`next build`) handles WASM natively and ignores this hook.
  webpack: (config) => {
    config.experiments = { ...config.experiments, asyncWebAssembly: true };
    return config;
  },
  // Next 16 errors out of Turbopack (`next dev`/`next build`, the defaults) when a
  // `webpack` config is present and no `turbopack` config is — it assumes an
  // unmigrated webpack setup. The empty object opts into Turbopack's defaults and
  // silences that error, so Turbopack keeps working alongside the opt-in
  // `--webpack` hook above. Turbopack handles the `.wasm` crypto natively.
  turbopack: {},
};

export default nextConfig;
