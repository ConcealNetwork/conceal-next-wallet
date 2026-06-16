/**
 * Per-transaction local notes are private metadata kept only on this device —
 * CryptoNote transactions carry no editable on-chain memo, so a note is a local
 * annotation the user attaches to a tx hash. The length is clamped so a runaway
 * paste can't bloat IndexedDB.
 */
export const MAX_TX_NOTE_LENGTH = 280;

/**
 * Normalize raw note input for storage: trim outer whitespace and clamp to
 * {@link MAX_TX_NOTE_LENGTH}. Returns `""` for empty/whitespace-only input — the
 * store treats `""` as "no note" and removes the key rather than storing a blank.
 */
export function normalizeTxNote(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length <= MAX_TX_NOTE_LENGTH) return trimmed;
  return trimmed.slice(0, MAX_TX_NOTE_LENGTH).trimEnd();
}
