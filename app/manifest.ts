import type { MetadataRoute } from "next";

// Required for `output: export` — emit the manifest as a static file.
export const dynamic = "force-static";

// Relative `src`/`start_url` (no leading slash) so the manifest works under any
// deploy base path (e.g. GitHub Pages /conceal-next-wallet) — they resolve
// relative to the manifest URL.
export default function manifest(): MetadataRoute.Manifest {
  return {
    // Stable identity so the installed app is recognized across deploys/base paths.
    id: "conceal-next-wallet",
    name: "Conceal Wallet",
    short_name: "Conceal",
    description: "Non-custodial, in-browser wallet for Conceal (CCX).",
    lang: "en",
    categories: ["finance"],
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
    // App-launcher quick actions. Relative urls (no leading slash) resolve under
    // the deploy base path, matching start_url/scope.
    shortcuts: [
      { name: "Send", url: "./wallet/send" },
      { name: "Receive", url: "./wallet/receive" },
      { name: "Deposits", url: "./wallet/deposits" },
      { name: "Address Book", url: "./wallet/address-book" },
    ],
    // Deep-link Conceal payment URIs (web+conceal:…) into the send flow. PWAs may
    // only register web+-prefixed schemes; the matched URI is substituted for %s
    // and the send page reads the payment fields from the resulting query string.
    protocol_handlers: [{ protocol: "web+conceal", url: "./wallet/send?uri=%s" }],
  };
}
