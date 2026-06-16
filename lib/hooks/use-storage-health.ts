"use client";

import { queryKeys } from "@/lib/hooks/query-keys";
import { useQuery } from "@/lib/hooks/query-provider";
import { evaluateStorageHealth, type StorageWarning } from "@/lib/ui/storage-health";

/**
 * Best-effort request for durable storage. Call from a user gesture (wallet
 * unlock) — `persist()` may prompt (Firefox) or auto-deny without a gesture, so
 * it must NOT run in a background query. Idempotent: once granted/denied the
 * browser remembers the decision.
 */
export async function requestPersistentStorage(): Promise<void> {
  const storage = typeof navigator !== "undefined" ? navigator.storage : undefined;
  if (!storage || typeof storage.persist !== "function") return;
  try {
    await storage.persist();
  } catch {
    // best-effort — the watchdog banner reflects the resulting state
  }
}

/**
 * Probe the Storage API (read-only) and reduce it to a single warning verdict.
 * Reads `persisted()` and the usage/quota `estimate()` — it does NOT call
 * `persist()` (see {@link requestPersistentStorage}). Best-effort: any failure or
 * missing API resolves to `"none"` so we never nag on incomplete information.
 */
async function probeStorageHealth(): Promise<StorageWarning> {
  const storage = typeof navigator !== "undefined" ? navigator.storage : undefined;
  if (!storage) return "none";

  let persisted = true;
  try {
    if (typeof storage.persisted === "function") {
      persisted = await storage.persisted();
    }
  } catch {
    persisted = true;
  }

  let usage = 0;
  let quota = 0;
  try {
    if (typeof storage.estimate === "function") {
      const estimate = await storage.estimate();
      usage = estimate.usage ?? 0;
      quota = estimate.quota ?? 0;
    }
  } catch {
    // ignore — leave usage/quota at 0 (treated as "unknown", no low-space warning)
  }

  return evaluateStorageHealth({ persisted, usage, quota });
}

/** Wallet storage durability/quota verdict (`"none"` until known). */
export function useStorageHealth() {
  return useQuery({
    queryKey: queryKeys.storageHealth,
    queryFn: probeStorageHealth,
    staleTime: 5 * 60_000,
    // Cheap read-only probe (no persist() prompt), so let it re-run on focus to
    // catch the quota filling up during a long session as IndexedDB grows.
    refetchOnWindowFocus: true,
  });
}
