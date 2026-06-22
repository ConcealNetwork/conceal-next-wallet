/**
 * Worker pool for the per-tx scan (deep-sync fold parallelism, Phase 3). {@link scanBatch} splits a
 * batch's raw txs into contiguous chunks, scans them across a pool of {@link Worker}s IN PARALLEL,
 * and reassembles the results IN ORDER. Because {@link scanRawTransaction} is deterministic (same
 * WASM, same inputs), a worker result is byte-identical to an in-thread one — the pool only
 * distributes + reorders, it never changes what a scan produces.
 *
 * PROFILE-DRIVEN: the pool size is the `workers` count from the active wallet's "Sync speed" profile
 * (see lib/ui/sync-speed.ts) — `scanBatch(…, workers)`. `workers === 0` (the default "Hurt me plenty"
 * and gentler levels) means in-thread, no pool; Ultra-Violence/Nightmare request a real pool. The
 * Turbopack worker chunk encodes its bootstrap config in the URL HASH (`turbopack-worker-<hash>.js
 * #params=…`); a hash never reaches the network, so a PWA service worker that cache-first-served the
 * bare chunk made the module worker's `self.location` lose the params → "Missing worker bootstrap
 * config". The service worker now keeps worker chunks OFF its cache so they load from the network with
 * the hash intact (`isWorkerChunk` in lib/pwa/precache.mjs + public/service-worker.js), so the pool
 * boots correctly (browser-validated on a real mainnet sync). Multi-source FETCH parallelism (also
 * profile-scaled via `maxSources`) is independent of this pool.
 *
 * SAFETY: every failure mode falls back to the in-thread scan (no pool / no Worker support / a
 * worker error / a timeout), so the worker path can never break or stall sync — worst case it is
 * exactly as fast as the single-threaded fold. A worker that errors on LOAD never replies, so we
 * wire its `error`/`messageerror` events to tear the pool down and settle every in-flight chunk
 * in-thread IMMEDIATELY rather than waiting out {@link CHUNK_TIMEOUT_MS} per batch. The caller must
 * have run `ensureSdkReady` (the in-thread fallback uses the main-thread WASM).
 *
 * The pool is a process-wide singleton. Concurrent `scanBatch` calls (e.g. the active wallet's sync
 * and a background secondary-wallet sync, #108) share it: requests are id-keyed and the per-tx scan
 * is pure, so results stay correct, but the workers are time-sliced rather than truly parallel
 * across both — a perf trade-off, never a correctness issue.
 */
import type { WalletKeys } from "conceal-wallet-sdk";
import {
  type DaemonRawTransaction,
  type RawScanResult,
  scanRawTransaction,
} from "@/lib/services/real-sdk/scan";
import type { ScanResponse } from "@/lib/services/real-sdk/scan-worker";

/** Hard cap on workers regardless of core count (diminishing returns + memory per WASM instance). */
const MAX_WORKERS = 8;
/** Generous per-chunk fallback timeout — only trips on a genuine hang, not normal scanning. */
const CHUNK_TIMEOUT_MS = 60_000;

type Pending = {
  resolve: (results: (RawScanResult | null)[]) => void;
  reject: (error: unknown) => void;
};

let workers: Worker[] | null = null;
// Set once a worker has failed this session → stay in-thread (don't respawn workers that re-fail).
// Reset on terminateScanPool (lock/disconnect) so a fresh unlock can try the pool again.
let poolFailed = false;
const pending = new Map<number, Pending>();
let nextRequestId = 0;

/** Clamp the profile's requested worker count to [1, MAX_WORKERS] and the machine's core count. */
function desiredPoolSize(requested: number): number {
  const cores =
    typeof navigator !== "undefined" && navigator.hardwareConcurrency
      ? navigator.hardwareConcurrency
      : 4;
  // Leave ONE core for the main thread so the UI stays responsive enough to dial the level back
  // down — pinning ALL cores (Nightmare on an 8-core box) froze the settings UI so you couldn't
  // escape. Still brutal (all-but-one), just not a lockout. High-core boxes still hit MAX_WORKERS.
  return Math.max(1, Math.min(requested, MAX_WORKERS, cores - 1));
}

/**
 * A worker raised a load or runtime error. The dominant case is the Turbopack worker chunk failing
 * to bootstrap ("Missing worker bootstrap config"), and the chunk is IDENTICAL for every worker, so
 * one such error means the whole pool is dead. We deliberately tear the WHOLE pool down on any
 * worker error rather than per-chunk: it is coarser than the per-chunk timeout fallback (a single
 * transient runtime error also retires the pool for the session) but it is always safe — every
 * in-flight chunk settles via the in-thread fallback NOW (each pending `reject` is wired to
 * `fallBackInThread`), never waiting out {@link CHUNK_TIMEOUT_MS}, and the worst case is the
 * in-thread fold speed. `poolFailed` then stays true, so subsequent batches scan in-thread for the
 * rest of the session instead of re-spawning workers that will only fail again.
 */
function failPool(): void {
  poolFailed = true;
  if (workers) {
    for (const worker of workers) worker.terminate();
  }
  workers = null;
  const inflight = [...pending.values()];
  pending.clear();
  for (const entry of inflight)
    entry.reject(new Error("scan worker pool error — falling back in-thread"));
}

