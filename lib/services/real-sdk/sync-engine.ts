/**
 * The sync engine for the SDK wallet engine: fetch strategies (resilient split +
 * verified multi-source), the manual `syncOnce` loop (our OWN loop — NOT the SDK's
 * `createWalletSync`), the per-batch fold into {@link WalletState}, inbound-message
 * reconstruction, mempool incoming + outbound-queue drains, and deep-sync
 * checkpointing. Split out of `runtime.ts` (which keeps the registry + lifecycle
 * and re-exports this module's API) so sync evolves in one focused module.
 *
 * Bound to the runtime, not the active wallet: a sync started for wallet A folds
 * into A's cached runtime and persists into A's keyspace even if the user switches
 * the active wallet mid-scan — see `runtime-registry.ts` for the concurrency
 * invariant and `persistence.ts` for the write chain.
 */
import {
  applyScannedDeposits,
  applyScannedTransaction,
  type DaemonClient,
  findWithdrawnDepRefs,
  isWithdrawShape,
  transactions as txns,
  type WalletState,
} from "conceal-wallet-sdk";
import {
  type IncomingPendingRecord,
  readIncomingPendingRecords,
  reconcileIncomingPending,
  withIncomingPendingRecords,
} from "@/lib/services/real-sdk/incoming-pending-store";
import {
  applyInboundScanToReceived,
  dropExpiredTtl,
  flushReceivedRaw,
  minedHeightsFromState,
  patchSentMessageBlockHeights,
  pruneStaleMempoolReceived,
  readReceivedRecords,
  readSentRecords,
  reconstructReceivedMessage,
  type SdkMessageRecord,
  withReceivedRecords,
  withSentRecords,
} from "@/lib/services/real-sdk/messages-store";
import {
  type FetchSource,
  fetchRangeMultiSource,
} from "@/lib/services/real-sdk/multi-source-fetch";
import { buildDaemon, nodeUrlFromRaw } from "@/lib/services/real-sdk/daemon-node";
import { queueForRuntime } from "@/lib/services/real-sdk/outbound-queue";
import {
  prunePendingRecords,
  readPendingRecords,
  withPendingRecords,
} from "@/lib/services/real-sdk/pending-store";
import { scanPoolForInbound } from "@/lib/services/real-sdk/pool";
import { ensureSdkReady } from "@/lib/services/real-sdk/ready";
import {
  type RuntimeCoordination,
  type SdkRuntime,
  coordinationFor,
  requireRuntime,
  runtimeId,
} from "@/lib/services/real-sdk/runtime-registry";
import { persistRuntime } from "@/lib/services/real-sdk/persistence";
import {
  type DaemonRawTransaction,
  isRecord,
  type RawScanResult,
  toScanTransaction,
} from "@/lib/services/real-sdk/scan";
import { desiredPoolSize, scanBatch } from "@/lib/services/real-sdk/scan-pool";
import { parallelSyncDisabled, syncTimingEnabled } from "@/lib/services/real-sdk/sync-flags";
import { fetchSmartNodes, nodeUrlToPoolHost } from "@/lib/network/smart-nodes";
import { probeNodes, rankNodes } from "@/lib/network/node-probe";
import { syncProfileFromReadSpeed } from "@/lib/ui/sync-speed";

/**
 * Re-scan this many trailing blocks on every sync. A daemon can return a block range via
 * `getWalletSyncData` BEFORE it has indexed a tx that was just mined into one of those
 * blocks; without re-scanning, `scannedHeight` advances past it and the tx is dropped until
 * a manual full rescan (#98). Folding is idempotent, so re-scanning recent blocks every sync
 * is safe and also covers small chain reorgs.
 */
const RESCAN_LAG_BLOCKS = 10;

/**
 * Blocks fetched per sync batch. Larger batches cut the per-batch round-trip COUNT — the dominant
 * deep-sync cost on a remote node (latency × number of requests). The daemon caps a single
 * `get_raw_transactions_by_heights` range by BOTH height span AND tx payload (a live node served
 * 1000 blocks but reset at 1500+, and the cap shrinks as tx density rises), so this can't go
 * arbitrarily high. 250 stays comfortably under the cap on typical chains (~2.5× fewer requests
 * than the old 100); {@link fetchSyncRange} transparently splits any batch that still exceeds the
 * cap on an unusually dense region, so raising this never aborts a sync.
 */
const SYNC_BATCH_BLOCKS = 250;

/**
 * Max times {@link fetchSyncRange} halves a failing range before giving up (bounds retry fan-out
 * on a down node to a leftmost spine of `depth + 1` requests). 8 lets the default {@link
 * SYNC_BATCH_BLOCKS} (250) split all the way down to a SINGLE block (`ceil(log2(250)) = 8`), so an
 * extreme payload spike can be isolated to one block rather than aborting the sync at a ~15-block
 * floor (a single block over the cap is a true daemon limit and then legitimately propagates).
 */
