// Back-compat shim (#91 decoupling): CoinUri moved to @/lib/ui/coin-uri (a
// neutral module). Re-exported here so engine-internal callers (WalletRepository,
// wallet-operations) and any straggler keep working unchanged.
export { CoinUri } from "@/lib/ui/coin-uri";
