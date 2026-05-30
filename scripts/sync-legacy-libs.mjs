#!/usr/bin/env node
/**
 * Copy browser globals from conceal-web-wallet into conceal-next-wallet.
 *
 * Run after updating the legacy wallet repo:
 *   npm run sync:legacy-libs
 */
import { copyFileSync, cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, "..")
const legacyRoot = join(root, "..", "conceal-web-wallet", "src")
const legacyLib = join(legacyRoot, "lib")
const publicLib = join(root, "public", "lib")
const publicWorkers = join(root, "public", "workers")

/** Loaded by ensureWalletRuntimeLibs() — required for wallet-core crypto + storage. */
const CORE_FILES = ["biginteger.js", "nacl-fast.min.js", "nacl-util.min.js"]

/** Loaded on demand via ensureWalletExtendedLibs() when export/QR/workers run. */
const EXTENDED_FILES = [
  "base58.js",
  "cn_utils_native.js",
  "FileSaver.min.js",
  "kjua-0.1.1.min.js",
  "decoder.min.js",
]

/** Required by wallet-sync-entrypoint.js importScripts (v1 worker parity). */
const WORKER_LIB_FILES = ["require.js", "crypto.js", "sha3.js", "nacl-fast.js"]

/** Legacy polyfills — optional; modern browsers usually skip these. */
const OPTIONAL_DIRS = ["polyfills"]

/** Synced for reference / future PDF export; not loaded by default. */
const OPTIONAL_FILES = ["jspdf.min.js"]

/** Vue/jQuery/RequireJS stack — replaced by Next/React; listed only for parity. */
const SKIPPED_UI_LEGACY = [
  "vue.min.js",
  "vue-i18n.js",
  "jquery-3.7.1.min.js",
  "sweetalert2.js",
  "require.js",
  "mnemonic.js",
  "crypto.js",
  "cn_utils.js",
  "nacl-fast.js",
]

const WORKER_FILES = [
  "ParseTransactionsEntrypoint.js",
  "ParseTransactions.js",
  "TransferProcessingEntrypoint.js",
  "TransferProcessing.js",
]

function copyFile(name, destDir = publicLib) {
  const src = join(legacyLib, name)
  if (!existsSync(src)) {
    console.error(`Missing legacy file: ${src}`)
    process.exit(1)
  }
  copyFileSync(src, join(destDir, name))
  console.log(`Copied ${name}`)
}

mkdirSync(publicLib, { recursive: true })
mkdirSync(publicWorkers, { recursive: true })

for (const file of CORE_FILES) copyFile(file)
for (const file of EXTENDED_FILES) copyFile(file)
for (const file of WORKER_LIB_FILES) {
  const src = join(legacyLib, file)
  if (existsSync(src)) copyFile(file)
  else console.warn(`Worker lib not found, skipped: ${file}`)
}
for (const file of OPTIONAL_FILES) {
  const src = join(legacyLib, file)
  if (existsSync(src)) copyFile(file)
  else console.warn(`Optional file not found, skipped: ${file}`)
}

for (const dir of OPTIONAL_DIRS) {
  const src = join(legacyLib, dir)
  if (existsSync(src)) {
    cpSync(src, join(publicLib, dir), { recursive: true })
    console.log(`Copied ${dir}/`)
  }
}

const legacyConcealjs = join(legacyLib, "concealjs")
if (existsSync(legacyConcealjs)) {
  cpSync(legacyConcealjs, join(publicLib, "concealjs"), { recursive: true })
  console.log("Copied concealjs/")
}

for (const file of WORKER_FILES) {
  const src = join(legacyRoot, "workers", file)
  if (!existsSync(src)) {
    console.warn(`Worker file not found, skipped: ${file}`)
    continue
  }
  copyFileSync(src, join(publicWorkers, file))
  console.log(`Copied workers/${file}`)
}

const manifest = {
  syncedAt: new Date().toISOString(),
  source: "../conceal-web-wallet/src/lib",
  core: CORE_FILES.map((f) => `/lib/${f}`),
  coreConcealjs: "/lib/concealjs/concealjs.js",
  extended: EXTENDED_FILES.map((f) => `/lib/${f}`),
  optional: OPTIONAL_FILES.map((f) => `/lib/${f}`),
  polyfills: OPTIONAL_DIRS.map((d) => `/lib/${d}/`),
  workers: ["/workers/wallet-sync-entrypoint.js", "/workers/wallet-sync.bundle.js"],
  legacyWorkers: WORKER_FILES.map((f) => `/workers/${f}`),
  skippedUiLegacy: SKIPPED_UI_LEGACY,
  notes: {
    core: "ensureWalletRuntimeLibs() in lib/conceal/init.ts",
    extended: "ensureWalletExtendedLibs() — export download, kjua QR, QR import scanner, sync workers",
    workers: "WalletWatchdog loads /workers/wallet-sync-entrypoint.js (esbuild bundle + importScripts globals)",
    skipped: "Replaced by Next.js, React, sonner, qrcode.react, etc.",
  },
}

writeFileSync(join(publicLib, "legacy-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`)
console.log("Wrote public/lib/legacy-manifest.json")
console.log("Legacy libs synced to public/lib/ and public/workers/")