const MAX_FETCH_SPLIT_DEPTH = 8;

/**
 * Multi-source parallel fetch (Phase 2) engages only when the wallet is at least this many blocks
 * behind the tip — a deep catch-up (fresh import / long offline) where parallel download across
 * nodes pays off. Normal incremental polls stay single-node (no pool probe, no overhead).
 */
const FAR_BEHIND_THRESHOLD = 2000;

/** Persist scan cursor every N blocks during deep catch-up (tab-close / lock safety). */
const SYNC_CHECKPOINT_BLOCKS = 1000;

/**
 * Blocks at the chain TIP always fetched from the HOME node only, never distributed. Keeps the
 * volatile, reorg-prone tip on the authoritative node and — being well above {@link
 * NODE_LAG_WARN_BLOCKS} (5) — guarantees every healthy peer (within that lag of the tip) covers
 * the entire distributed bulk range.
 */
const MULTI_SOURCE_TIP_MARGIN = 100;

/** Cap on nodes used per multi-source bulk sync (home + peers) — bounds load + concurrency. */
const MAX_SYNC_SOURCES = 4;

/**
 * Advance the ACTIVE wallet's live state to the network tip, serialized against
 * concurrent calls. Never runs two scans at once for the same wallet: if a scan is
 * in flight, the caller awaits it and (because its data may predate this call) a
 * single follow-up scan is queued. Returns the network height observed by the scan
 * the caller ultimately awaits.
 */
export async function sync(): Promise<number> {
  return syncRuntime(requireRuntime());
}

/**
 * Sync a SPECIFIC runtime to the network tip, serialized against concurrent calls
 * for THAT wallet. Bound to the runtime so a mid-flight active-wallet switch never
 * redirects this scan to another wallet's state/storage.
 */
export function syncRuntime(rt: SdkRuntime): Promise<number> {
  const coord = coordinationFor(runtimeId(rt));
  // Idle → start a fresh scan chain for this wallet.
  if (coord.inFlightSync === null) {
    coord.inFlightSync = runSyncChain(rt, coord);
    return coord.inFlightSync;
  }
  // A scan is already running for this wallet. Queue exactly one follow-up so this
  // caller's intent to catch up AFTER the current scan is honored, then await it.
  coord.pendingSync = true;
  return coord.inFlightSync;
}

/** Run scans back-to-back while follow-ups are pending, clearing the guard at the end. */
async function runSyncChain(rt: SdkRuntime, coord: RuntimeCoordination): Promise<number> {
  let height = 0;
  try {
    do {
      coord.pendingSync = false;
      height = await syncOnce(rt);
    } while (coord.pendingSync);
  } finally {
    coord.inFlightSync = null;
    coord.pendingSync = false;
    coord.lastCheckpointHeight = 0;
  }
  return height;
}

/**
 * Persist a mid-sync checkpoint during deep catch-up.
 * No-op on the light path or if fewer than SYNC_CHECKPOINT_BLOCKS advanced since last checkpoint.
 */
export async function maybeCheckpoint(
  rt: SdkRuntime,
  coord: RuntimeCoordination,
  useHeavyPath: boolean,
): Promise<void> {
  if (!useHeavyPath) return;
  if (rt.state.scannedHeight - coord.lastCheckpointHeight < SYNC_CHECKPOINT_BLOCKS) return;
  await persistRuntime(rt);
  coord.lastCheckpointHeight = rt.state.scannedHeight;
}

/**
 * Advance `rt`'s live state to the network tip via a manual sync loop
 * (`getWalletSyncData` → `scanTransactionOutputsAndDeposits` → apply), then
 * persist when the state advanced. Returns the network height.
 *
 * A manual loop (rather than `createWalletSync`) keeps the synced state inside the
 * single encrypted `"wallet"` blob — `createWalletSync`'s own persistence writes a
 * separate plaintext record under a different key, which we deliberately avoid.
 *
 * Bound to `rt` (NOT `requireRuntime()`): folds + persists into THAT wallet even if
 * the user switches the active wallet mid-scan. Not called concurrently for the same
 * wallet — {@link syncRuntime} serializes all callers onto it.
 */
// Runtimes whose mempool-pool RPC has already failed once — used to warn a single time
// per runtime instead of on every background poll when a daemon lacks the pool RPC (#109).
const poolScanWarned = new WeakSet<SdkRuntime>();
// Same one-warning-per-runtime treatment for the durable outbound-queue drainer (#92).
const queueDrainWarned = new WeakSet<SdkRuntime>();

