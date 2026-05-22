import { Footer } from "@/components/layout/footer"
import { OnboardingGuard } from "@/components/layout/guards"

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <OnboardingGuard>
      <main className="min-h-screen bg-background px-4 py-8 text-foreground">
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl flex-col">
          <div className="flex-1">{children}</div>
          <Footer />
        </div>
      </main>
    </OnboardingGuard>
  )
}
