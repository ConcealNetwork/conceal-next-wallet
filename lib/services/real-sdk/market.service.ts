/**
 * Market data is external (CoinGecko/CoinPaprika via `lib/market/*`) and has NO
 * wallet-engine dependency, so the SDK engine reuses the existing real-mode market
 * service verbatim rather than reimplementing it.
 */
export { realMarketService as realSdkMarketService } from "@/lib/services/real/market.service";