/**
 * Fetch the HALF-OPEN block range `[start, end)` from the daemon, splitting into halves and
 * concatenating on a fetch failure — so a single over-cap request (a dense region exceeding the
 * daemon's range/payload limit, or a transient blip) splits and recovers instead of aborting the
 * whole sync. Returns the txs for the FULL requested range in ascending order, so callers keep a
 * DETERMINISTIC `endBlock` (the pipeline math is unaffected by an internal split). Bottoms out at a
 * single block (or {@link MAX_FETCH_SPLIT_DEPTH}): if even that fails the error propagates — the
 * node is genuinely unreachable, not merely over-cap — and the sync retries from `scannedHeight`
 * on the next poll.
 *
 * Relies on the daemon ERRORING (connection reset / non-OK status) when a range exceeds its cap —
 * verified on a live node and in the SDK client (an HTTP-not-ok response and a non-OK JSON status
 * both throw). It does NOT defend against a hypothetical node that returns `200 OK` with SILENTLY
 * TRUNCATED blocks: with miner-txs off an empty batch is valid, so a short response is
 * indistinguishable from "no owned txs" and cannot be detected from the payload (this is a
 * pre-existing property of the sparse sync response, not introduced here).
 *
 * Exported for direct unit testing of the split/ordering behavior.
 */
export async function fetchSyncRange(
  daemon: DaemonClient,
  start: number,
  end: number,
  includeMinerTxs: boolean,
  depth = 0,
): Promise<DaemonRawTransaction[]> {
  try {
    return await daemon.getWalletSyncData(start, end, includeMinerTxs);
  } catch (error) {
    // Intentionally broad: a non-retryable error (e.g. a malformed-response throw) simply
    // propagates after a bounded amount of wasted split-and-retry — never silently swallowed.
    const span = end - start;
    if (span <= 1 || depth >= MAX_FETCH_SPLIT_DEPTH) throw error;
    const mid = start + Math.floor(span / 2);
    // `left` (lower heights) before `right` keeps the concatenation ascending — the daemon returns
    // each sub-range ascending, so the merged result stays in block order for the sequential fold.
    const left = await fetchSyncRange(daemon, start, mid, includeMinerTxs, depth + 1);
    const right = await fetchSyncRange(daemon, mid, end, includeMinerTxs, depth + 1);
    return left.concat(right);
  }
}

/**
 * True for a coinbase (miner-reward) transaction — the ONLY tx type that carries a `gen` input.
 * Used to drop coinbases that were fetched ONLY as coverage markers (see {@link fetchVerifiedRange})
 * before folding. SAFE-BY-CONSTRUCTION: a `gen` input never appears on a real (key/deposit-input)
 * transaction, so this can only ever drop a coinbase — never a real tx. If a daemon ever shaped a
 * coinbase differently this would return false and the coinbase would simply be scanned (a wasted
 * no-op for a non-mining wallet), never a missed real tx.
 */
function isCoinbaseTx(rawTx: DaemonRawTransaction): boolean {
  const inner = rawTx.transaction;
  if (!isRecord(inner)) return false;
  const vin = inner.vin;
  if (!Array.isArray(vin) || vin.length !== 1) return false;
  const input = vin[0];
  return isRecord(input) && ("gen" in input || input.type === "ff");
}

/**
 * Fetch the HALF-OPEN range `[start, end)` from an UNTRUSTED node and PROVE it returned every block
 * — defends the multi-source path against a peer that is behind, load-balanced to a trailing
 * backend, or truncating: such a peer answers `200 OK` with a short/empty body, which (with miner
 * txs off) is indistinguishable from "no owned txs" and would otherwise advance `scannedHeight` past
 * unseen blocks → silently missed funds (PR #177 review — Codex/Gemini/GLM).
 *
 * Forces `include_miner_txs` ON so EVERY block carries a coinbase = a universal coverage marker
 * (independent of the wallet's own miner-tx preference), then asserts every height in `[start, end)`
 * is present; a missing block throws, so {@link fetchRangeMultiSource}'s failover re-fetches that
 * batch from another node (ultimately the authoritative home node). The coverage check uses only the
 * `height` fields (shape-independent), so it is robust regardless of the coinbase encoding. Coinbase
 * markers are then dropped before returning UNLESS the wallet actually scans miner txs (solo mining).
 */
export async function fetchVerifiedRange(
  daemon: DaemonClient,
  start: number,
  end: number,
  walletWantsMinerTxs: boolean,
  chainHeight: number,
): Promise<DaemonRawTransaction[]> {
  const raw = await fetchSyncRange(daemon, start, end, true);
  const seen = new Set<number>();
  for (const tx of raw) {
    if (typeof tx.height === "number") seen.add(tx.height);
  }
  // Require every EXISTING block in the range. `chainHeight` is a block COUNT, so the highest real
  // block is `chainHeight - 1`; the daemon clamps a past-tip upper bound (verified live), and the
  // tip batch legitimately passes `end = endBlock + 1 = chainHeight + 1`. So cap the assertion at
  // `min(end, chainHeight)` — block `chainHeight` (and beyond) never exists, so requiring it would
  // wedge every sync at the tip. Block 0 (genesis) has no coinbase and the SDK normalizes start
  // 0→1, so start at block 1. A node BEHIND the observed `chainHeight` still returns fewer blocks
  // than `[start, min(end, chainHeight))` → throws → the truncating/trailing-backend detection holds.
  const required = Math.min(end, chainHeight);
  for (let h = Math.max(start, 1); h < required; h++) {
    if (!seen.has(h)) {
      throw new Error(
        `Node returned an incomplete range: block ${h} missing in [${start}, ${required}).`,
      );
    }
  }
  return walletWantsMinerTxs ? raw : raw.filter((tx) => !isCoinbaseTx(tx));
}

