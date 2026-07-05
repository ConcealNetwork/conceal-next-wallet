#!/usr/bin/env node
/**
 * Cordova static export: real wallet, root paths, donation flags from `.env.local`.
 *
 * Loads `.env.local` / `.env` (same as Next), then applies Cordova overrides.
 * Donation page config is baked in at build time via:
 *   DONATION_SUPPORT_FIAT, DONATION_SUPPORT_METHOD
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const { loadEnvConfig } = nextEnv;
loadEnvConfig(ROOT);

process.env.NEXT_PUBLIC_USE_MOCK = "false";
process.env.NEXT_PUBLIC_CORDOVA = "true";
process.env.DONATION_SUPPORT_FIAT ??= "OFF";
process.env.DONATION_SUPPORT_METHOD ??= "Crypto";

console.log("[cordova:export] NEXT_PUBLIC_USE_MOCK=false");
console.log("[cordova:export] NEXT_PUBLIC_CORDOVA=true");
console.log(`[cordova:export] DONATION_SUPPORT_FIAT=${process.env.DONATION_SUPPORT_FIAT}`);
console.log(`[cordova:export] DONATION_SUPPORT_METHOD=${process.env.DONATION_SUPPORT_METHOD}`);

const result = spawnSync("npx", ["next", "build"], {
  cwd: ROOT,
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_OPTIONS: [process.env.NODE_OPTIONS, "--no-deprecation"].filter(Boolean).join(" "),
  },
});

process.exit(result.status ?? 1);
