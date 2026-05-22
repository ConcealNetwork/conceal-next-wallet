import { WalletGuard } from "@/components/layout/guards"
import { SidebarCollapseProvider } from "@/components/layout/sidebar-collapse"
import { WalletShell } from "@/components/layout/wallet-shell"

export default function WalletLayout({ children }: { children: React.ReactNode }) {
  return (
    <WalletGuard>
      <SidebarCollapseProvider>
        <WalletShell>{children}</WalletShell>
      </SidebarCollapseProvider>
    </WalletGuard>
  )
}