// One-warning-per-runtime for a multi-source bulk that failed and fell back to single-node (#92-style).
const multiSourceWarned = new WeakSet<SdkRuntime>();

/**
 * Build the set of {@link FetchSource}s for a multi-source bulk sync: the HOME node first (the
 * authoritative failover that covers the whole range), followed by up to {@link MAX_SYNC_SOURCES}-1
 * of the FASTEST healthy peers from the curated public pool. Each source carries its probed tip so
 * the driver only assigns it batches it actually has. Best-effort: a pool/probe failure yields just
 * the home node (the caller then skips multi-source and uses the single-node pipeline). Engine-free
 * deps (`fetchSmartNodes`/`probeNodes`) keep this off the mock path.
 */
async function buildSyncSources(
  rt: SdkRuntime,
  homeHeight: number,
  includeMinerTxs: boolean,
  maxSources: number = MAX_SYNC_SOURCES,
): Promise<FetchSource<DaemonRawTransaction>[]> {
  const homeUrl = nodeUrlFromRaw(rt.raw);
  const home: FetchSource<DaemonRawTransaction> = {
    label: "home",
    height: homeHeight,
    // Verify even the home node: explorer.conceal.network is itself load-balanced, so a single
    // request can land on a trailing backend and answer short. Verification + failover make that safe.
    fetch: (start, end) => fetchVerifiedRange(rt.daemon, start, end, includeMinerTxs, homeHeight),
  };

  // home-only (gentle Sync-speed levels): skip the pool fetch + probe entirely (GLM review L1).
  if (maxSources <= 1) return [home];

  let candidateUrls: string[];
  try {
    const pool = await fetchSmartNodes(homeUrl);
    const homeHost = nodeUrlToPoolHost(homeUrl);
    candidateUrls = pool
      .map((node) => node.url)
      .filter((url) => nodeUrlToPoolHost(url) !== homeHost);
  } catch {
    return [home]; // no pool → home only; caller skips multi-source
  }
  if (candidateUrls.length === 0) return [home];

  // Probe peers (latency + tip), keep the healthy ones (reachable + within node-lag of the tip),
  // fastest first, and cap how many we actually fan out to.
  // maxSources is > 1 here (the <= 1 case returned home-only above), so this keeps >= 1 peer.
  const healthy = rankNodes(await probeNodes(candidateUrls)).slice(0, maxSources - 1);
  const peers = healthy.map((probe): FetchSource<DaemonRawTransaction> => {
    const daemon = buildDaemon(probe.url);
    return {
      label: probe.url,
      // rankNodes only returns probes with a non-null height.
      height: probe.height as number,
      // Untrusted pool peer — fetchVerifiedRange proves it returned every block (else it throws
      // and the driver fails over to another node / home), closing the silent-skip hole. Cap the
      // coverage requirement at the HOME node's height (the authoritative tip we're syncing to).
      fetch: (start, end) => fetchVerifiedRange(daemon, start, end, includeMinerTxs, homeHeight),
    };
  });
  return [home, ...peers];
}

