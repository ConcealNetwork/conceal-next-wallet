export const queryKeys = {
  wallet: ["wallet"] as const,
  transactions: ["transactions"] as const,
  market: ["market"] as const,
  messages: ["messages"] as const,
  deposits: ["deposits"] as const,
  addressBook: ["address-book"] as const,
  network: ["network"] as const,
  settings: ["settings"] as const,
  optimizationStatus: ["optimization-status"] as const,
  /** Per-transaction local note, keyed by tx hash. */
  txNote: (hash: string) => ["tx-note", hash] as const,
};
