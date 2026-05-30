"use client"

/**
 * Load legacy wallet globals (v1 script order from conceal-web-wallet index.html):
 * biginteger → nacl-fast → nacl-util → concealjs, then window.config.
 *
 * Sources vendored under public/lib/ (copied from conceal-web-wallet/src/lib/).
 */

import { applyWalletNetworkConfig } from "@/lib/config/config"
import { publicAssetPath } from "@/lib/conceal/asset-path"

const CORE_SCRIPT_ORDER = [
  "/lib/biginteger.js",
  "/lib/nacl-fast.min.js",
  "/lib/nacl-util.min.js",
  "/lib/concealjs/concealjs.js",
] as const

/** Export, QR codes, sync workers — see public/lib/legacy-manifest.json */
const EXTENDED_SCRIPT_ORDER = [
  "/lib/base58.js",
  "/lib/kjua-0.1.1.min.js",
  "/lib/FileSaver.min.js",
  "/lib/decoder.min.js",
  "/lib/cn_utils_native.js",
] as const

let loadPromise: Promise<void> | null = null
let extendedLoadPromise: Promise<void> | null = null

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-wallet-lib="${src}"]`)
    if (existing) {
      resolve()
      return
    }

    const resolved = publicAssetPath(src)
    const script = document.createElement("script")
    script.src = resolved
    script.async = false
    script.dataset.walletLib = src
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`Failed to load wallet script: ${resolved}`))
    document.head.appendChild(script)
  })
}

function assertGlobals(): void {
  if (typeof JSBigInt === "undefined") {
    throw new Error("JSBigInt not available after loading biginteger.js")
  }
  if (typeof nacl === "undefined" || !nacl.util?.encodeBase64) {
    throw new Error("nacl not available after loading nacl-fast.min.js and nacl-util.min.js")
  }
  if (typeof concealjs === "undefined") {
    throw new Error("concealjs not available after loading concealjs.js")
  }
}

/**
 * Idempotent loader for all browser globals required by lib/wallet-core.
 * Call before any WalletRepository / Cn / TransactionsExplorer usage.
 */
export function ensureWalletRuntimeLibs(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("ensureWalletRuntimeLibs() must run in the browser"))
  }

  if (loadPromise) {
    return loadPromise
  }

  loadPromise = (async () => {
    for (const src of CORE_SCRIPT_ORDER) {
      await loadScript(src)
    }
    assertGlobals()
    applyWalletNetworkConfig()
  })()

  return loadPromise
}

/**
 * Extra v1 globals: base58, kjua (QR), FileSaver (export .wallet), decoder (QR scan),
 * cn_utils_native (sync workers). Run after ensureWalletRuntimeLibs().
 */
export function ensureWalletExtendedLibs(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("ensureWalletExtendedLibs() must run in the browser"))
  }

  if (extendedLoadPromise) {
    return extendedLoadPromise
  }

  extendedLoadPromise = (async () => {
    await ensureWalletRuntimeLibs()
    for (const src of EXTENDED_SCRIPT_ORDER) {
      await loadScript(src)
    }
  })()

  return extendedLoadPromise
}

/** Load core + extended legacy scripts (use before WalletWatchdog or export/QR flows). */
export function ensureAllWalletLegacyLibs(): Promise<void> {
  return ensureWalletExtendedLibs()
}

/** @deprecated Use ensureWalletRuntimeLibs */
export const ensureConcealJs = ensureWalletRuntimeLibs

export function isWalletRuntimeReady(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof JSBigInt !== "undefined" &&
    typeof nacl !== "undefined" &&
    typeof concealjs !== "undefined" &&
    !!window.config
  )
}
