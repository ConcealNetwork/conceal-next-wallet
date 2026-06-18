/**
 * Choose the remote-node fee destination. The fee address is supplied by the
 * (untrusted) remote node, so use it only when it's a valid CCX address; a
 * missing or malformed value falls back to the donation address. This bounds a
 * malicious/compromised node to the fixed remote-node fee — it can never redirect
 * a bogus, unparseable address into the transaction.
 *
 * Pure (no engine import) so it's unit-testable; the caller supplies the
 * address-validity check (Cn.decode_address).
 */
export function chooseRemoteFeeAddress(
  nodeFeeAddress: string | null | undefined,
  donationAddress: string,
  isValidAddress: (address: string) => boolean,
): string {
  return nodeFeeAddress && isValidAddress(nodeFeeAddress) ? nodeFeeAddress : donationAddress;
}
