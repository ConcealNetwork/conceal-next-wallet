import { WalletGuard } from "@/components/layout/guards"
import { WalletShell } from "@/components/layout/wallet-shell"

export default function WalletLayout({ children }: { children: React.ReactNode }) {
  return (
    <WalletGuard>
      <WalletShell>{children}</WalletShell>
    </WalletGuard>
  )
}
