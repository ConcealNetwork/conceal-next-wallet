/**
 * Durable outbound-transaction queue (#92) — a thin per-runtime wrapper around the SDK's
 * {@link createOutboundQueue}. A built+signed transaction is persisted (idempotent on hash)
 * BEFORE broadcast, so a dropped connection or app-close mid-send never loses the payment:
 * the drainer re-broadcasts due `pending` entries on every sync tick, with transient-error
 * retry, expiry, and input-reservation (so a queued output is never re-spent).
 *
 * The queue persists into the wallet's OWN keyspace (`rt.storage`, namespaced by the SDK
 * under `OUTBOUND_QUEUE_NAMESPACE`), so each wallet's queue is isolated — same multi-wallet
 * guarantee as the rest of the runtime. We do NOT use the SDK queue's `start()` polling;
 * the drainer is pumped from `syncOnce` instead, so there's no separate timer to tear down
 * on lock. A test runtime without `rt.storage` falls back to in-memory storage.
 */
import { createMemoryStorage, createOutboundQueue, type OutboundQueue } from "conceal-wallet-sdk";
import { PENDING_TTL_MS } from "@/lib/services/real-sdk/pending-store";
import type { SdkRuntime } from "@/lib/services/real-sdk/runtime";

/** Cap on transient-error retries before an entry fails as `"rejected"`. */
const MAX_ATTEMPTS = 12;
/** An entry older than this on a drain expires (fails) — aligned with the pending TTL. */
const MAX_AGE_MS = PENDING_TTL_MS;

/** One queue instance per runtime object (a fresh unlock = a fresh rt = reads its storage). */
const queues = new WeakMap<SdkRuntime, OutboundQueue>();

/** The durable outbound queue for `rt`, created lazily and cached for the runtime's life. */
export function queueForRuntime(rt: SdkRuntime): OutboundQueue {
  let queue = queues.get(rt);
  if (!queue) {
    queue = createOutboundQueue({
      storage: rt.storage ?? createMemoryStorage(),
      daemon: rt.daemon,
      maxAttempts: MAX_ATTEMPTS,
      maxAgeMs: MAX_AGE_MS,
    });
    queues.set(rt, queue);
  }
  return queue;
}
