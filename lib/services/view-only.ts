/**
 * View-only (watch-only) wallet guard, shared by the real and mock service
 * layers. A view-only wallet has no private spend key, so any operation that
 * builds a transaction must fail with a friendly, typed error instead of a
 * cryptic engine failure deep inside `createTx`.
 */

export class ViewOnlyWalletError extends Error {
  readonly code = "VIEW_ONLY_WALLET";
  constructor(message: string) {
    super(message);
    this.name = "ViewOnlyWalletError";
  }
}

/** Throws a `ViewOnlyWalletError` with `message` when `viewOnly` is true. */
export function assertCanSpend(viewOnly: boolean, message: string): void {
  if (viewOnly) throw new ViewOnlyWalletError(message);
}
