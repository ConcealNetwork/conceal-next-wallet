import type { MetadataRoute } from "next";

// Required for `output: export` — emit the manifest as a static file.
export const dynamic = "force-static";

// Relative `src`/`start_url` (no leading slash) so the manifest works under any
// deploy base path (e.g. GitHub Pages /conceal-next-wallet) — they resolve
// relative to the manifest URL.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Conceal Wallet",
    short_name: "Conceal",
    description: "Non-custodial, in-browser wallet for Conceal (CCX).",
    start_url: ".",
    scope: ".",
    display: "standalone",
    background_color: "#1a1613",
    theme_color: "#1a1613",
    icons: [
      { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
