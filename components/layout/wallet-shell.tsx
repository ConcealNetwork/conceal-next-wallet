"use client"

import { Footer } from "@/components/layout/footer"
import { Sidebar } from "@/components/layout/sidebar"
import { useSidebarCollapse } from "@/components/layout/sidebar-collapse"
import { cn } from "@/lib/utils"

export function WalletShell({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebarCollapse()

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar />
      <main
        className={cn(
          "transition-[padding] duration-200 motion-reduce:transition-none",
          collapsed ? "lg:pl-[64px]" : "lg:pl-[260px]"
        )}
      >
        <div
          className={cn(
            "mx-auto w-full px-4 py-8 transition-[max-width] duration-200 motion-reduce:transition-none sm:px-6 lg:px-8",
            collapsed ? "max-w-[1360px]" : "max-w-[1200px]"
          )}
        >
          {children}
          <Footer />
        </div>
      </main>
    </div>
  )
}
