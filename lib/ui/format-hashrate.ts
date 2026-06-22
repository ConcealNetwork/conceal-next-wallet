/** Format a hashrate (hashes/sec) with an SI-ish unit — shared by the Network page + rail. */
export function formatHashrate(hps: number): string {
  if (hps >= 1e9) return `${(hps / 1e9).toFixed(2)} GH/s`;
  if (hps >= 1e6) return `${(hps / 1e6).toFixed(2)} MH/s`;
  if (hps >= 1e3) return `${(hps / 1e3).toFixed(2)} kH/s`;
  return `${Math.round(hps)} H/s`;
}
