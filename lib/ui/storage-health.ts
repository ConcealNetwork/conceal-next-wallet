/**
 * Browsers can silently evict IndexedDB (where the encrypted wallet lives) under
 * storage pressure — on iOS/Safari this can happen without warning, losing the
 * only copy of the seed. This module turns the Storage API signals into a single
 * warning verdict the UI can act on (prompt-to-backup).
 */

export type StorageWarning = "none" | "not-persisted" | "low-space";

export interface StorageHealthInput {
  /** Result of `navigator.storage.persisted()` / `persist()` — durable storage granted. */
  persisted: boolean;
  /** Bytes currently used (from `estimate()`). */
  usage: number;
  /** Total bytes available (from `estimate()`); 0 when unknown. */
  quota: number;
}

/** Warn once usage reaches this fraction of the quota… */
export const STORAGE_LOW_SPACE_RATIO = 0.85;
/** …but only if free space is also below this absolute floor — 85% of a huge disk
 *  still leaves plenty of room, so the ratio alone would false-positive. */
export const STORAGE_MIN_FREE_BYTES = 50 * 1024 * 1024; // 50 MB

/**
 * Pick the most important storage warning for a wallet, or `"none"`.
 * Low-space wins over not-persisted: imminent write failures are more urgent than
 * the (conditional) eviction risk, and both resolve to "back up now".
 */
export function evaluateStorageHealth(input: StorageHealthInput): StorageWarning {
  const free = input.quota - input.usage;
  if (
    input.quota > 0 &&
    input.usage / input.quota >= STORAGE_LOW_SPACE_RATIO &&
    free < STORAGE_MIN_FREE_BYTES
  ) {
    return "low-space";
  }
  if (!input.persisted) {
    return "not-persisted";
  }
  return "none";
}
