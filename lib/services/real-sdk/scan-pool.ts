/**
 * Worker pool for the per-tx scan (deep-sync fold parallelism, Phase 3). {@link scanBatch} splits a
 * batch's raw txs into contiguous chunks, scans them across a pool of {@link Worker}s IN PARALLEL,
 * and reassembles the results IN ORDER. Because {@link scanRawTransaction} is deterministic (same
 * WASM, same inputs), a worker result is byte-identical to an in-thread one — the pool only
 * distributes + reorders, it never changes what a scan produces.
 *
 * OPT-IN: the pool is OFF by default and only spun up when {@link workerScanEnabled} is set — the
 * Turbopack worker chunk currently fails to bootstrap ("Missing worker bootstrap config") when the
 * PWA service worker serves it without the `?params=` the worker runtime needs, so the safe default
 * is the in-thread fold (correct + the original speed). The deep-sync win is multi-source FETCH
 * parallelism, which is independent of this pool.
 *
 * TODO(worker-scan root cause): this gate ROUTES AROUND the bundler/SW interaction rather than
 * fixing it. The real fix is to stop the service worker from caching the Turbopack worker chunk
 * stripped of its `?params=` (precache should skip `_next/static/chunks/*worker*` or preserve the
 * query). Once that lands, flip {@link workerScanEnabled} back to default-on and re-validate the
 * fold parallelism in a real browser (Turbopack static export, incl. the PAGES_BASE_PATH subpath).
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
import { workerScanEnabled } from "@/lib/services/real-sdk/sync-flags";

/** Hard cap on workers regardless of core count (diminishing returns + memory per WASM instance). */
const MAX_WORKERS = 8;
/** Generous per-chunk fallback timeout — only trips on a genuine hang, not normal scanning. */
const CHUNK_TIMEOUT_MS = 60_000;

type Pending = {
  resolve: (results: (RawScanResult | null)[]) => void;
  reject: (error: unknown) => void;
};

let workers: Worker[] | null = null;
let poolInitTried = false;
const pending = new Map<number, Pending>();
let nextRequestId = 0;

function desiredPoolSize(): number {
  const cores =
    typeof navigator !== "undefined" && navigator.hardwareConcurrency
      ? navigator.hardwareConcurrency
      : 4;
  // Leave a core for the main thread; at least 1, at most MAX_WORKERS.
  return Math.max(1, Math.min(MAX_WORKERS, cores - 1));
}

/**
 * A worker raised a load or runtime error. The dominant case is the Turbopack worker chunk failing
 * to bootstrap ("Missing worker bootstrap config"), and the chunk is IDENTICAL for every worker, so
 * one such error means the whole pool is dead. We deliberately tear the WHOLE pool down on any
 * worker error rather than per-chunk: it is coarser than the per-chunk timeout fallback (a single
 * transient runtime error also retires the pool for the session) but it is always safe — every
 * in-flight chunk settles via the in-thread fallback NOW (each pending `reject` is wired to
 * `fallBackInThread`), never waiting out {@link CHUNK_TIMEOUT_MS}, and the worst case is the
 * in-thread fold speed. `workers` stays null with `poolInitTried` true, so subsequent batches scan
 * in-thread for the rest of the session instead of re-spawning workers that will only fail again.
 */
function failPool(): void {
  if (workers) {
    for (const worker of workers) worker.terminate();
  }
  workers = null;
  const inflight = [...pending.values()];
  pending.clear();
  for (const entry of inflight)
    entry.reject(new Error("scan worker pool error — falling back in-thread"));
}

/** Lazily create the worker pool. Returns null when workers are unavailable (opt-out / SSR / blocked). */
function getPool(): Worker[] | null {
  if (poolInitTried) return workers;
  poolInitTried = true;
  // Opt-in only — default is the in-thread fold (see module header: broken Turbopack worker bootstrap).
  if (!workerScanEnabled()) return null;
  if (typeof Worker === "undefined") return null;
  try {
    const created: Worker[] = [];
    for (let i = 0; i < desiredPoolSize(); i++) {
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
      // `preventDefault()` keeps a bootstrap failure from also surfacing as an uncaught error on the
      // page in opt-in mode (the OFF default spawns no worker, so it never fires there at all).
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
 * Scan a batch of raw txs in parallel across the worker pool, preserving order. Falls back to a
 * straight in-thread scan when no pool is available. The returned array aligns 1:1 with `rawTxs`.
 */
export async function scanBatch(
  rawTxs: DaemonRawTransaction[],
  keys: WalletKeys,
): Promise<(RawScanResult | null)[]> {
  if (rawTxs.length === 0) return [];
  const pool = getPool();
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
  poolInitTried = false;
  const inflight = [...pending.values()];
  pending.clear();
  for (const entry of inflight) entry.reject(new Error("scan pool terminated"));
}
