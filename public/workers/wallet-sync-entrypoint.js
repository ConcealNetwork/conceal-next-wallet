"use strict";
/**
 * Sync worker bootstrap: load legacy globals then wallet-sync.bundle.js.
 * Paths are relative to /workers/ (served from public/workers/).
 */
importScripts(
  "../lib/polyfills/core.min.js",
  "../lib/polyfills/textEncoding/encoding-indexes.js",
  "../lib/polyfills/textEncoding/encoding.js",
  "../lib/polyfills/crypto.js",
  "../lib/biginteger.js",
  "../config.js",
  "../lib/nacl-fast.min.js",
  "../lib/nacl-util.min.js",
  "../lib/concealjs/concealjs.js",
  "./wallet-sync.bundle.js"
);
