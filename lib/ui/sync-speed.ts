/** v1 wallet readSpeed values — controls parallel remote fetches in WalletWatchdog.setupWorkers(). */
export type SyncSpeed = "slow" | "medium" | "fast" | "fastest";

export const SYNC_SPEED_OPTIONS: SyncSpeed[] = ["slow", "medium", "fast", "fastest"];

const READ_SPEED_BY_SYNC: Record<SyncSpeed, number> = {
  slow: 100,
  medium: 50,
  fast: 10,
  fastest: 2,
};

export const SYNC_SPEED_LABELS: Record<SyncSpeed, string> = {
  slow: "Slow",
  medium: "Medium",
  fast: "Fast",
  fastest: "Fastest",
};

export function readSpeedFromSyncSpeed(speed: SyncSpeed): number {
  return READ_SPEED_BY_SYNC[speed];
}

export function syncSpeedFromReadSpeed(readSpeed: number): SyncSpeed {
  const match = SYNC_SPEED_OPTIONS.find((speed) => READ_SPEED_BY_SYNC[speed] === readSpeed);
  return match ?? "medium";
}
