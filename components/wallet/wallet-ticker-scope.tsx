"use client";

import { WalletTickerRefresh } from "@/lib/ui/ticker-preference-provider";

export function WalletTickerScope({ children }: { children: React.ReactNode }) {
  return <WalletTickerRefresh>{children}</WalletTickerRefresh>;
}
