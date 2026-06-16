import { COIN_UNIT_PLACES, DEPOSIT_MIN_TERM_BLOCK, DEPOSIT_RATE_V3 } from "@/lib/config/config";

/**
 * The legacy {@link InterestCalculator} (`lib/wallet-core/Interest.ts`) reads a
 * global `config` object, which is only injected onto `window` in real mode
 * (`public/config.js`, loaded by `ensureAllWalletLegacyLibs`). In mock mode —
 * the default — that global is absent, so the deposit interest calculator threw
 * `ReferenceError: config is not defined` and crashed the Deposits page.
 *
 * Import this module for its side effect to provide the numeric fields the
 * calculator reads. It never clobbers an already-present (real-mode) config.
 */
const globalConfig = globalThis as typeof globalThis & {
  config?: Record<string, unknown>;
};

if (typeof globalConfig.config === "undefined") {
  globalConfig.config = {
    coinUnitPlaces: COIN_UNIT_PLACES,
    depositRateV3: [...DEPOSIT_RATE_V3],
    depositMinTermBlock: DEPOSIT_MIN_TERM_BLOCK,
  };
}
