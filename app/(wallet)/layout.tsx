import { WalletGuard } from "@/components/layout/guards";
import { SidebarCollapseProvider } from "@/components/layout/sidebar-collapse";
import { WalletShell } from "@/components/layout/wallet-shell";
import { WalletTickerScope } from "@/components/wallet/wallet-ticker-scope";

export default function WalletLayout({ children }: { children: React.ReactNode }) {
  return (
    <WalletGuard>
      <SidebarCollapseProvider>
        <WalletShell>
          <WalletTickerScope>{children}</WalletTickerScope>
        </WalletShell>
      </SidebarCollapseProvider>
    </WalletGuard>
  );
}
