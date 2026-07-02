/** Session snapshot for a nav +N badge: delta = current count − count at first sync / last ack. */

export type NavBadgeStore = {
  reset: () => void;
  recordAtSync: (count: number) => void;
  acknowledge: (count: number) => void;
  delta: (count: number) => number;
};

export function createNavBadgeStore(): NavBadgeStore {
  let countAtSync: number | null = null;
  return {
    reset() {
      countAtSync = null;
    },
    recordAtSync(count) {
      if (countAtSync === null) countAtSync = count;
    },
    acknowledge(count) {
      countAtSync = count;
    },
    delta(count) {
      if (countAtSync === null) return 0;
      return Math.max(0, count - countAtSync);
    },
  };
}

export const messageNavBadge = createNavBadgeStore();
export const pulseNavBadge = createNavBadgeStore();

export function resetNavBadges(): void {
  messageNavBadge.reset();
  pulseNavBadge.reset();
}
