/**
 * Durable outbound-transaction queue (#92) — a thin per-runtime wrapper around the SDK's
 * {@link createOutboundQueue}. A built+signed transaction is persisted (idempotent on hash)
 * BEFORE broadcast, so a dropped connection or app-close mid-send never loses the payment:
 * the drainer re-broadcasts due `pending` entries on every sync tick, with expiry and
 * input-reservation (so a queued output is never re-spent).
 *
 * The queue persists into the wallet's OWN keyspace (`rt.storage`, namespaced by the SDK
 * under `OUTBOUND_QUEUE_NAMESPACE`), so each wallet's queue is isolated — same multi-wallet
 * guarantee as the rest of the runtime. We do NOT use the SDK queue's `start()` polling; the
 * drainer is pumped from `syncOnce` instead, so there's no separate timer to tear down on
 * lock. A test runtime without `rt.storage` falls back to in-memory storage.
 *
 * SERIALIZATION (#92 review — GLM #3). The SDK `drainOnce`/`cancel`/`remove` take no lock,
 * but THREE call sites can hit one queue concurrently: `enqueueAndBroadcast`'s immediate
 * drain, the same send's follow-up `sync()`, and the foreground poll's `syncOnce`. Racing
 * drains can overwrite a `broadcast` result with a duplicate-relay `failed`, and a
 * cancel racing a drain can be silently re-persisted. So every MUTATING op (enqueue /
 * drainOnce / cancel / remove) runs through a per-queue promise chain; reads
 * (reservedKeyImages / list) stay lock-free — the only key images they could transiently
 * misreport are ones a serialized cancel/remove is dropping, which is conservative (an input
 * stays reserved a beat longer, never freed early), and the pending-store backstops selection.
 */
import { createMemoryStorage, createOutboundQueue, type OutboundQueue } from "conceal-wallet-sdk";
import { PENDING_TTL_MS } from "@/lib/services/real-sdk/pending-store";
import type { SdkRuntime } from "@/lib/services/real-sdk/runtime";

/**
 * No attempt cap — a transient outage must NOT flip a re-broadcastable payment to `failed`
 * (that defeats "never lose a payment"); time-bound it by {@link PENDING_TTL_MS} instead. A
 * genuinely rejected tx (daemon `status !== OK`) fails immediately regardless of this.
 */
const MAX_AGE_MS = PENDING_TTL_MS;

/** The serialized wrapper for a runtime, cached for the runtime's life. */
const wrappers = new WeakMap<SdkRuntime, OutboundQueue>();
/** Per-base-queue serialization chain (mutations run one-at-a-time). */
const chains = new WeakMap<OutboundQueue, Promise<unknown>>();

/** Run `fn` after any in-flight mutation on `base` settles (success OR failure). */
function serialized<T>(base: OutboundQueue, fn: (queue: OutboundQueue) => Promise<T>): Promise<T> {
  const prev = chains.get(base) ?? Promise.resolve();
  const run = prev.then(
    () => fn(base),
    () => fn(base),
  );
  // Park a swallowed copy as the new tail so a rejection doesn't poison the chain.
  chains.set(
    base,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}

/** The durable outbound queue for `rt`, created lazily and cached for the runtime's life. */
export function queueForRuntime(rt: SdkRuntime): OutboundQueue {
  const cached = wrappers.get(rt);
  if (cached) return cached;

  const base = createOutboundQueue({
    storage: rt.storage ?? createMemoryStorage(),
    daemon: rt.daemon,
    maxAgeMs: MAX_AGE_MS,
  });

  // Mutations serialize through `serialized(base, …)`; reads pass straight through.
  const wrapped: OutboundQueue = {
    enqueue: (built, opts) => serialized(base, (queue) => queue.enqueue(built, opts)),
    drainOnce: () => serialized(base, (queue) => queue.drainOnce()),
    cancel: (id) => serialized(base, (queue) => queue.cancel(id)),
    remove: (id) => serialized(base, (queue) => queue.remove(id)),
    reservedKeyImages: () => base.reservedKeyImages(),
    list: () => base.list(),
    start: (intervalMs) => base.start(intervalMs),
    stop: () => base.stop(),
  };
  wrappers.set(rt, wrapped);
  return wrapped;
}
