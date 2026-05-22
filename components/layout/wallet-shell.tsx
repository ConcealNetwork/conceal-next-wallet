import { Footer } from "@/components/layout/footer"
import { Sidebar } from "@/components/layout/sidebar"

export function WalletShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar />
      <main className="lg:pl-[260px]">
        <div className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6 lg:px-8">
          {children}
          <Footer />
        </div>
      </main>
    </div>
  )
}