/**
 * Lazily create (or reuse) the worker pool sized to the profile's `requested` worker count. Returns
 * null — i.e. scan in-thread — when `requested <= 0` (gentle Sync-speed levels), after a pool failure
 * this session, or when Workers are unavailable (SSR / blocked). An existing pool is reused; if a
 * LARGER count is now wanted (e.g. a Nightmare sync after an Ultra-Violence one created a smaller
 * pool) it's grown — but only while IDLE (`pending.size === 0`), so a resize never orphans an
 * in-flight chunk. A smaller request just reuses the bigger pool (spare workers are harmless).
 */
function getPool(requested: number): Worker[] | null {
  if (poolFailed || requested <= 0 || typeof Worker === "undefined") return null;
  const target = desiredPoolSize(requested);
  if (workers) {
    if (workers.length >= target || pending.size > 0) return workers;
    for (const worker of workers) worker.terminate();
    workers = null;
  }
  try {
    const created: Worker[] = [];
    for (let i = 0; i < target; i++) {
      const worker = new Worker(new URL("./scan-worker.ts", import.meta.url), { type: "module" });
      worker.addEventListener("message", (event: MessageEvent<ScanResponse>) => {
        const entry = pending.get(event.data.id);
        if (!entry) return;
        pending.delete(event.data.id);
        if (event.data.error || !event.data.results) {
          entry.reject(new Error(event.data.error ?? "scan worker returned no results"));
        } else {
          entry.resolve(event.data.results);
        }
      });
      // A worker that fails to LOAD/bootstrap never posts a message — fall the whole pool back to
      // in-thread immediately rather than letting each chunk wait out the 60s timeout.
      // `preventDefault()` keeps a bootstrap failure from also surfacing as an uncaught page error.
      worker.addEventListener("error", (event) => {
        event.preventDefault();
        failPool();
      });
      worker.addEventListener("messageerror", failPool);
      created.push(worker);
    }
    workers = created;
    return created;
  } catch {
    workers = null;
    return null;
  }
}

/** Split `items` into `n` contiguous, order-preserving chunks (some may be empty when n > length). */
function chunk<T>(items: readonly T[], n: number): T[][] {
  const out: T[][] = [];
  const size = Math.ceil(items.length / n);
  for (let i = 0; i < n; i++) out.push(items.slice(i * size, (i + 1) * size));
  return out;
}

/** Scan one chunk on a worker; fall back to an in-thread scan on error or timeout. */
function scanChunkOnWorker(
  worker: Worker,
  chunkTxs: DaemonRawTransaction[],
  keys: WalletKeys,
): Promise<(RawScanResult | null)[]> {
  const id = nextRequestId++;
  return new Promise((resolve, reject) => {
    let settled = false;
    const fallBackInThread = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      pending.delete(id);
      try {
        resolve(chunkTxs.map((tx) => scanRawTransaction(tx, keys)));
      } catch (error) {
        // The in-thread fallback itself failed — REJECT (don't leave the promise unsettled, which
        // would wedge the whole sync). The await in syncOnce then throws and the next poll retries
        // from `scannedHeight`, matching the pre-worker error behavior (GLM review F1).
        reject(error);
      }
    };
    const timer = setTimeout(fallBackInThread, CHUNK_TIMEOUT_MS);
    pending.set(id, {
      resolve: (results) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(results);
      },
      // A worker-reported error → fall back in-thread (which settles via resolve or reject above).
      reject: fallBackInThread,
    });
    worker.postMessage({ id, rawTxs: chunkTxs, keys });
  });
}

/**
 * Scan a batch of raw txs across a worker pool sized to `workers` (the Sync-speed profile's count),
 * preserving order. Falls back to a straight in-thread scan when `workers <= 0` or no pool is
 * available. The returned array aligns 1:1 with `rawTxs`.
 */
export async function scanBatch(
  rawTxs: DaemonRawTransaction[],
  keys: WalletKeys,
  workers: number,
): Promise<(RawScanResult | null)[]> {
  if (rawTxs.length === 0) return [];
  const pool = getPool(workers);
  if (!pool || pool.length === 0) {
    return rawTxs.map((tx) => scanRawTransaction(tx, keys));
  }
  const chunks = chunk(rawTxs, pool.length);
  const scanned = await Promise.all(
    chunks.map((chunkTxs, i) =>
      chunkTxs.length === 0
        ? Promise.resolve<(RawScanResult | null)[]>([])
        : scanChunkOnWorker(pool[i], chunkTxs, keys),
    ),
  );
  return scanned.flat();
}

/**
 * Terminate the worker pool (called on lock/disconnect to free resources). Workers receive the
 * wallet keys per request but never persist them (handler-scope only); termination drops them.
 * Any in-flight chunk requests are settled NOW (their workers are gone) via the in-thread fallback,
 * so they don't wait out the full timeout after a lock (GLM review F6).
 */
export function terminateScanPool(): void {
  if (workers) {
    for (const worker of workers) worker.terminate();
  }
  workers = null;
  poolFailed = false;
  const inflight = [...pending.values()];
  pending.clear();
  for (const entry of inflight) entry.reject(new Error("scan pool terminated"));
}
