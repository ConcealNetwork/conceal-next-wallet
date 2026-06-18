import { env } from "@/lib/env";
import { mockServices } from "@/lib/services/mock";
import type { WalletServices } from "@/lib/services/types";

let cachedRealServices: WalletServices | null = null;

export function getWalletServices(): WalletServices {
  if (env.useMockWallet) {
    return mockServices;
  }
  if (!cachedRealServices) {
    // Lazy load so mock mode / tests never pull either real engine at module init.
    // `walletEngine === "sdk"` selects the conceal-wallet-sdk engine; otherwise the
    // legacy wallet-core engine. Each is self-contained so only one is ever loaded.
    cachedRealServices = (
      env.walletEngine === "sdk"
        ? require("@/lib/services/real-sdk")
        : require("@/lib/services/real")
    ).realServices as WalletServices;
  }
  return cachedRealServices;
}

export const services = getWalletServices();
