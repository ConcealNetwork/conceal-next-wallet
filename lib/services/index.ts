import { env } from "@/lib/env";
import { mockServices } from "@/lib/services/mock";
import type { WalletServices } from "@/lib/services/types";

let cachedRealServices: WalletServices | null = null;

export function getWalletServices(): WalletServices {
  if (env.useMockWallet) {
    return mockServices;
  }
  if (!cachedRealServices) {
    // Lazy load so mock mode / tests never pull wallet-core at module init.
    cachedRealServices = require("@/lib/services/real").realServices as WalletServices;
  }
  return cachedRealServices;
}

export const services = getWalletServices();
