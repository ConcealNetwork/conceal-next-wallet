/**
 * IndexedDB/localStorage wallet presence check without loading wallet-core crypto (Cn/JSBigInt).
 * Safe to call from UI before ensureWalletRuntimeLibs().
 */
import { Storage } from "./Storage"
import { StorageOld } from "./StorageOld"

export async function hasStoredWalletOnDevice(): Promise<boolean> {
  if (typeof window === "undefined") {
    return false
  }

  try {
    const legacy = await StorageOld.getItem("wallet", null)
    if (legacy !== null) {
      await Storage.setItem("wallet", legacy)
      await StorageOld.remove("wallet")
    }
  } catch {
    // migration best-effort
  }

  try {
    const wallet = await Storage.getItem("wallet", null)
    return wallet !== null
  } catch {
    return false
  }
}
