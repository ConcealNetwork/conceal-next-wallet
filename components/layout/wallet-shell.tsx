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
        <div className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6 lg:px-8">
          {children}
          <Footer />
        </div>
      </main>
    </div>
  )
}
