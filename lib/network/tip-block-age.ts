/** Ignore elapsed wall time longer than this between polls (wallet locked, tab idle). */
const STALE_POLL_SEC = 120;

type TipAgeState = {
  nodeUrl: string;
  height: number;
  polledAt: number;
  ageSeconds: number;
};

let state: TipAgeState | null = null;

export function resetTipBlockAge(): void {
  state = null;
}

/**
 * Derive tip block age from successive `getinfo` height polls — no extra daemon RPC.
 * Resets to 0 when height advances; climbs while height is flat.
 */
export function trackTipBlockAge(networkHeight: number, nowSec: number, nodeUrl: string): number {
  if (state === null || state.nodeUrl !== nodeUrl) {
    state = { nodeUrl, height: networkHeight, polledAt: nowSec, ageSeconds: 0 };
    return 0;
  }

  const gap = nowSec - state.polledAt;
  if (gap > STALE_POLL_SEC) {
    state = { nodeUrl, height: networkHeight, polledAt: nowSec, ageSeconds: 0 };
    return 0;
  }

  if (networkHeight > state.height) {
    state.ageSeconds = 0;
  } else if (networkHeight === state.height && gap > 0) {
    state.ageSeconds += gap;
  } else {
    state.ageSeconds = 0;
  }

  state.height = networkHeight;
  state.polledAt = nowSec;
  return state.ageSeconds;
}
