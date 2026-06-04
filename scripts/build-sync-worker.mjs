#!/usr/bin/env node
/**
 * Bundle wallet sync worker (screen + parse) for public/workers/.
 * Globals (config, concealjs, JSBigInt, …) are loaded by wallet-sync-entrypoint.js first.
 */
import * as esbuild from "esbuild";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const GLOBAL_BANNER = `
var config = self.config;
var concealjs = self.concealjs;
var JSBigInt = self.JSBigInt;
var logDebugMsg = self.logDebugMsg || function () {};
var reportError = self.reportError || function (e) { console.error(e); };
`.trim();

await esbuild.build({
  entryPoints: [join(root, "lib/wallet-core/workers/sync-worker-entry.ts")],
  bundle: true,
  outfile: join(root, "public/workers/wallet-sync.bundle.js"),
  format: "iife",
  platform: "browser",
  target: ["es2020"],
  logLevel: "info",
  banner: { js: GLOBAL_BANNER },
  // wallet-core uses free globals; banner hoists them into the IIFE scope.
  legalComments: "none",
});

console.log("Built public/workers/wallet-sync.bundle.js");
