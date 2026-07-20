/** True when a message's mempool TTL has elapsed (unix seconds). */
export function isTtlExpired(
  ttlExpiresAt: number | undefined,
  nowUnix = Math.floor(Date.now() / 1000),
): boolean {
  return typeof ttlExpiresAt === "number" && ttlExpiresAt > 0 && nowUnix >= ttlExpiresAt;
}

/**
 * React Query `refetchInterval` helper: ms until the soonest future TTL expiry
 * (plus a small buffer so the refetch lands after wall-clock expiry), or `false`
 * when no live TTL messages are present.
 */
export function ttlRefetchMs(
  messages: ReadonlyArray<{ ttlExpiresAt?: number }> | undefined,
  nowUnix = Math.floor(Date.now() / 1000),
): number | false {
  if (!messages?.length) return false;
  let soonest: number | null = null;
  for (const message of messages) {
    const at = message.ttlExpiresAt;
    if (typeof at === "number" && at > nowUnix) {
      if (soonest === null || at < soonest) soonest = at;
    }
  }
  if (soonest === null) return false;
  return Math.max(1000, (soonest - nowUnix) * 1000 + 250);
}