async function syncOnce(rt: SdkRuntime): Promise<number> {
  // Await WASM crypto init before scanTransactionOutputsAndDeposits / ring math.
  await ensureSdkReady();
  const height = await rt.daemon.getHeight();
  // The "Sync speed" profile (DOOM skill levels) drives the deep-sync knobs — batch size, worker-pool
  // size, and multi-source node count — off the `options.readSpeed` number (an unknown/legacy value
  // resolves to the default profile). `|| SYNC_BATCH_BLOCKS` is a defensive guard only — every
  // resolved profile already has a concrete `batchBlocks`.
  const profile = syncProfileFromReadSpeed(Number(rt.raw.options?.readSpeed ?? 0));
  const batchSize = profile.batchBlocks || SYNC_BATCH_BLOCKS;
  // Coinbase (miner) outputs are scanned only when the wallet opts in (solo mining).
  const includeMinerTxs = Boolean(rt.raw.options?.checkMinerTx);
  // Resume from a re-scan window below the last scanned height (see RESCAN_LAG_BLOCKS),
  // floored at the wallet's seed/creation height so we never scan pre-existence blocks.
  // The extra `- 1` absorbs `scannedHeight`'s COUNT-vs-index overshoot: at the tip the sync
  // advances `scannedHeight` to `height` (the block COUNT, one past the highest real block
  // index `height - 1`, for a 100%-sync UI), so `scannedHeight - RESCAN_LAG_BLOCKS` alone would
  // re-cover only `RESCAN_LAG_BLOCKS - 1` real blocks there and a tx late-indexed exactly
  // `RESCAN_LAG_BLOCKS` back could be missed (Codex review). Folding is idempotent, so the one
  // extra re-scanned block mid-catch-up is harmless; `seedFloor` still pins the lower bound.
  const seedFloor = Math.max(0, (Number(rt.raw.creationHeight ?? 0) || 0) - 1);
  let scanned = Math.max(seedFloor, rt.state.scannedHeight - RESCAN_LAG_BLOCKS - 1);
  // A DEEP catch-up (fresh import / long offline). Gates ALL the heavy machinery — multi-source
  // bulk fetch, coverage verification, AND the worker-pool scan — so an ordinary incremental poll
  // (already-synced wallet) stays on the original LIGHT path (sparse fetch + in-thread scan, no
  // miner-tx payload, no worker round-trip). The overhead only pays off on a long catch-up.
  const farBehind = height - scanned > FAR_BEHIND_THRESHOLD;
  // `useHeavyPath` is `farBehind` unless the parallel speed path is force-disabled via the
  // `ccx-disable-parallel-sync` flag (a kill-switch to A/B the speed options against the light path).
  const useHeavyPath = farBehind && !parallelSyncDisabled();
  const coord = coordinationFor(runtimeId(rt));
  const startState = rt.state;
  let state = rt.state;
  const chainStateWasReset =
    startState.outputs.length === 0 &&
    startState.transactions.length === 0 &&
    startState.spentKeyImages.length === 0;

  // Diagnostic timing (opt-in via `ccx-sync-timing`): track how long the sync took + which path ran.
  const syncStartedAt = Date.now();
  const startScanned = scanned;
  let batchCount = 0;
  let multiSourceEngaged = false;

  // Our own outbound message txs already live in `sentMessages`; never reclassify
  // them as inbound. Build the received-message set keyed by tx hash for dedupe.
  const sentHashes = new Set(readSentRecords(rt.raw).map((record) => record.id));
  const received = new Map<string, SdkMessageRecord>(
    chainStateWasReset
      ? []
      : readReceivedRecords(rt.raw).map((record) => [record.id, record] as const),
  );
  let receivedChanged = false;

  // Apply one batch's PRE-SCANNED results into the running state: the per-tx ECDH scan already ran
  // (in-thread or across the worker pool, see `scanBatch`); here we only do the state-dependent
  // APPLY + inbound-message reconstruction (deduped by hash), advance the cursor to `newScanned`,
  // and publish progress in-memory (never backwards) so a concurrent getWalletInfo sees the height
  // climb during a long catch-up. Shared by the multi-source bulk phase and the single-node loop —
  // both deliver batches in ASCENDING block order, which the WalletState fold requires.
  const foldBatch = (scanResults: (RawScanResult | null)[], newScanned: number): void => {
    batchCount += 1;
    let receivedChangedThisBatch = false;
    for (const result of scanResults) {
      if (result === null) continue;
      state = applyScanResult(state, result);

      // Reconstruct any inbound message from this tx's `extra` (deduped by hash).
      const txHash = typeof result.scanTx.hash === "string" ? result.scanTx.hash : "";
      if (txHash) {
        const inbound = reconstructReceivedMessage(result.scanTx, rt.account.keys, {
          sentHashes,
          timestamp: result.timestamp,
        });
        if (inbound !== null && applyInboundScanToReceived(received, txHash, inbound)) {
          receivedChanged = true;
          receivedChangedThisBatch = true;
        }
      }
    }
    scanned = newScanned;
    // Publish progress after each batch (never backwards), but ONLY when something changed — the
    // cursor advanced or a tx folded — so an idle at-tip re-scan never allocates a new state or
    // triggers a persist (no per-poll write churn). Encrypted persist is a checkpoint below
    // (deep path) plus once at end of the loop.
    const cursorAdvanced = scanned > rt.state.scannedHeight;
    const foldedThisBatch = state !== rt.state;
    if (cursorAdvanced || foldedThisBatch) {
      state = { ...state, scannedHeight: Math.max(rt.state.scannedHeight, scanned) };
      rt.state = state;
    }
    // Flush inbound copies onto the blob before a checkpoint so resume keeps messages.
    rt.raw = flushReceivedRaw(rt.raw, received, receivedChangedThisBatch);
  };

  // Phase 2 — DEEP CATCH-UP acceleration: when far behind the tip (fresh import / long offline),
  // fetch the historical BULK across several pool nodes IN PARALLEL, keeping the volatile TIP on the
  // home node. Engages ONLY past FAR_BEHIND_THRESHOLD and only for a default (public-pool) node — a
  // user on a custom node keeps all traffic on their chosen node. Fully best-effort: any probe/fetch
  // failure (or fewer than two usable nodes) falls through to the single-node pipeline below, which
  // covers the ENTIRE remaining range from `scanned`. Block ranges are public, so distributing them
  // across nodes leaks nothing about ownership.
  const usingCustomNode = Boolean(rt.raw.options?.customNode);
  if (!usingCustomNode && useHeavyPath) {
    const bulkEnd = height - MULTI_SOURCE_TIP_MARGIN; // half-open exclusive; the tip stays on home
    if (bulkEnd > scanned + 1) {
      try {
        const sources = await buildSyncSources(rt, height, includeMinerTxs, profile.maxSources);
        if (sources.length >= 2) {
          multiSourceEngaged = true;
          await fetchRangeMultiSource<DaemonRawTransaction>({
            start: scanned + 1,
            end: bulkEnd,
            batchSize,
            sources,
            // Batches arrive ascending; scan each across the worker pool (sized by the Sync-speed
            // profile), then apply, advancing the cursor to its last (inclusive) block. onBatch is
            // awaited sequentially by the driver, so applies stay strictly ordered even though scans
            // run in parallel.
            onBatch: async (items, _batchStart, batchEnd) => {
              const results = await scanBatch(items, rt.account.keys, profile.workers);
              foldBatch(results, batchEnd - 1);
              await maybeCheckpoint(rt, coord, useHeavyPath);
            },
          });
        }
      } catch (error) {
        // Non-fatal: the single-node pipeline below resumes from wherever the bulk got to.
        if (!multiSourceWarned.has(rt)) {
          multiSourceWarned.add(rt);
          console.warn("Multi-source bulk sync failed (falling back to single node):", error);
        }
      }
    }
  }

  // Pipeline the daemon fetch with the WASM fold: prefetch the NEXT block range while folding the
  // current one, so the round-trip (latency-dominant on remote nodes) overlaps the scan instead of
  // running serially. Wall-clock drops from ~sum(Σfetch + Σfold) toward ~max(Σfetch, Σfold). Folding
  // + the state publish stay strictly sequential (one batch at a time on the main thread); only the
  // network fetch is overlapped. Covers the whole range when multi-source is skipped, and the TIP
  // that multi-source deliberately left on the home node.
  const fetchFrom = (
    from: number,
  ): { endBlock: number; data: Promise<(RawScanResult | null)[]> } => {
    const startBlock = from + 1;
    const endBlock = Math.min(startBlock + batchSize - 1, height);
    // The daemon's `get_raw_transactions_by_heights` range is HALF-OPEN `[start, end)` —
    // it returns blocks `start .. end-1`, EXCLUDING the upper bound (verified against a live
    // node: `heights:[100,101]` → only block 100; `[200,300]` → 200..299). `endBlock` here is
    // the INCLUSIVE last block we want this batch to cover, so we pass `endBlock + 1` as the
    // exclusive upper bound. Passing `endBlock` (the pre-fix behavior, mirrored from the SDK's
    // own `createWalletSync`) silently dropped block `endBlock` at EVERY batch boundary (100,
    // 200, 300, …) — a tx mined into a boundary block was never scanned → missing balance.
    // `endBlock + 1` past the tip is safely clamped by the daemon (no error). Upstream SDK has
    // the same off-by-one; reported separately.
    // The HEAVY machinery — coverage verification (forces `include_miner_txs` for the per-block
    // coverage marker) and the parallel worker-pool scan — engages ONLY on a deep catch-up
    // (`farBehind`), where the payload/worker overhead is amortized and a mid-history truncation
    // would be unrecoverable. An ordinary incremental poll (an already-synced wallet, the common
    // case) takes the LIGHT path: a sparse `fetchSyncRange` (no miner-tx payload) + a cooperative
    // in-thread scan (no worker round-trip for a tiny batch). Always go through `scanBatch` so the
    // light path still YIELDS (never a tight `map()` that freezes the UI on a large RESCAN_LAG
    // window). A transient tip truncation on the light path self-heals via the next poll's
    // RESCAN_LAG window. Coverage verification: a node clamps a past-its-tip range to a short 200
    // OK, so a load-balanced home routed to a TRAILING backend could answer short — verification +
    // failover catch that on the deep path; the ≤FAR_BEHIND_THRESHOLD light path accepts that rare
    // risk for incremental speed. The scan folds into the prefetch promise so the next batch's
    // fetch+scan overlaps this apply.
    const fetched = useHeavyPath
      ? fetchVerifiedRange(rt.daemon, startBlock, endBlock + 1, includeMinerTxs, height)
      : fetchSyncRange(rt.daemon, startBlock, endBlock + 1, includeMinerTxs);
    const data = fetched.then((rawTxs) =>
      scanBatch(rawTxs, rt.account.keys, useHeavyPath ? profile.workers : 0),
    );
    // Mark the prefetch as handled so an ORPHANED one — if the fold of an earlier batch
    // throws and exits `syncOnce` before this batch is ever awaited — can't fire an
    // `unhandledrejection`. The real `await data` below still surfaces the error normally
    // (#92/#109 review follow-up — Gemini/GLM).
    void data.catch(() => {});
    return { endBlock, data };
  };

  let pending = scanned < height ? fetchFrom(scanned) : null;
  while (pending) {
    const { endBlock, data } = pending;
    const scanResults = await data;
    // Kick off the next range's fetch + scan BEFORE applying, so it runs during the apply.
    pending = endBlock < height ? fetchFrom(endBlock) : null;
    foldBatch(scanResults, endBlock);
    await maybeCheckpoint(rt, coord, useHeavyPath);
  }

  // The per-batch publish advances rt.state only on real change, so `rt.state !==
  // startState` means this scan genuinely advanced/folded something — persist iff so.
  const stateChanged = rt.state !== startState;
  if (receivedChanged) {
    rt.raw = withReceivedRecords(rt.raw, [...received.values()]);
  }

  // Reconcile optimistic pending sends: drop any whose tx is now scanned into state
  // (mined), or that have expired without ever mining (#96).
  const currentPending = readPendingRecords(rt.raw);
  let pendingChanged = false;
  if (currentPending.length > 0) {
    const survivors = prunePendingRecords(rt.raw, rt.state, Date.now());
    if (survivors.length !== currentPending.length) {
      rt.raw = withPendingRecords(rt.raw, survivors);
      pendingChanged = true;
    }
  }

  // Sent copies are written at broadcast with blockHeight 0 — patch from mined state every
  // poll so the Messages UI clears "Pending" once the tx is in WalletState.
  const { records: sentPatched, changed: sentHeightsChanged } = patchSentMessageBlockHeights(
    readSentRecords(rt.raw),
    minedHeightsFromState(rt.state),
  );
  if (sentHeightsChanged) {
    rt.raw = withSentRecords(rt.raw, sentPatched);
  }

  if (stateChanged || receivedChanged || pendingChanged || sentHeightsChanged) {
    // Persist the mined-block results FIRST, before the optional mempool poll: a slow (or
    // hanging) pool RPC must never delay or block the durable write of freshly-mined state
    // (#109 review — GLM-M1 / Codex-1).
    await persistRuntime(rt);
  }

  // Incoming pending (#109): scan the daemon mempool for outputs owned by THIS wallet so a
  // payment addressed to us shows (0-conf row + "pending in" balance) before it mines,
  // reconciled by hash once it does. The pool FETCH is best-effort — a daemon without the
  // RPC, or any fetch/scan error, must never break the mined sync above — but the RECONCILE
  // runs regardless of fetch success, so mined / TTL-expired entries are still dropped when
  // the pool is transiently unreachable (#109 review — Codex-2). One clock for the pass.
  const nowMs = Date.now();
  let scannedIncoming: IncomingPendingRecord[] = [];
  const sentHashesForPool = new Set(readSentRecords(rt.raw).map((record) => record.id));
  const poolReceived = new Map<string, SdkMessageRecord>(
    readReceivedRecords(rt.raw).map((record) => [record.id, record] as const),
  );
  try {
    const poolTxs = await rt.daemon.getTransactionsPool();
    // The wallet may have been locked/torn down during the await — re-check before scanning.
    if (rt.account) {
      const poolScan = scanPoolForInbound(
        poolTxs,
        toScanTransaction,
        txns.scanTransactionOutputs,
        rt.account.keys,
        nowMs,
        sentHashesForPool,
      );
      scannedIncoming = poolScan.incoming;
      for (const inbound of poolScan.receivedMessages) {
        applyInboundScanToReceived(poolReceived, inbound.id, inbound);
      }
    }
  } catch (error) {
    // Warn once per runtime — a daemon lacking the pool RPC would otherwise log on every
    // poll (#109 review — GLM-H2 / Gemini / Codex-4).
    if (!poolScanWarned.has(rt)) {
      poolScanWarned.add(rt);
      console.warn("Incoming-pending pool scan unavailable (non-fatal, silenced):", error);
    }
  }
  const beforeIncoming = readIncomingPendingRecords(rt.raw);
  const nextIncoming = reconcileIncomingPending(beforeIncoming, scannedIncoming, rt.state, nowMs);
  const incomingChanged = nextIncoming !== beforeIncoming;
  const minedHashes = new Set(rt.state.transactions.map((tx) => tx.hash));
  const activeMempoolHashes = new Set(nextIncoming.map((record) => record.hash));
  const prunedReceived = pruneStaleMempoolReceived(
    [...poolReceived.values()],
    activeMempoolHashes,
    minedHashes,
  );
  const beforeReceivedList = readReceivedRecords(rt.raw);
  const receivedFingerprint = (list: SdkMessageRecord[]) =>
    [...list]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((record) => `${record.id}:${record.body}:${record.blockHeight}`)
      .join("|");
  const receivedListChanged =
    receivedFingerprint(beforeReceivedList) !== receivedFingerprint(prunedReceived);
  if (incomingChanged) {
    rt.raw = withIncomingPendingRecords(rt.raw, nextIncoming);
  }
  if (receivedListChanged) {
    rt.raw = withReceivedRecords(rt.raw, prunedReceived);
  }
  // Clock-TTL: drop sent/received copies whose mempool TTL has elapsed so they
  // cannot linger in the blob (UI + wallet export).
  const ttlDrop = dropExpiredTtl(rt.raw, Math.floor(nowMs / 1000));
  if (ttlDrop.changed) {
    rt.raw = ttlDrop.raw;
  }
  if (incomingChanged || receivedListChanged || ttlDrop.changed) {
    await persistRuntime(rt);
  }

  // Durable outbound queue (#92): retry any due broadcasts (a send that hit a transient
  // network error stays queued until it relays), then drop entries whose tx has now mined
  // into state. Best-effort and on its own persisted namespace — never blocks mined sync.
  try {
    const queue = queueForRuntime(rt);
    await queue.drainOnce();
    const entries = await queue.list();
    if (entries.length > 0) {
      const minedHashes = new Set(rt.state.transactions.map((tx) => tx.hash));
      for (const entry of entries) {
        if (minedHashes.has(entry.hash)) await queue.remove(entry.id);
      }
    }
  } catch (error) {
    if (!queueDrainWarned.has(rt)) {
      queueDrainWarned.add(rt);
      console.warn("Outbound-queue drain failed (non-fatal, silenced):", error);
    }
  }

  // Diagnostic timing (opt-in): report how long this sync took + which path ran, so the speed
  // options can be A/B'd on a real wallet (`ccx-sync-timing=1`; pair with `ccx-disable-parallel-sync`).
  if (syncTimingEnabled()) {
    const ms = Date.now() - syncStartedAt;
    const blocks = scanned - startScanned;
    const perSec = ms > 0 ? Math.round((blocks / ms) * 1000) : 0;
    // `workers` is the profile request; `pool` is what scan-pool actually spawned after the
    // hardwareConcurrency clamp (0 = cooperative in-thread). Log both so a slow mobile sync is
    // diagnosable from the console (pool=0 while workers>0 means the pool failed this session).
    const cores =
      typeof navigator !== "undefined" && navigator.hardwareConcurrency
        ? navigator.hardwareConcurrency
        : 0;
    const pool = useHeavyPath && profile.workers > 0 ? desiredPoolSize(profile.workers) : 0;
    console.warn(
      `[ccx-sync] ${blocks} blocks in ${ms}ms (${perSec}/s) · batches=${batchCount} · path=${
        useHeavyPath ? "parallel" : "light"
      } · multiSource=${multiSourceEngaged} · workers=${profile.workers}→${pool} · cores=${cores}`,
    );
  }

  return height;
}

