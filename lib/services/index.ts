import { mockServices } from "@/lib/services/mock"
import type { WalletServices } from "@/lib/services/types"

export function getWalletServices(): WalletServices {
  const useMock = process.env.NEXT_PUBLIC_USE_MOCK !== "false"

  if (!useMock) {
    return mockServices
  }

  return mockServices
}

export const services = getWalletServices()
