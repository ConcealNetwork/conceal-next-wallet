/** Nav badge: +N when received message count grows since first synced snapshot. */

let messageCountAtSync: number | null = null;

export function resetMessageNavBadge(): void {
  messageCountAtSync = null;
}

/** First time the wallet is synced this session, snapshot received message count. */
export function recordMessageCountAtSync(count: number): void {
  if (messageCountAtSync === null) {
    messageCountAtSync = count;
  }
}

export function acknowledgeMessages(count: number): void {
  messageCountAtSync = count;
}

export function messageNavBadgeDelta(count: number): number {
  if (messageCountAtSync === null) return 0;
  return Math.max(0, count - messageCountAtSync);
}