/**
 * Apply a pre-computed {@link RawScanResult} (the parallelizable per-tx scan, from {@link
 * scanRawTransaction} — run in-thread OR offloaded to the scan worker pool) into `state`. This is
 * the STATE-DEPENDENT half of folding (`findWithdrawnDepRefs` reads `state.deposits`), so it
 * stays strictly sequential on the main thread. Returns the same `state` ref unchanged when the tx
 * touches the wallet in no way (lets callers detect "nothing folded").
 */
function applyScanResult(state: WalletState, result: RawScanResult): WalletState {
  const {
    scanTx,
    rawTransaction,
    fee,
    ownedOutputs,
    ownedDeposits,
    inputKeyImages,
    depositInputs,
    timestamp,
  } = result;
  const candidateDeposits =
    ownedDeposits.length > 0 ? [...state.deposits, ...ownedDeposits] : state.deposits;
  const withdrawnRefs =
    depositInputs.length > 0 && isWithdrawShape(rawTransaction, depositInputs)
      ? findWithdrawnDepRefs(depositInputs, candidateDeposits, state.spentDepositRefs)
      : [];

  if (
    ownedOutputs.length === 0 &&
    inputKeyImages.length === 0 &&
    ownedDeposits.length === 0 &&
    withdrawnRefs.length === 0
  ) {
    return state;
  }

  let next = applyScannedTransaction(
    state,
    { hash: scanTx.hash, height: scanTx.height, timestamp },
    ownedOutputs,
    inputKeyImages,
    {
      ownedDeposits,
      depositInputs,
      rawTransaction,
      fee,
    },
  );
  if (ownedDeposits.length > 0 || withdrawnRefs.length > 0) {
    next = applyScannedDeposits(next, ownedDeposits, withdrawnRefs);
  }
  return next;
}
